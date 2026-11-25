import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Contract, getAddress, isAddress, parseEther, toQuantity, verifyMessage } from 'ethers';
import { assertBytes32, parseVerificationPackage } from '../shared/credential.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const addressOf = value => {
  if (!isAddress(value)) throw fail('Enter a valid wallet address.');
  return getAddress(value).toLowerCase();
};
const textOf = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(`${label} is required and must not exceed ${max} characters.`);
  return value.trim();
};

export async function startApi({ provider, config, store, indexer, port = 8787, frontendPort = 5173 }) {
  const sessions = new Map();
  const challenges = new Map();
  const funding = new Map();
  const registry = new Contract(config.contractAddress, config.abi, provider);
  const origins = new Set([`http://127.0.0.1:${frontendPort}`, `http://localhost:${frontendPort}`]);

  function session(request, required = true) {
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const found = sessions.get(token);
    if (found && found.expires > Date.now()) return found.address;
    if (token) sessions.delete(token);
    if (required || token) throw fail('Your records session has expired. Sign in again with your wallet.', 401);
    return null;
  }
  async function admin(address) {
    if (!await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), address)) throw fail('Only an administrator can perform this action.', 403);
  }

  async function body(request) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw fail('A JSON request is required.', 415);
    const chunks = []; let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 64 * 1024) throw fail('The request is too large.', 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
    catch { throw fail('Invalid JSON format.'); }
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (value, status = 200) => { response.writeHead(status); response.end(JSON.stringify(value)); };
    try {
      const host = new URL(`http://${request.headers.host || 'invalid'}`).hostname;
      if (!['127.0.0.1', 'localhost'].includes(host)) throw fail('Only local access is allowed.', 403);
      if (request.headers.origin && !origins.has(request.headers.origin)) throw fail('This website origin is not allowed.', 403);
      const url = new URL(request.url, 'http://127.0.0.1');
      const route = `${request.method} ${url.pathname}`;

      if (route === 'GET /api/health') {
        if (await registry.deploymentId() !== config.deploymentId) throw fail('The contract deployment does not match.', 503);
        return send({ version: 2, persistence: true, deploymentId: config.deploymentId });
      }
      if (route === 'POST /api/auth/challenge') {
        const { address } = await body(request);
        const account = addressOf(address);
        const now = Date.now();
        for (const [key,value] of challenges) if (value.expires < now) challenges.delete(key);
        if (challenges.size > 1000) throw fail('Too many requests. Please try again later.', 429);
        const id = randomBytes(24).toString('hex');
        const message = [
          'VeriLedger V2 local records sign-in', `Website: http://127.0.0.1:${frontendPort}`,
          `Wallet: ${account}`, `Chain: ${config.chainId}`, `Contract: ${config.contractAddress}`,
          `Deployment: ${config.deploymentId}`, `Challenge: ${id}`, `Expires: ${new Date(now + 300000).toISOString()}`,
          'Purpose: sign in to local records management. No transaction or asset transfer is authorised.',
        ].join('\n');
        challenges.set(id, { address: account, message, expires: now + 300000 });
        return send({ id, message });
      }
      if (route === 'POST /api/auth/login') {
        const { id, signature } = await body(request);
        const challenge = challenges.get(id); challenges.delete(id);
        if (!challenge || challenge.expires <= Date.now()) throw fail('The sign-in challenge has expired or has already been used. Please sign in again.', 401);
        let recovered;
        try { recovered = verifyMessage(challenge.message, signature).toLowerCase(); }
        catch { throw fail('Could not verify the wallet signature.', 401); }
        if (recovered !== challenge.address) throw fail('The signing wallet does not match the requested address.', 401);
        const token = randomBytes(32).toString('base64url');
        const expires = Date.now() + 30 * 60 * 1000;
        sessions.set(token, { address: recovered, expires });
        return send({ token, address: recovered, expires });
      }
      if (route === 'POST /api/auth/logout') {
        await body(request);
        sessions.delete(request.headers.authorization?.replace(/^Bearer /, ''));
        return send({ ok: true });
      }
      if (route === 'GET /api/profiles') {
        const profiles = store.db.prepare('SELECT * FROM profiles ORDER BY name').all();
        const role = await registry.ISSUER_ROLE();
        const granted = await registry.queryFilter(registry.filters.RoleGranted(role), config.deploymentBlock);
        const addresses = [...new Set([...profiles.map(row => row.address), ...granted.map(log => log.args.account.toLowerCase())])];
        return send(await Promise.all(addresses.map(async address => ({
          address, ...(profiles.find(row => row.address === address) || { name: 'Organisation name not registered', source: 'unknown' }),
          authorised: await registry.hasRole(role, address),
        }))));
      }
      if (route === 'POST /api/profiles') {
        const actor = session(request); await admin(actor);
        const value = await body(request);
        const address = addressOf(value.address);
        const name = textOf(value.name, 80, 'Organisation name');
        if (value.reviewed !== true) throw fail('Confirm that you have checked the organisation identity off-chain.');
        if (!await registry.hasRole(await registry.ISSUER_ROLE(), address)) throw fail('Authorise this issuer address on-chain before recording its name.');
        store.saveProfile(address, name, actor);
        return send({ ok: true });
      }
      if (route === 'GET /api/events') {
        await indexer.sync();
        return send(indexer.events());
      }
      if (route === 'GET /api/credentials') {
        const account = session(request, false);
        const query = (url.searchParams.get('query') || '').slice(0, 150);
        const issuer = url.searchParams.get('issuer');
        const status = url.searchParams.get('status') || '';
        if (issuer) addressOf(issuer);
        if (!['', 'VALID', 'REVOKED', 'DRAFT'].includes(status)) throw fail('Invalid status filter.');
        const records = await indexer.records({ account, issuer: issuer?.toLowerCase(), status, query });
        const page = Math.max(1, Math.min(100000, Number(url.searchParams.get('page')) || 1));
        return send({ records: records.slice((page - 1) * 10, page * 10), total: records.length, page, pageSize: 10 });
      }
      if (route === 'POST /api/vault') {
        const actor = session(request);
        const value = await body(request);
        const verification = parseVerificationPackage(value.verification, config);
        const commitment = assertBytes32(value.commitment, 'Commitment');
        const title = textOf(value.title, 120, 'Credential title');
        const filename = textOf(value.filename, 255, 'File name');
        const record = await registry.getCredential(verification.credentialId);
        if (record.exists && (record.issuer.toLowerCase() !== actor || record.commitment !== commitment)) throw fail('The on-chain issuer or commitment does not match this backup.', 403);
        if (!record.exists && !await registry.hasRole(await registry.ISSUER_ROLE(), actor)) throw fail('Only authorised issuers can back up pending registrations.', 403);
        store.savePackage({ credentialId: verification.credentialId, owner: actor, commitment, title, filename, verification });
        return send({ ok: true, credentialId: verification.credentialId });
      }
      const exportMatch = url.pathname.match(/^\/api\/credentials\/(0x[0-9a-fA-F]{64})\/package$/);
      if (request.method === 'GET' && exportMatch) {
        const actor = session(request);
        const id = exportMatch[1].toLowerCase();
        const saved = store.db.prepare('SELECT * FROM vault WHERE credential_id = ?').get(id);
        if (!saved) throw fail('No local verification backup exists for this credential.', 404);
        if (saved.owner !== actor) await admin(actor);
        const record = await registry.getCredential(id);
        if (record.exists && (record.issuer.toLowerCase() !== saved.owner || record.commitment !== saved.commitment)) throw fail('Export rejected: the backup does not match the current on-chain record.', 409);
        return send({ verification: store.decrypt(saved), commitment: saved.commitment, registered: record.exists });
      }
      if (route === 'POST /api/wallet/fund') {
        const actor = session(request); await body(request);
        if ((funding.get(actor) || 0) > Date.now() - 60000) throw fail('Test funds can be requested once per minute. Please try again later.', 429);
        if (await provider.getBalance(actor) < parseEther('1')) {
          await provider.send('anvil_setBalance', [actor, toQuantity(parseEther('10'))]);
        }
        funding.set(actor, Date.now());
        return send({ ok: true, balance: String(await provider.getBalance(actor)) });
      }
      throw fail('Endpoint not found.', 404);
    } catch (error) {
      // Do not expose stack traces, encryption errors or session data to clients.
      send({ error: error.status ? error.message : 'The action could not be completed. Check your input, chain connection and local data.' }, error.status || 400);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [token, value] of sessions) if (value.expires < now) sessions.delete(token);
    for (const [id, value] of challenges) if (value.expires < now) challenges.delete(id);
  }, 60000);
  timer.unref();
  return { server, close: async () => {
    clearInterval(timer); sessions.clear(); challenges.clear();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
  } };
}

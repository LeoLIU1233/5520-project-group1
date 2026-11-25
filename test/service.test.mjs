import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Contract, Wallet } from 'ethers';
import { availablePort } from '../scripts/runtime.mjs';
import { openService } from '../server/service.mjs';
import { computeCommitment, createVerificationPackage, hashDocument, newCredentialId, newSalt } from '../shared/credential.mjs';

test('V2 persistence, signed sessions and private verification backup', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ftec-v2-test-'));
  const options = { directory, rpcPort: await availablePort(), apiPort: await availablePort(), publish: false };
  let service;
  const url = `http://127.0.0.1:${options.apiPort}`;
  const request = async (route, { body, token, origin, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(url + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const login = async signer => {
    const address = await signer.getAddress();
    const { value: challenge } = await request('/api/auth/challenge', { body: { address } });
    const signature = await signer.signMessage(challenge.message);
    const result = await request('/api/auth/login', { body: { id: challenge.id, signature } });
    assert.equal(result.status, 200);
    return result.value.token;
  };
  try {
    service = await openService(options);
    let config = service.config;
    let registry = new Contract(config.contractAddress, config.abi, service.provider);
    const issuer = await service.provider.getSigner(1);
    const admin = await service.provider.getSigner(0);
    let issuerToken = await login(issuer), adminToken = await login(admin);
    const account = (await issuer.getAddress()).toLowerCase();
    const fileHash = hashDocument(new TextEncoder().encode('%PDF-1.7\nV2 fixture\n%%EOF'));
    const salt = newSalt(), credentialId = newCredentialId();
    const commitment = computeCommitment(fileHash, salt);
    const verification = createVerificationPackage({ ...config, credentialId, salt });

    await t.test('rejects foreign webpage origins, missing sessions and replayed challenges', async () => {
      assert.equal((await request('/api/auth/challenge', { body: { address: account }, origin: 'https://example.com' })).status, 403);
      assert.equal((await request('/api/vault', { body: {} })).status, 401);
      const { value: challenge } = await request('/api/auth/challenge', { body: { address: account } });
      const signature = await issuer.signMessage(challenge.message);
      assert.equal((await request('/api/auth/login', { body: { id: challenge.id, signature } })).status, 200);
      assert.equal((await request('/api/auth/login', { body: { id: challenge.id, signature } })).status, 401);
      const { value: another } = await request('/api/auth/challenge', { body: { address: account } });
      assert.equal((await request('/api/auth/login', { body: { id: another.id, signature: await admin.signMessage(another.message) } })).status, 401);
    });
    await t.test('saves an encrypted backup before issuance and keeps drafts private', async () => {
      const saved = await request('/api/vault', { token: issuerToken, body: { verification, commitment, title: 'V2 private credential title', filename: 'private-name.pdf' } });
      assert.equal(saved.status, 200);
      const row = service.store.db.prepare('SELECT * FROM vault WHERE credential_id = ?').get(credentialId);
      assert.ok(!row.encrypted.includes(salt));
      assert.deepEqual(service.store.decrypt(row), verification);
      assert.ok(!(await request('/api/credentials')).value.records.some(record => record.credentialId === credentialId));
      const own = (await request('/api/credentials', { token: issuerToken })).value.records.find(record => record.credentialId === credentialId);
      assert.equal(own.status, 'DRAFT'); assert.equal(own.canResume, true);
      assert.equal((await request('/api/vault', { token: issuerToken, body: { verification: { ...verification, salt: newSalt() }, commitment, title: 'changed', filename: 'changed.pdf' } })).status, 400);
    });
    await t.test('registered records are public but title, filename and salt are private', async () => {
      await (await registry.connect(issuer).issueCredential(credentialId, commitment)).wait();
      const publicRecord = (await request('/api/credentials')).value.records.find(record => record.credentialId === credentialId);
      assert.equal(publicRecord.status, 'VALID'); assert.equal(publicRecord.filename, ''); assert.notEqual(publicRecord.title, 'V2 private credential title');
      assert.equal((await request(`/api/credentials/${credentialId}/package`)).status, 401);
      const competitor = await service.provider.getSigner(2);
      await (await registry.connect(admin).authorizeIssuer(await competitor.getAddress())).wait();
      const competitorToken = await login(competitor);
      assert.equal((await request(`/api/credentials/${credentialId}/package`, { token: competitorToken })).status, 403);
      assert.deepEqual((await request(`/api/credentials/${credentialId}/package`, { token: adminToken })).value.verification, verification);
    });
    await t.test('only administrators can bind organisation names after on-chain authorisation', async () => {
      const body = { address: account, name: 'Administrator-reviewed sample issuer', reviewed: true };
      assert.equal((await request('/api/profiles', { token: issuerToken, body })).status, 403);
      assert.equal((await request('/api/profiles', { token: adminToken, body: { ...body, reviewed: false } })).status, 400);
      assert.equal((await request('/api/profiles', { token: adminToken, body })).status, 200);
      assert.equal((await request('/api/profiles')).value.find(profile => profile.address === account).name, body.name);
    });
    await t.test('independent wallets can sign in, get local funds and send signed transactions', async () => {
      const wallet = Wallet.createRandom().connect(service.provider);
      const walletToken = await login(wallet);
      assert.equal((await request('/api/wallet/fund', { token: walletToken, body: {} })).status, 200);
      await (await registry.connect(admin).authorizeIssuer(wallet.address)).wait();
      const id = newCredentialId();
      await (await registry.connect(wallet).issueCredential(id, commitment)).wait();
      assert.equal(await registry.verifyCredential(id, commitment), 0n);
    });
    await t.test('search, issuer and status filters return the correct records and history', async () => {
      await (await registry.connect(issuer).revokeCredential(credentialId)).wait();
      const result = await request(`/api/credentials?query=${encodeURIComponent('V2 private')}&issuer=${account}&status=REVOKED`, { token: issuerToken });
      assert.equal(result.value.total, 1);
      assert.equal(result.value.records[0].events.length, 2);
      assert.ok(result.value.records[0].events.every(event => BigInt(event.gas_used) > 0n));
    });
    await t.test('an ID collision cannot reveal the original draft metadata to another issuer', async () => {
      const id = newCredentialId();
      const pkg = createVerificationPackage({ ...config, credentialId: id, salt: newSalt() });
      assert.equal((await request('/api/vault', { token: issuerToken, body: { verification: pkg, commitment, title: 'Private draft title', filename: 'secret-draft.pdf' } })).status, 200);
      const competingIssuer = await service.provider.getSigner(2);
      await (await registry.connect(competingIssuer).issueCredential(id, newSalt())).wait();
      const competitorToken = await login(competingIssuer);
      const record = (await request(`/api/credentials?query=${id}`, { token: competitorToken })).value.records[0];
      assert.equal(record.title, 'Credential record'); assert.equal(record.filename, ''); assert.equal(record.canExport, false);
      assert.equal((await request(`/api/credentials/${id}/package`, { token: competitorToken })).status, 403);
      assert.equal((await request(`/api/credentials/${id}/package`, { token: adminToken })).status, 409);
    });
    await t.test('full shutdown and restart preserves contract, revocation, profiles, backup and old packages', async () => {
      const previous = config.deploymentId;
      await service.close();
      service = await openService(options); config = service.config;
      registry = new Contract(config.contractAddress, config.abi, service.provider);
      assert.equal(config.deploymentId, previous); assert.equal(service.resumed, true);
      assert.equal(await registry.verifyCredential(credentialId, commitment), 2n);
      assert.ok(await service.provider.getTransactionReceipt(config.deploymentTxHash));
      assert.ok((await request('/api/events')).value.some(event => event.credential_id === credentialId));
      assert.equal((await request(`/api/credentials/${credentialId}/package`, { token: issuerToken })).status, 401);
      issuerToken = await login(await service.provider.getSigner(1));
      assert.deepEqual((await request(`/api/credentials/${credentialId}/package`, { token: issuerToken })).value.verification, verification);
      assert.equal((await request('/api/profiles')).value.find(profile => profile.address === account).name, 'Administrator-reviewed sample issuer');
      assert.ok((await readFile(path.join(directory, 'chain.json'))).length > 0);
    });
  } finally { await service?.close(); await rm(directory, { recursive: true, force: true }); }
});

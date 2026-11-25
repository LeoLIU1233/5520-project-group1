import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ARTIFACT = path.join(ROOT, 'artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json');
export const PUBLIC = path.join(ROOT, 'frontend/public');
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function runNode(args, options = {}) {
  return spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', ...options });
}

export function finished(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Process exited (${code ?? signal}).`)));
  });
}

export async function compile() {
  await finished(runNode(['node_modules/hardhat/dist/src/cli.js', 'compile']));
}

export async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function assertPortFree(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Close the previous demo before starting another one.`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}

export async function startChain(port) {
  await assertPortFree(port);
  const child = runNode(['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  let spawnError;
  child.once('error', error => { spawnError = error; });
  child.stdout.on('data', () => {}); // Hardhat prints known development private keys; do not echo them.
  child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-3000); });
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 150; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Local chain could not start. ${diagnostics}`);
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
          signal: AbortSignal.timeout(500),
        });
        if ((await response.json()).result === '0x7a69') return { child, rpcUrl };
      } catch { /* The child has not started listening yet. */ }
      await sleep(200);
    }
    throw new Error(`Timed out waiting for local chain. ${diagnostics}`);
  } catch (error) { child.kill('SIGTERM'); throw error; }
}

export async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  let timer;
  await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); })]);
  clearTimeout(timer);
}

export async function artifact() { return JSON.parse(await readFile(ARTIFACT, 'utf8')); }

export function assertLocalRpc(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('This classroom prototype only deploys to a loopback HTTP test network.');
  }
}

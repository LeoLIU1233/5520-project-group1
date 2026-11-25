import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, assertPortFree, sleep, stopChild } from './runtime.mjs';

const require = createRequire(import.meta.url);
export function anvilBinary() {
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const resolver = createRequire(require.resolve('@foundry-rs/anvil/package.json'));
  return path.join(path.dirname(resolver.resolve(`@foundry-rs/anvil-${process.platform}-${arch}/package.json`)), 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil');
}
export async function startPersistentChain(directory, port = 8545) {
  await assertPortFree(port);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const child = spawn(anvilBinary(), [
    '--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'shanghai',
    '--state', path.join(directory, 'chain.json'), '--state-interval', '1', '--preserve-historical-states', '--silent',
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  let diagnostic = '', spawnError;
  child.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes).slice(-2000); });
  child.once('error', error => { spawnError = error; });
  const rpcUrl = `http://127.0.0.1:${port}`;
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`The persistent test chain could not start: ${diagnostic}`);
      try {
        const result = await fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(500),
        });
        if ((await result.json()).result === '0x7a69') return { child, rpcUrl };
      } catch { /* Wait for the native node to listen. */ }
      await sleep(200);
    }
    throw new Error('Timed out waiting for the persistent test chain.');
  } catch (error) { await stopChild(child); throw error; }
}

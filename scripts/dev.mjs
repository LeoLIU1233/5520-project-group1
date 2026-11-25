import { writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, assertPortFree, compile, finished, runNode, stopChild } from './runtime.mjs';
import { openService } from '../server/service.mjs';

process.umask(0o077);
let service, web, closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  console.log('\nSaving chain state and local records. Please wait…');
  try { await stopChild(web); await service?.close(); }
  catch (error) { console.error('An error occurred while saving: ', error.message); code = 1; }
  await unlink(path.join(ROOT, '.local/dev.pid')).catch(() => {});
  console.log('Stopped. Your records will be restored on the next normal launch.');
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

try {
  await assertPortFree(5173);
  await assertPortFree(8545);
  await assertPortFree(8787);
  console.log('Preparing VeriLedger V2 (English)…');
  await compile();
  await finished(runNode(['scripts/build-guide.mjs']));
  if (!closing) {
    service = await openService();
    await mkdir(path.join(ROOT, '.local'), { recursive: true });
    await writeFile(path.join(ROOT, '.local/dev.pid'), String(process.pid));
    console.log(service.resumed ? 'Restored the existing contract, credentials and revocation records.' : 'Created the persistent test chain with valid and revoked samples.');
    console.log('Website: http://127.0.0.1:5173');
    console.log('Keep this window open. Press Ctrl+C to stop normally and save your data.');
    service.chain.once('exit', () => { if (!closing) { console.error('The local chain stopped.'); shutdown(1); } });
    web = runNode(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']);
    await finished(web);
    await shutdown();
  }
} catch (error) { if (!closing) { console.error(error.message); await shutdown(1); } }

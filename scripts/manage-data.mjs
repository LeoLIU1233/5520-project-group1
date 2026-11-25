import { access, cp, mkdir, rename } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { ROOT, assertPortFree } from './runtime.mjs';

const command = process.argv[2];
try {
  if (!['backup','reset'].includes(command)) throw new Error('Usage: node scripts/manage-data.mjs backup or reset');
  for (const port of [5173,8545,8787]) await assertPortFree(port);
  const source = path.join(ROOT, 'data');
  try { await access(source); } catch { throw new Error('No V2 data exists yet. Launch the project normally first.'); }
  if (command === 'reset') {
    console.log('Reset archives the current chain, credentials and verification backups. The next launch creates a new environment.');
    console.log('A normal shutdown and restart do not require a reset. The Chinese version is not affected.');
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await reader.question('To confirm the reset, type RESET ENGLISH: '); reader.close();
    if (answer.trim() !== 'RESET ENGLISH') { console.log('Reset cancelled. Your data has not changed.'); process.exit(0); }
  }
  const parent = path.join(ROOT, 'backups');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const destination = path.join(parent, `${command}-${new Date().toISOString().replaceAll(':','-')}`);
  if (command === 'reset') await rename(source, destination);
  else await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  console.log(command === 'reset' ? 'Previous data archived. The next launch will create a new environment.' : 'Complete data backup created.');
  console.log(`Backup location: ${destination}`);
  console.log('This backup contains chain state, records and the decryption key. Keep the complete folder secure.');
} catch (error) { console.error(error.message); process.exitCode = 1; }

import { mkdir, readFile, writeFile, copyFile, access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Contract, JsonRpcProvider, keccak256 } from 'ethers';
import { ROOT, PUBLIC, assertPortFree, stopChild } from '../scripts/runtime.mjs';
import { startPersistentChain } from '../scripts/persistent-chain.mjs';
import { deploy } from '../scripts/deploy.mjs';
import { Store } from './store.mjs';
import { Indexer } from './indexer.mjs';
import { startApi } from './api.mjs';

async function exists(file) { try { await access(file); return true; } catch { return false; } }
export async function openService({ directory = path.join(ROOT, 'data'), rpcPort = 8545, apiPort = 8787, frontendPort = 5173, publish = true } = {}) {
  await assertPortFree(apiPort);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, '.session.lock');
  if (await exists(lock)) {
    const owner = Number(await readFile(lock, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner < 1) throw new Error('The instance lock is damaged. Check the data directory.');
    try { process.kill(owner, 0); throw new Error('This data directory is already in use. Stop its existing launch window first.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    await unlink(lock);
  }
  await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  let chain, provider, store, api, timer, indexer, closing = false;
  const close = async () => {
    if (closing) return;
    closing = true; clearInterval(timer);
    try { await api?.close(); if (indexer) await indexer.sync(); }
    finally {
      try { store?.close(); } finally {
        provider?.destroy(); await stopChild(chain); await unlink(lock).catch(() => {});
      }
    }
  };
  try {
    const started = await startPersistentChain(directory, rpcPort);
    chain = started.child;
    const rpcUrl = started.rpcUrl;
    provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    provider.pollingInterval = 100;
    const deploymentFile = path.join(directory, 'deployment.json');
    let config;
    const resumed = await exists(deploymentFile);
    if (resumed) {
      config = JSON.parse(await readFile(deploymentFile, 'utf8'));
      config.rpcUrl = rpcUrl;
      const registry = new Contract(config.contractAddress, config.abi, provider);
      const code = await provider.getCode(config.contractAddress);
      if (code === '0x' || await registry.deploymentId() !== config.deploymentId || keccak256(code) !== config.codeHash) {
        throw new Error('Chain state and deployment information do not match. Restore a complete data backup; do not delete individual files.');
      }
    } else {
      if (await exists(path.join(directory, 'registry.sqlite'))) throw new Error('Deployment information is missing. Restore a complete data backup.');
      config = await deploy(rpcUrl, { write: false });
      config.codeHash = keccak256(await provider.getCode(config.contractAddress));
      await writeFile(deploymentFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
      await mkdir(path.join(directory, 'samples'), { recursive: true, mode: 0o700 });
      for (const sample of config.samples) await writeFile(path.join(directory, `samples/${sample.slug}.json`), JSON.stringify(sample.verification, null, 2) + '\n', { mode: 0o600 });
    }
    config.version = 2;
    store = new Store(directory);
    const registry = new Contract(config.contractAddress, config.abi, provider);
    for (const sample of config.samples) {
      if (!store.db.prepare('SELECT credential_id FROM vault WHERE credential_id = ?').get(sample.credentialId)) {
        const record = await registry.getCredential(sample.credentialId);
        store.savePackage({ credentialId: sample.credentialId, owner: record.issuer.toLowerCase(), commitment: record.commitment,
          title: sample.slug === 'active' ? 'Valid sample credential' : 'Revoked sample credential', filename: 'certificate-original.pdf', verification: sample.verification });
      }
    }
    for (const account of config.demoAccounts.slice(1, 3)) {
      if (!store.db.prepare('SELECT address FROM profiles WHERE address = ?').get(account.address.toLowerCase())) {
        store.saveProfile(account.address.toLowerCase(), account.organization, config.demoAccounts[0].address.toLowerCase(), 'classroom-sample');
      }
    }
    indexer = new Indexer(provider, config, store);
    await indexer.sync();
    api = await startApi({ provider, config, store, indexer, port: apiPort, frontendPort });
    timer = setInterval(() => indexer.sync().catch(error => console.error('Event indexing will retry: ', error.message)), 1000);
    timer.unref();
    if (publish) {
      await mkdir(PUBLIC, { recursive: true });
      await writeFile(path.join(PUBLIC, 'deployment.json'), JSON.stringify(config, null, 2) + '\n');
      for (const sample of config.samples) await copyFile(path.join(directory, `samples/${sample.slug}.json`), path.join(PUBLIC, `samples/${sample.slug}.json`));
    }
    return { config, provider, store, indexer, api, chain, close, resumed };
  } catch (error) { await close(); throw error; }
}

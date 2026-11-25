import { availablePort, compile, finished, runNode, startChain, stopChild } from './runtime.mjs';

let chain;
try {
  await compile();
  const { child, rpcUrl } = await startChain(await availablePort());
  chain = child;
  await finished(runNode(['--test', 'test/hashing.test.mjs', 'test/registry.test.mjs', 'test/service.test.mjs'], {
    env: { ...process.env, TEST_RPC_URL: rpcUrl },
  }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await stopChild(chain); }

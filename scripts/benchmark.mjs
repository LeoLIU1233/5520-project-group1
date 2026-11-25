import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { ROOT, PUBLIC, artifact, availablePort, compile, startChain, stopChild } from './runtime.mjs';
import { hashDocument, computeCommitment, newSalt, newCredentialId } from '../shared/credential.mjs';

let chain, provider;
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
try {
  await compile();
  const started = await startChain(await availablePort()); chain = started.child;
  provider = new JsonRpcProvider(started.rpcUrl, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 50;
  const admin = await provider.getSigner(0), issuer = await provider.getSigner(1);
  const compiled = await artifact();
  const registry = await new ContractFactory(compiled.abi, compiled.bytecode, admin).deploy(await admin.getAddress(), newSalt());
  await registry.waitForDeployment(); await (await registry.authorizeIssuer(await issuer.getAddress())).wait();
  const warmupId = newCredentialId();
  await (await registry.connect(issuer).issueCredential(warmupId, newSalt())).wait();
  await (await registry.connect(issuer).revokeCredential(warmupId)).wait();
  const sizes = [];
  for (const bytes of [1024, 100*1024, 1024*1024, 5*1024*1024]) {
    // Synthetic bytes isolate hash cost. These are not presented as renderable certificates.
    const data = new Uint8Array(bytes); data.set(new TextEncoder().encode('%PDF-1.7\nSynthetic benchmark input\n'));
    const hashing = [];
    let hash;
    for (let attempt = 0; attempt < 5; attempt++) {
      const start = performance.now(); hash = hashDocument(data); hashing.push(performance.now() - start);
    }
    const id = newCredentialId(), commitment = computeCommitment(hash, newSalt());
    const issued = await (await registry.connect(issuer).issueCredential(id, commitment)).wait();
    const queries = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const start = performance.now(); await registry.verifyCredential(id, commitment); queries.push(performance.now() - start);
    }
    const revoked = await (await registry.connect(issuer).revokeCredential(id)).wait();
    sizes.push({ bytes, hashMedianMs: Number(median(hashing).toFixed(3)), queryMedianMs: Number(median(queries).toFixed(3)), issueGas: String(issued.gasUsed), revokeGas: String(revoked.gasUsed) });
  }
  const original = new Uint8Array(await readFile(path.join(PUBLIC,'samples/certificate-original.pdf')));
  const altered = new Uint8Array(await readFile(path.join(PUBLIC,'samples/certificate-altered.pdf')));
  const salt = newSalt(), id = newCredentialId(), commitment = computeCommitment(hashDocument(original),salt);
  await (await registry.connect(issuer).issueCredential(id,commitment)).wait();
  const cases = [];
  for (const [name, credentialId, candidate, expected] of [
    ['Original PDF',id,commitment,0],['PDF with altered dates',id,computeCommitment(hashDocument(altered),salt),1],
    ['Incorrect salt',id,computeCommitment(hashDocument(original),newSalt()),1],['Unknown ID',newCredentialId(),commitment,3],
  ]) {
    const actual = Number(await registry.verifyCredential(credentialId,candidate));
    cases.push({name,expected,actual,pass:actual===expected});
  }
  await (await registry.connect(issuer).revokeCredential(id)).wait();
  const actual = Number(await registry.verifyCredential(id,commitment)); cases.push({name:'Original PDF after revocation',expected:2,actual,pass:actual===2});
  const report = { measuredAt:new Date().toISOString(), runtime:process.version, platform:process.platform, arch:process.arch,
    network:'isolated Hardhat local chain; not a public-network benchmark', warmup:'one issuance and revocation excluded to initialise counters', hashRepetitions:5, queryRepetitions:10, sizes,cases };
  await writeFile(path.join(ROOT,'docs/BENCHMARK_RESULTS.json'),JSON.stringify(report,null,2)+'\n');
  const rows = sizes.map(row=>`| ${row.bytes} | ${row.hashMedianMs} | ${row.queryMedianMs} | ${row.issueGas} | ${row.revokeGas} |`).join('\n');
  await writeFile(path.join(ROOT,'docs/BENCHMARK_RESULTS.md'),`# Local benchmark results\n\nMeasured at (UTC): ${report.measuredAt}. Environment: ${report.platform}/${report.arch}, Node ${report.runtime}.\n\nThis uses an isolated local Hardhat chain and does not change demonstration data. Hashing inputs are synthetic bytes with a PDF header, not renderable credentials. Functional cases use the actual original and altered sample PDFs. One issuance and revocation are excluded as a warm-up to initialise the counters.\n\n| Input bytes | Median hash ms (5 runs) | Median query ms (10 runs) | Issue gas | Revoke gas |\n|---|---|---|---|---|\n${rows}\n\nFunctional cases: ${cases.filter(row=>row.pass).length}/${cases.length} passed. See the JSON file for full results.\n\nResults apply only to this machine and configuration. Queries include local RPC overhead. This does not measure public-network congestion, consensus delays, multiple institutions or internet latency, and does not show that blockchain is faster than a database.\n`);
  console.log('Generated docs/BENCHMARK_RESULTS.md and JSON without changing demonstration data.');

} catch (error) { console.error(error.message); process.exitCode=1; }
finally { provider?.destroy(); await stopChild(chain); }

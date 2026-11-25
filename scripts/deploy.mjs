import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContractFactory, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { artifact, assertLocalRpc, PUBLIC } from './runtime.mjs';
import { computeCommitment, createVerificationPackage, hashDocument, newSalt } from '../shared/credential.mjs';

export async function deploy(rpcUrl = 'http://127.0.0.1:8545', { seed = true, write = true } = {}) {
  assertLocalRpc(rpcUrl);
  const provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 100;
  try {
    const { chainId } = await provider.getNetwork();
    if (chainId !== 31337n) throw new Error('Expected local development chain 31337.');
    const signers = await Promise.all([0, 1, 2, 3].map(index => provider.getSigner(index)));
    const accounts = await Promise.all(signers.map(s => s.getAddress()));
    const compiled = await artifact();
    // A random constructor tag makes deployment transactions distinct after a chain restart.
    const deploymentId = newSalt();
    const registry = await new ContractFactory(compiled.abi, compiled.bytecode, signers[0]).deploy(accounts[0], deploymentId);
    await registry.waitForDeployment();
    const receipt = await registry.deploymentTransaction().wait();
    const deployment = {
      chainId: Number(chainId), rpcUrl, contractAddress: await registry.getAddress(),
      deploymentId, deploymentTxHash: receipt.hash, deploymentBlock: receipt.blockNumber,
      deployedAt: new Date().toISOString(), abi: compiled.abi,
      demoAccounts: [
        { address: accounts[0], label: 'Administrator', organization: 'Registry administrator' },
        { address: accounts[1], label: 'Institution A', organization: 'Northstar Training' },
        { address: accounts[2], label: 'Institution B', organization: 'Harbour Academy' },
        { address: accounts[3], label: 'Unauthorised visitor', organization: 'Unauthorised visitor' },
      ],
      samples: [],
    };
    if (seed) {
      await (await registry.authorizeIssuer(accounts[1])).wait();
      const bytes = new Uint8Array(await readFile(path.join(PUBLIC, 'samples/certificate-original.pdf')));
      const fileHash = hashDocument(bytes);
      for (const [slug, label, revoked] of [['active', 'Valid credential', false], ['revoked', 'Revoked credential', true]]) {
        const credentialId = keccak256(toUtf8Bytes(`FTEC5520/demo/${slug}`));
        const salt = newSalt();
        await (await registry.connect(signers[1]).issueCredential(credentialId, computeCommitment(fileHash, salt))).wait();
        if (revoked) await (await registry.connect(signers[1]).revokeCredential(credentialId)).wait();
        const verification = createVerificationPackage({ ...deployment, credentialId, salt });
        deployment.samples.push({ slug, label, credentialId, verificationPath: `/samples/${slug}.json`, verification });
        if (write) await writeFile(path.join(PUBLIC, `samples/${slug}.json`), JSON.stringify(verification, null, 2) + '\n');
      }
    }
    if (write) {
      await mkdir(PUBLIC, { recursive: true });
      await writeFile(path.join(PUBLIC, 'deployment.json'), JSON.stringify(deployment, null, 2) + '\n');
    }
    return deployment;
  } finally { provider.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await deploy(process.env.RPC_URL);
    console.log(`Registry deployed to ${result.contractAddress}; local chain ${result.chainId}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

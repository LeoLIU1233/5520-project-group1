import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ContractFactory, JsonRpcProvider, ZeroAddress, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';
import { artifact } from '../scripts/runtime.mjs';
import { computeCommitment, hashDocument } from '../shared/credential.mjs';

let provider, compiled, admin, issuer, other, visitor;
const id = keccak256(toUtf8Bytes('fixture certificate'));
const salt = '0x' + '42'.repeat(32);
const commitment = computeCommitment(hashDocument(new TextEncoder().encode('%PDF-1.7\nFixture\n%%EOF')), salt);

before(async () => {
  assert.ok(process.env.TEST_RPC_URL, 'Run tests with the provided test command.');
  provider = new JsonRpcProvider(process.env.TEST_RPC_URL, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 50;
  compiled = await artifact();
  [admin, issuer, other, visitor] = await Promise.all([0,1,2,3].map(i => provider.getSigner(i)));
});
after(() => provider?.destroy());

async function fixture({ issue = true } = {}) {
  const registry = await new ContractFactory(compiled.abi, compiled.bytecode, admin).deploy(await admin.getAddress(), salt);
  await registry.waitForDeployment();
  await (await registry.authorizeIssuer(await issuer.getAddress())).wait();
  if (issue) await (await registry.connect(issuer).issueCredential(id, commitment)).wait();
  return registry;
}

async function rejectsWith(registry, promise, name) {
  await assert.rejects(promise, error => {
    const data = error.data ?? error.info?.error?.data?.data ?? error.info?.error?.data;
    const decoded = typeof data === 'string' ? registry.interface.parseError(data) : null;
    assert.equal(decoded?.name ?? error.revert?.name, name, error.shortMessage);
    return true;
  });
}

test('administrator can authorise and deactivate an issuer, and only that role can do so', async () => {
  const r = await fixture({ issue: false });
  assert.equal(await r.hasRole(await r.ISSUER_ROLE(), await issuer.getAddress()), true);
  await rejectsWith(r, r.connect(visitor).authorizeIssuer(await other.getAddress()), 'AccessControlUnauthorizedAccount');
  await rejectsWith(r, r.connect(issuer).deactivateIssuer(await other.getAddress()), 'AccessControlUnauthorizedAccount');
  await (await r.deactivateIssuer(await issuer.getAddress())).wait();
  assert.equal(await r.hasRole(await r.ISSUER_ROLE(), await issuer.getAddress()), false);
});
test('records issuer, commitment and timestamp and emits an auditable issuance event', async () => {
  const r = await fixture({ issue: false });
  const receipt = await (await r.connect(issuer).issueCredential(id, commitment)).wait();
  const record = await r.getCredential(id);
  assert.equal(record.commitment, commitment);
  assert.equal(record.issuer, await issuer.getAddress());
  assert.equal(record.issuedAt, BigInt((await provider.getBlock(receipt.blockNumber)).timestamp));
  assert.equal(record.exists, true); assert.equal(record.revoked, false);
  assert.equal(record.revokedAt, 0n); assert.equal(await r.totalIssued(), 1n);
  const event = receipt.logs.map(log => r.interface.parseLog(log)).find(log => log?.name === 'CredentialIssued');
  assert.equal(event.args.credentialId, id); assert.equal(event.args.issuer, await issuer.getAddress());
});
test('rejects unauthorised issuance including issuance by an admin without issuer role', async () => {
  const r = await fixture({ issue: false });
  await rejectsWith(r, r.connect(visitor).issueCredential(id, commitment), 'AccessControlUnauthorizedAccount');
  await rejectsWith(r, r.issueCredential(id, commitment), 'AccessControlUnauthorizedAccount');
  assert.equal(await r.totalIssued(), 0n);
});
test('rejects duplicate IDs and never overwrites the previous issuer or commitment', async () => {
  const r = await fixture();
  await (await r.authorizeIssuer(await other.getAddress())).wait();
  await rejectsWith(r, r.connect(other).issueCredential(id, keccak256(toUtf8Bytes('different'))), 'CredentialAlreadyExists');
  assert.equal((await r.getCredential(id)).issuer, await issuer.getAddress());
  assert.equal(await r.totalIssued(), 1n);
});
test('rejects zero administrator, zero issuer, empty ID and empty commitment', async () => {
  const r = await fixture({ issue: false });
  await rejectsWith(r, new ContractFactory(compiled.abi, compiled.bytecode, admin).deploy(ZeroAddress, salt), 'InvalidAddress');
  await rejectsWith(r, r.authorizeIssuer(ZeroAddress), 'InvalidAddress');
  await rejectsWith(r, r.deactivateIssuer(ZeroAddress), 'InvalidAddress');
  await rejectsWith(r, r.connect(issuer).issueCredential(ZeroHash, commitment), 'InvalidCredentialId');
  await rejectsWith(r, r.connect(issuer).issueCredential(id, ZeroHash), 'InvalidCommitment');
});
test('anyone can verify VALID, HASH_MISMATCH and NOT_FOUND without a transaction', async () => {
  const r = await fixture();
  const before = await provider.getBlockNumber();
  assert.equal(await r.connect(visitor).verifyCredential(id, commitment), 0n);
  assert.equal(await r.verifyCredential(id, ZeroHash), 1n);
  assert.equal(await r.verifyCredential(ZeroHash, commitment), 3n);
  assert.equal(await provider.getBlockNumber(), before);
});
test('original issuer can revoke; original data and an event remain available', async () => {
  const r = await fixture();
  const receipt = await (await r.connect(issuer).revokeCredential(id)).wait();
  assert.equal(await r.verifyCredential(id, commitment), 2n);
  const record = await r.getCredential(id);
  assert.equal(record.commitment, commitment); assert.equal(record.exists, true); assert.equal(record.revoked, true);
  assert.equal(record.revokedAt, BigInt((await provider.getBlock(receipt.blockNumber)).timestamp));
  assert.equal(await r.totalRevoked(), 1n); assert.equal(await r.totalIssued(), 1n);
  const event = receipt.logs.map(log => r.interface.parseLog(log)).find(log => log?.name === 'CredentialRevoked');
  assert.equal(event.args.revokedBy, await issuer.getAddress());
});
test('administrator can revoke any existing credential', async () => {
  const r = await fixture();
  await (await r.revokeCredential(id)).wait();
  assert.equal(await r.verifyCredential(id, commitment), 2n);
});
test('even an authorised competing institution cannot revoke another issuer’s credential', async () => {
  const r = await fixture();
  await (await r.authorizeIssuer(await other.getAddress())).wait();
  await rejectsWith(r, r.connect(other).revokeCredential(id), 'NotCredentialIssuerOrAdmin');
  await rejectsWith(r, r.connect(visitor).revokeCredential(id), 'NotCredentialIssuerOrAdmin');
  assert.equal(await r.verifyCredential(id, commitment), 0n);
});
test('cannot revoke an unknown credential, revoke twice, or overwrite a revoked record', async () => {
  const r = await fixture();
  await rejectsWith(r, r.revokeCredential(ZeroHash), 'CredentialNotFound');
  await (await r.revokeCredential(id)).wait();
  await rejectsWith(r, r.revokeCredential(id), 'CredentialAlreadyRevoked');
  await rejectsWith(r, r.connect(issuer).issueCredential(id, commitment), 'CredentialAlreadyExists');
  assert.equal(await r.totalRevoked(), 1n);
});
test('a mismatch takes priority over revocation, consistent with the proposal’s status meanings', async () => {
  const r = await fixture();
  await (await r.revokeCredential(id)).wait();
  assert.equal(await r.verifyCredential(id, ZeroHash), 1n);
});
test('deactivation prevents new issuance but preserves old validity and issuer revocation rights', async () => {
  const r = await fixture();
  await (await r.deactivateIssuer(await issuer.getAddress())).wait();
  await rejectsWith(r, r.connect(issuer).issueCredential(keccak256(toUtf8Bytes('new')), commitment), 'AccessControlUnauthorizedAccount');
  assert.equal(await r.verifyCredential(id, commitment), 0n);
  await (await r.connect(issuer).revokeCredential(id)).wait();
  assert.equal(await r.verifyCredential(id, commitment), 2n);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, concat } from 'ethers';
import { computeCommitment, createVerificationPackage, hashDocument, newSalt, parseVerificationPackage, MAX_PDF_BYTES } from '../shared/credential.mjs';

const pdf = new TextEncoder().encode('%PDF-1.7\nFictional internship certificate\n%%EOF');
const salt = '0x' + '42'.repeat(32);
const deployment = { chainId: 31337, contractAddress: '0x0000000000000000000000000000000000000001', deploymentTxHash: '0x' + '99'.repeat(32) };
const verification = () => createVerificationPackage({ ...deployment, credentialId: '0x' + '11'.repeat(32), salt });

test('hashes raw PDF bytes consistently and detects even one byte change', () => {
  const changed = pdf.slice(); changed[20] ^= 1;
  assert.equal(hashDocument(pdf), hashDocument(pdf.slice()));
  assert.notEqual(hashDocument(pdf), hashDocument(changed));
});
test('uses the same fixed-width ABI encoding as Solidity abi.encode(bytes32,bytes32)', () => {
  const hash = hashDocument(pdf);
  assert.equal(computeCommitment(hash, salt), keccak256(concat([hash, salt])));
  assert.notEqual(computeCommitment(hash, salt), computeCommitment(hash, newSalt()));
});
test('rejects invalid or oversized documents and malformed salts', () => {
  assert.throws(() => hashDocument(new Uint8Array()), /empty/);
  assert.throws(() => hashDocument(new TextEncoder().encode('not a PDF')), /PDF/);
  assert.throws(() => hashDocument(new Uint8Array(MAX_PDF_BYTES + 1)), /20 MB/);
  assert.throws(() => computeCommitment(hashDocument(pdf), 'abc'), /Salt/);
});
test('verification packages round trip without including the PDF or personal information', () => {
  const pkg = verification();
  assert.deepEqual(parseVerificationPackage(JSON.stringify(pkg), deployment), pkg);
  assert.deepEqual(Object.keys(pkg).sort(), ['chainId','contractAddress','credentialId','deploymentTxHash','format','salt'].sort());
});
test('rejects packages for a different chain, contract, or restarted deployment', () => {
  const pkg = verification();
  assert.throws(() => parseVerificationPackage({ ...pkg, chainId: 1 }, deployment), /different deployment/);
  assert.throws(() => parseVerificationPackage({ ...pkg, contractAddress: '0x0000000000000000000000000000000000000002' }, deployment), /different deployment/);
  assert.throws(() => parseVerificationPackage({ ...pkg, deploymentTxHash: '0x' + '77'.repeat(32) }, deployment), /different deployment/);
  assert.throws(() => parseVerificationPackage({ ...pkg, format: 'other' }), /Unsupported/);
});

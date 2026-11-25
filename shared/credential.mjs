import { AbiCoder, getAddress, hexlify, isHexString, keccak256, randomBytes } from 'ethers';

export const STATUS = ['VALID', 'HASH_MISMATCH', 'REVOKED', 'NOT_FOUND'];
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function newCredentialId() { return hexlify(randomBytes(32)); }
export function newSalt() { return hexlify(randomBytes(32)); }

export function assertBytes32(value, label = 'Value') {
  if (!isHexString(value, 32)) throw new Error(`${label} must be 0x followed by 64 hexadecimal characters.`);
  return value.toLowerCase();
}

export function computeCommitment(fileHash, salt) {
  assertBytes32(fileHash, 'File hash');
  assertBytes32(salt, 'Salt');
  return keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes32'], [fileHash, salt]));
}

export function hashDocument(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength === 0) throw new Error('The file is empty. Please select a PDF.');
  if (data.byteLength > MAX_PDF_BYTES) throw new Error('Please select a PDF smaller than 20 MB.');
  // PDF permits some leading bytes; inspect the first 1024 bytes rather than the file extension.
  if (!new TextDecoder('latin1').decode(data.slice(0, 1024)).includes('%PDF-')) {
    throw new Error('This file does not appear to be a PDF.');
  }
  return keccak256(data);
}

export function createVerificationPackage({ credentialId, salt, chainId, contractAddress, deploymentTxHash }) {
  return {
    format: 'credential-ledger/v1',
    credentialId: assertBytes32(credentialId, 'Credential ID'),
    salt: assertBytes32(salt, 'Salt'),
    chainId: Number(chainId),
    contractAddress: getAddress(contractAddress),
    deploymentTxHash: assertBytes32(deploymentTxHash, 'Deployment transaction'),
  };
}

export function parseVerificationPackage(value, deployment) {
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!data || data.format !== 'credential-ledger/v1') throw new Error('Unsupported verification file.');
  const result = createVerificationPackage(data);
  if (!Number.isSafeInteger(result.chainId) || result.chainId <= 0) throw new Error('Invalid chain ID.');
  if (deployment && (result.chainId !== deployment.chainId ||
    result.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase() ||
    result.deploymentTxHash !== deployment.deploymentTxHash.toLowerCase())) {
    throw new Error('This verification file belongs to a different deployment. Use the current certificate and verification file.');
  }
  return result;
}

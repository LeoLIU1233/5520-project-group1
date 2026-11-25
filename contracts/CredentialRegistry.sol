// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Internship and training credential integrity and revocation registry
/// @notice No PDF, personal information, file hash or salt is stored on-chain.
contract CredentialRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    // Keep this order in sync with shared/credential.mjs.
    enum VerificationStatus { VALID, HASH_MISMATCH, REVOKED, NOT_FOUND }

    struct Credential {
        bytes32 commitment;
        address issuer;
        uint64 issuedAt;
        uint64 revokedAt;
        bool exists;
        bool revoked;
    }

    mapping(bytes32 => Credential) private credentials;
    bytes32 public immutable deploymentId;
    uint256 public totalIssued;
    uint256 public totalRevoked;

    error InvalidAddress();
    error InvalidCredentialId();
    error InvalidCommitment();
    error CredentialAlreadyExists(bytes32 credentialId);
    error CredentialNotFound(bytes32 credentialId);
    error CredentialAlreadyRevoked(bytes32 credentialId);
    error NotCredentialIssuerOrAdmin(address caller);

    event CredentialIssued(bytes32 indexed credentialId, address indexed issuer, bytes32 commitment, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer, address indexed revokedBy, uint64 revokedAt);

    constructor(address administrator, bytes32 instanceId) {
        if (administrator == address(0)) revert InvalidAddress();
        deploymentId = instanceId;
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
    }

    function authorizeIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuer == address(0)) revert InvalidAddress();
        _grantRole(ISSUER_ROLE, issuer);
    }

    /// @notice Disables new issuance; historical credentials remain unchanged.
    function deactivateIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuer == address(0)) revert InvalidAddress();
        _revokeRole(ISSUER_ROLE, issuer);
    }

    function issueCredential(bytes32 credentialId, bytes32 commitment) external onlyRole(ISSUER_ROLE) {
        if (credentialId == bytes32(0)) revert InvalidCredentialId();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (credentials[credentialId].exists) revert CredentialAlreadyExists(credentialId);
        uint64 issuedAt = uint64(block.timestamp);
        credentials[credentialId] = Credential(commitment, msg.sender, issuedAt, 0, true, false);
        ++totalIssued;
        emit CredentialIssued(credentialId, msg.sender, commitment, issuedAt);
    }

    function verifyCredential(bytes32 credentialId, bytes32 candidateCommitment) external view returns (VerificationStatus) {
        Credential storage credential = credentials[credentialId];
        if (!credential.exists) return VerificationStatus.NOT_FOUND;
        if (credential.commitment != candidateCommitment) return VerificationStatus.HASH_MISMATCH;
        if (credential.revoked) return VerificationStatus.REVOKED;
        return VerificationStatus.VALID;
    }

    /// @notice The original issuer retains revocation rights even after deactivation.
    /// This is a prototype governance choice; admins may also revoke any credential.
    function revokeCredential(bytes32 credentialId) external {
        Credential storage credential = credentials[credentialId];
        if (!credential.exists) revert CredentialNotFound(credentialId);
        if (msg.sender != credential.issuer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotCredentialIssuerOrAdmin(msg.sender);
        }
        if (credential.revoked) revert CredentialAlreadyRevoked(credentialId);
        credential.revoked = true;
        credential.revokedAt = uint64(block.timestamp);
        ++totalRevoked;
        emit CredentialRevoked(credentialId, credential.issuer, msg.sender, credential.revokedAt);
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return credentials[credentialId];
    }
}

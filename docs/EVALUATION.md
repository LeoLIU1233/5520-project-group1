# V2 Evaluation and Presentation Notes

Use these notes to turn a working prototype into evidence you can explain in the presentation. The beginner workflow is in BEGINNER_GUIDE.md.

## Run a local benchmark

From the English project folder:

```bash
bash scripts/launch.sh benchmark
```

The script starts an isolated Hardhat chain on a random port and leaves demonstration data in `data/` unchanged. It generates `docs/BENCHMARK_RESULTS.md` and `docs/BENCHMARK_RESULTS.json`.

One issuance and revocation are excluded as a warm-up so initial zero-to-nonzero counter writes do not distort the file-size comparison.

Hashing inputs are synthetic bytes with a PDF header, at 1 KiB, 100 KiB, 1 MiB and 5 MiB. They isolate hashing cost and are not presented as readable certificates. Functional cases separately use the real original and altered sample PDFs.

| Experiment | Method | Interpretation |
|---|---|---|
| File size and hashing | Five repetitions per size; median duration | The browser uses the same hashing implementation, but this measurement runs in Node and must not be labelled browser timing |
| Read-only verification | Ten queries per registered record; median duration | Includes local RPC overhead; no transaction is sent |
| Issue/revoke cost | Read gasUsed from transaction receipts | Commitments have fixed length, while calldata and state changes still affect gas |
| Functional outcomes | Original, altered date, incorrect salt, unknown ID and original after revocation | Compare actual and expected status; incorrect salt does not establish malicious alteration |

State the environment, repetitions and median rather than selecting the fastest run. Passing these cases is not a security audit or a large-scale performance evaluation.

## Compare with a database design

| Question | Single-institution database | This blockchain design |
|---|---|---|
| Who controls registration rules? | Backend/database operator | Contract code and roles, with administrator governance still required |
| Who must the verifier trust? | Database operator and its API | Issuer accreditation, governance, the chain and the node used |
| Can revocation be supported? | Yes | Yes, with contract events |
| Can document integrity be checked? | Yes, using hashes or signatures | Yes, using a registered salted commitment |
| How do multiple institutions cooperate? | Shared platform and interface agreements | A shared network and contract are possible; this local demo is not already a multi-institution deployment |
| Can operators change records? | Depends on permissions, audit and backup policy | Depends on real network governance; the local test-chain operator can reset the entire teaching environment |
| Is privacy automatic? | No; needs access control and encryption | No; public on-chain data is not secret |

Discuss trust and independently checkable status, rather than claiming blockchain makes every assertion trustworthy. There is no matched database latency benchmark here, so do not claim this implementation is faster or always cheaper.

## Evidence to show

1. Tests covering all four outcomes, permission rejection, duplicate IDs, repeated revocation, replayed challenges, unauthorised exports and restart recovery.
2. Separate browser identities: an issuer signs a transaction while a verifier checks without a wallet.
3. Record history with transaction hash, block, actor, time and gas.
4. A normal shutdown and restart that preserves the address, old JSON and revocation state.
5. Anonymous listings versus authorised signed-in access to private backups.
6. Actual benchmark results with their measurement limits.

## Questions to prepare for

### Why keep the PDF off-chain?

PDFs are large and may contain personal information. The prototype registers only a commitment and required status. The browser processes the file, while verification packages are stored off-chain. Off-chain availability and permission controls still matter.

### Is the salt a password?

No. It is a random verification value that reduces guessing risk. A verifier who receives the PDF and salt can check them. Authentication and access control are separate mechanisms.

### Does an administrator-recorded organisation name prove its identity?

No. It represents an off-chain review and binding to a wallet address. The source label makes that trust assumption explicit; the blockchain does not certify a legal entity automatically.

### Why can old credentials remain valid after issuer deactivation?

The policy separates stopping new issuance from revoking old credentials. Ordinary withdrawal and compromised keys are different cases. Future governance can add freezing and recovery; this version retains the original address right to revoke its earlier credentials.

### Why use Anvil for normal operation now?

V1 recreated an in-memory chain at launch. V2 requires persistent state and history, so normal operation uses Anvil state management. Hardhat and the original Solidity rules remain in place for compilation and isolated testing. Storage changes do not change the core contract policy.

### Can local-file administrators read encrypted backups?

A person with the complete data folder can obtain the decryption key. AES-256-GCM encryption does not replace device security, operating-system permissions, end-to-end encryption or production key management.

### Is an independent-wallet protocol test a MetaMask rehearsal?

No. Automation checks independent-key signatures, EIP-1193 requests and transactions. Extension installation, prompts, account selection and network switching still need a rehearsal on the presentation computer.

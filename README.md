# VeriLedger V2 English Edition

A classroom prototype for FTEC5520 Applied Blockchain and Cryptocurrencies. It demonstrates registration, file-integrity verification and revocation of internship and training credentials. The browser hashes the original PDF; the chain records a salted commitment and status; a local service stores encrypted verification-package backups.

This folder, `FTEC5520/proj`, is the English V2 project. The Chinese V2 project in `FTEC5520/project` is separate. Their source, chain state, verification packages and backup keys are not shared.

## Start here

1. Open this `proj` folder in Finder and double-click `start.command`. Keep the terminal window open.
2. When it displays `Website: http://127.0.0.1:5173`, open that address in your browser.
3. Select **Load valid sample**, then **Verify credential**. Expect `VALID`.

Read [the detailed beginner handbook](docs/BEGINNER_GUIDE.md) for complete instructions, expected results, wallet setup, recovery and troubleshooting. The application also has a **Beginner guide** workspace with a browser-friendly version of the handbook.

If double-clicking does not launch the project, open Terminal and run:

```bash
cd /Users/garywen/Desktop/CUHK/FTEC5520/proj
bash start.command
```

On another computer, install Node.js 24 LTS, run `npm install` in this folder, then `npm run dev`. On this Mac the launcher can also use the Node runtime bundled with Codex. Installation needs internet access; once dependencies are installed, the local demonstration works offline.

**The Chinese and English launchers use the same default ports. Run one edition at a time.** Stop the other edition normally before launching this one. Do not reset or delete its data to free a port.

## What V2 adds

| Capability | How to use it |
|---|---|
| Persistent credentials and revocation | Stop with Ctrl+C, wait for saving to finish, then launch normally |
| Credential records | Search, filter status, view history and transaction gas |
| Verification-package recovery | Sign in as the original issuer or administrator and re-export JSON |
| Backup before issuance | Verification data is saved locally before the chain transaction; cancelled transactions remain pending |
| Issuer names | Administrators record the organisation/address binding; verification shows its source |
| Independent wallets | Connect, sign in, obtain local test funds, request authorisation and sign transactions |
| Beginner support | A 14-section handbook, in-app guidance and troubleshooting |
| Separate reset | Type an explicit confirmation; current data is archived first |
| Evaluation tools | Run an isolated benchmark without changing demonstration records |

## Start Stop Back up Reset

| File | Purpose |
|---|---|
| `start.command` | Create V2 on first launch; restore existing records afterwards |
| `check.command` | Run isolated tests without changing your demonstration chain |
| `backup.command` | After stopping, copy the complete dataset into `backups/` |
| `reset-demo.command` | After stopping, type `RESET ENGLISH` to archive the current data; the next launch starts fresh |

Closing the browser does not stop the services. Press Ctrl+C in the launch window and wait until it reports `Stopped`. Periodic snapshots help recovery, but a power failure or forced termination may lose the final unsaved interval of chain activity.

A normal restart does not require a reset. Verification packages from an old deployment are not valid in a newly reset environment. Delivered data may include clearly labelled fictional acceptance-test records, so the credential count can be greater than two.

## Where data lives

Everything needed to recover this edition is in its own `data/` directory:

```text
data/
  chain.json        Local chain state and historical snapshots
  deployment.json   Contract address, deployment identity and ABI
  registry.sqlite   Profiles, event index, private metadata and encrypted verification packages
  vault.key         Local decryption key for verification-package backups
  samples/          Public fictional sample verification JSON for this deployment
```

Back up the entire folder. Do not mix individual files from different backups. Verification JSON is encrypted with AES-256-GCM, but its key is on the same machine; this does not protect against someone who controls all local files. Sessions use a wallet signature, with export permission checked by the backend.

Original PDFs are not uploaded or automatically backed up. Keep the exact PDF used at registration. Private titles and file names are off-chain metadata, visible in the application only to the signed-in original issuer or an administrator, but stored as plaintext metadata in SQLite. Use fictional data for demonstrations.

`data/`, `backups/`, dependencies and build output are ignored by version control. Do not share private data or encryption keys with source code. Public sample PDFs and JSON are fictional materials, separate from private backups.

## Implementation

- Solidity and OpenZeppelin AccessControl enforce issuer permissions, unique registration, public verification and irreversible revocation.
- Hardhat and locally installed solc compile contracts and run isolated business-rule tests.
- Anvil persists the normal demonstration chain, including state, transactions and events.
- Node.js HTTP and built-in SQLite provide records, issuer names, indexing and encrypted backups.
- React and ethers v6 provide the interface, byte-level PDF hashing and wallet connection.
- Sign-in uses a one-time challenge bound to the website, chain, contract and deployment. Sessions last 30 minutes; switching accounts clears the browser session. Sign-in has no gas fee.

```text
fileHash   = keccak256(raw PDF bytes)
salt       = 32 cryptographically random bytes
commitment = keccak256(abi.encode(fileHash, salt))
```

Verification order is `NOT_FOUND`, `HASH_MISMATCH`, `REVOKED`, then `VALID`. Incorrect salt also causes a mismatch. Re-exporting a visually identical PDF can change its bytes.

Administrator and issuer roles are separate. Deactivation stops new issuance but does not automatically revoke historical credentials. The original address can still revoke its older credentials; compromised keys, freezing and recovery remain governance considerations.

### Source layout

```text
contracts/        On-chain business rules, unchanged from V1
server/           Local records, SQLite, indexing, sessions and export permission checks
shared/           Hashing and verification-package format
frontend/         English interface, handbook and sample assets
scripts/          Launch, persistent chain, backup, reset, benchmark and tests
test/             Contract, hashing, session and restart tests
docs/             Beginner handbook and evaluation guidance
```

### Checks Build Evaluation

```bash
bash check.command
bash scripts/launch.sh build
bash scripts/launch.sh benchmark
```

Tests use temporary directories and random ports. They cover contract rules, challenge replay, origin restrictions, encrypted backups, unauthorised export, independent-key transactions, filtering and full restart recovery. An EIP-1193 protocol test is not a real MetaMask extension rehearsal: practise the extension prompts on the presentation computer using the handbook.

The build output in `dist/` still needs the local service and blockchain. It is not a complete standalone public deployment.

The benchmark generates [measured results](docs/BENCHMARK_RESULTS.md) and JSON in `docs/`. For methodology, database comparisons and discussion prompts, read [Evaluation and presentation notes](docs/EVALUATION.md).

## Project boundaries

This checks whether a file matches a registered commitment and whether the credential has been revoked. It cannot prove that the underlying internship or training occurred. Issuer names are administrator-recorded off-chain claims, not automatic blockchain identity certification. The local chain operator controls this teaching environment; demo keys are public development keys. Do not present a single-machine demonstration as completed decentralised multi-institution governance.

References: [Anvil state management](https://getfoundry.sh/anvil/reference/anvil/), [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control), [MetaMask documentation](https://docs.metamask.io/quickstart/).

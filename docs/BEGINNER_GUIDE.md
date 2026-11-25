# VeriLedger V2 Beginner Handbook

This handbook is for students using wallets, smart contracts and local web applications for the first time. Start with classroom demo accounts, then rehearse with an independent browser wallet.

The English V2 project is in `FTEC5520/proj`. The Chinese V2 project is in the neighbouring `FTEC5520/project` folder. Do not mix their launchers, data directories or verification JSON.

## 1 Understand what the system checks

Imagine a training provider gives a student a PDF certificate. An employer wants to know whether it is the file that the provider registered and whether the provider later revoked it.

The system registers a salted file commitment on a local test chain. The verifier selects the PDF and its verification JSON; the browser recalculates the commitment and checks the contract.

| Term | Meaning |
|---|---|
| Original PDF | The exact file selected during registration, with its original bytes |
| Credential ID | A unique identifier for the on-chain record, starting with `0x` |
| Salt | A random verification value included in the JSON; it cannot be recovered from the commitment |
| Commitment | The encoded file hash and salt hashed together, then registered on-chain |
| Verification JSON | The accompanying ID, salt and deployment information; it is not the PDF |
| Wallet address | An account identifier starting with `0x`, not a password |
| Wallet signature | Proof that you control an address; records sign-in is gas-free |
| Transaction | An operation that changes chain state, such as registration or revocation |
| Account role | Administrator or issuer permissions enforced by the contract, separate from signing in |

`VALID` means that the file matches and has not been revoked. It does not prove that the training or internship actually happened.

## 2 Launch the English edition

### Find the correct folder

Open this location in Finder:

```text
/Users/garywen/Desktop/CUHK/FTEC5520/proj
```

It should contain `start.command`, `check.command` and this handbook. Do not launch the neighbouring Chinese edition at the same time; both use the same default ports.

### Start the services

Double-click `start.command`. A terminal window opens. The first launch creates the V2 dataset; later launches restore it.

Wait for these messages:

```text
Website: http://127.0.0.1:5173
Keep this window open. Press Ctrl+C to stop normally and save your data.
```

Keep the window running. It runs the website, local records service and blockchain. A window that stays open is expected, not a frozen program.

If double-clicking does not work, open Terminal and enter these lines:

```bash
cd /Users/garywen/Desktop/CUHK/FTEC5520/proj
bash start.command
```

On another computer, install Node.js 24 LTS, run `npm install` in the project folder, then launch. On this Mac, the launcher can locate the Node runtime bundled with Codex and the prepared dependencies.

### Open the website

Open this address in Chrome, Edge or another browser:

```text
http://127.0.0.1:5173/
```

Expect the English VeriLedger interface with **Local test chain connected** in the top bar. A fresh dataset has two sample records, one valid and one revoked. Your own registrations and acceptance-test records can make the count larger.

`127.0.0.1` means your own computer. Opening it on another computer accesses that computer, not this project on your Mac.

## 3 Try all four verification outcomes

### Valid sample

1. Open **Verify credentials**.
2. Select **Load valid sample** below the form.
3. The original PDF, credential ID and salt are filled automatically.
4. Select **Verify credential**.
5. Expect `VALID` and **File matches. Credential is valid.**

Expand **View fingerprints and on-chain record** to compare the computed and registered commitments. They should match.

### Altered PDF

1. Download **PDF with altered dates** from the Classroom samples panel.
2. Select **Change file** and choose `certificate-altered.pdf`.
3. Keep the previous credential ID and salt.
4. Verify again.
5. Expect `HASH_MISMATCH`.

The original end date is `30 June 2026`; the altered date is `31 August 2026`. Any byte change can affect the fingerprint. An incorrect salt also causes a mismatch, so the status alone does not prove malicious alteration.

### Revoked credential

1. Select **Load revoked sample**.
2. Verify.
3. Expect `REVOKED` and **File matches. Credential is revoked.**

The file still matches, but the credential has been withdrawn. Revocation preserves the original registration.

### Unknown credential

1. Keep a PDF and salt selected.
2. Replace the credential ID with this complete line:

```text
0x0000000000000000000000000000000000000000000000000000000000000000
```

3. Verify.
4. Expect `NOT_FOUND`.

## 4 Know the demo accounts

The acting-account controls appear in **Issuer workspace**, **Credential records** and **Administration**.

| Account | Initial purpose |
|---|---|
| Administrator | Authorises issuers, records names, revokes any credential and recovers backups |
| Institution A | The authorised sample issuer Northstar Training |
| Institution B | Harbour Academy, initially unauthorised, useful for the full authorisation flow |
| Unauthorised visitor | Demonstrates rejection of actions without permission |

**Classroom demo** sends actual local-chain transactions through unlocked development accounts. It does not fabricate browser results, but its publicly known test accounts are not a production identity system.

**Signed in to local records** and **Authorised issuer** mean different things. Signing in proves wallet control. A contract role determines whether the account can issue or administer. Signing in alone grants neither role.

## 5 Authorise Institution B

1. Open **Administration**.
2. Select **Administrator** as the acting account.
3. Select **Use Institution B** to fill its name and address.
4. Check that the organisation is Harbour Academy and the address belongs to Institution B.
5. Tick the off-chain identity and wallet confirmation. Classroom samples use fictional organisations.
6. Select **Authorise and save name**.
7. If required, the application first signs in to records management. Demo accounts can sign without an external extension prompt.
8. Wait for **Issuer authorised and organisation name recorded by the administrator.**
9. The issuer list should show Harbour Academy as **Authorised**, with its name recorded by the administrator.

If Institution B was already authorised in an earlier rehearsal, repeating the authorisation is harmless; it does not issue another credential.

To update a name, select **Edit name**, update the top form, confirm the review again and submit. The name is off-chain metadata with an explicit source label, not proof that a company is legally established or that its claims are true.

## 6 Register a credential as Institution B

### Keep an original file

Download **Original certificate PDF** from Classroom samples and save it somewhere you can find, such as Downloads. Use fictional sample data for the first rehearsal.

### Register

1. Open **Issuer workspace**.
2. Select **Institution B** and check for **Authorised issuer**.
3. Select the original PDF.
4. Set a useful private title, such as `V2 demo certificate 001`.
5. Review the automatically generated credential ID and commitment. You do not need to invent a salt.
6. Select **Register on-chain**.
7. The wallet signs in if necessary. The application first saves an encrypted verification-package backup locally, then submits the issuance transaction.
8. Wait for the success message.
9. Select **Download verification JSON**. The downloaded name starts with `verification-`.

Keep both the original PDF and the JSON. The JSON does not contain a copy of the PDF.

### Verify your new credential

1. Open **Verify credentials**.
2. Choose the exact PDF used above.
3. Select **Import JSON** and choose the downloaded package.
4. The ID and salt fill automatically.
5. Verify and expect `VALID`.
6. The result includes the issuer name, address, registration time and name source.

### If a transaction is cancelled or fails

V2 backs up verification data before submission. If backup succeeded but issuance was not completed:

1. Open **Credential records** with the original issuing account.
2. Select **Sign in to local records**, or the sign-in control in the list.
3. Filter by **Pending registration**, or search by the private title.
4. Find the record and select **Complete registration**.
5. Confirm the transaction. Its status becomes **Not revoked**.

Completion reuses the saved commitment and salt. Keep using the original PDF chosen for that pending record. A pending backup is not yet an on-chain credential; verification returns `NOT_FOUND` until issuance succeeds.

## 7 Search records and recover verification JSON

1. Open **Credential records**.
2. Select Institution B and sign in to local records.
3. Tick **Only credentials issued by this account**, or search by ID, issuer or your private title.
4. Filter by **Not revoked**, **Revoked** or **Pending registration**.
5. Each page contains up to ten records; use **Previous** and **Next**.
6. Expand **Registration and revocation history** for actor, block, transaction hash, time and gas.
7. If the downloaded JSON was lost, select **Re-export verification package**.

Only the original issuer or an administrator can export the saved package. Another authorised issuer cannot export your backup. Ordinary verifiers only need the PDF and JSON provided by the holder; they do not need access to your private records service.

Public listings show public on-chain IDs, addresses and status. Private titles, file names and salts are not exposed through the anonymous listing. Titles and file names are plaintext metadata in the local database; a person controlling that machine can still read them.

If no backup was saved on this machine, the commitment cannot reconstruct the salt. Find the original package or follow the issuer process to issue a new credential.

## 8 Revoke your own credential

1. Find your newly issued credential in **Credential records** and select **Copy credential ID**.
2. Open **Issuer workspace**, keeping Institution B selected.
3. Paste the ID into **Credential ID to revoke**.
4. Wait for the record preview. Check issuer, registration time and current status before proceeding.
5. Tick the irreversible-revocation confirmation.
6. Select **Confirm revocation** and wait for success.
7. Verify the same original PDF and JSON again.
8. Expect `REVOKED`.

This prototype does not reinstate revoked credentials or overwrite an existing ID. Corrections require a new registration and a decision about revoking the old one.

Deactivation and revocation are separate. Deactivating an issuer stops new issuance but does not automatically invalidate old credentials. The original address can still revoke its old credentials; compromised keys need a separate freeze and recovery policy.

## 9 Rehearse with a browser wallet

Use separate wallet identities for the roles. The administrator can initially remain a demo account while an institution uses a newly created test wallet. The current interface does not transfer administrator roles; you do not need that extra governance step for this demonstration.

### Prepare a wallet

1. Use a browser supporting wallet extensions, such as Chrome or Edge. The Codex in-app browser may not have MetaMask installed.
2. Install MetaMask through its official channel and create a wallet for coursework.
3. Keep recovery information secure. This project asks only for addresses and signatures, never your recovery phrase or private key.
4. Open the local website while the launch window remains running.

Official wallet site: https://metamask.io/

### Connect to the local network

1. In **Issuer workspace**, select **Browser wallet**.
2. Select the intended account in the extension and approve the connection.
3. If prompted to add or switch networks, check these values:

| Setting | Value |
|---|---|
| Network name | VeriLedger Local |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency symbol | ETH, local test currency only |

4. If switching fails, choose the local network manually in the wallet and reconnect.
5. Check the address, role and test balance shown in the application. A new wallet may have zero funds and no issuance permission; that is expected.

### Sign in and obtain test funds

1. Select **Sign in to local records**.
2. Read the wallet message: website, address, chain, contract, deployment, expiry and one-time challenge.
3. Confirm it is the local project sign-in message, then sign. This is not a transaction and has no gas fee.
4. Select **Get local test funds**. If the balance is insufficient, the local test balance is set to 10 ETH. Requests are limited to once per minute.
5. These funds have no real monetary value. Do not transfer real assets into the demonstration.

### Have the administrator authorise your address

1. Copy your wallet address. The address is public and can be shared with the administrator.
2. In a separate browser profile or window, or by switching to **Classroom demo**, choose Administrator.
3. Open **Administration** and enter an organisation name, such as `Course wallet institution C`.
4. Enter the actual wallet address, check it, tick the review confirmation and authorise it.
5. Return to the institution wallet window. Refresh or wait for the role update and check for **Authorised issuer**.

Switching accounts clears the local-records session. Sign in again for the new account; this is expected.

### Issue using your wallet

1. Select the original PDF, enter a title and register it.
2. Complete records sign-in if requested.
3. Approve the separate on-chain transaction in your wallet after checking the network and operation.
4. Wait for success and download the verification JSON.
5. In another browser window, verify the PDF and JSON without connecting a wallet.
6. Revoke through the issuer wallet and verify again to obtain `REVOKED`.

The sign-in signature and transaction confirmation may be separate prompts. Finishing sign-in does not mean issuance succeeded.

If you cancel the transaction, use the pending-registration flow in section 6. Sessions last up to 30 minutes and are cleared by restarting the service; simply sign in again when requested.

## 10 Stop normally and verify persistence

1. Keep the ID, original PDF and JSON for a credential you issued.
2. Return to the launch terminal.
3. Press Ctrl+C once.
4. Wait for `Stopped. Your records will be restored on the next normal launch.`
5. Launch the same `start.command` again.
6. Expect `Restored the existing contract, credentials and revocation records.`
7. Refresh the browser. Old records should remain.
8. Verify using the previously downloaded PDF and JSON. The status should match the state before shutdown.
9. Sign in again and confirm that re-export still works.

Closing a browser tab does not stop services. A power failure or forced termination can lose the final unsaved snapshot interval, so always use normal shutdown after a presentation.

V1 used an ephemeral chain. Already lost V1 chain state cannot be reconstructed from a PDF and JSON. V2 starts a new persistent environment. English and Chinese verification packages belong to separate deployments and are not interchangeable.

## 11 Back up and restore

### Create a complete backup

1. Stop the project normally.
2. Double-click `backup.command`.
3. Expect `Complete data backup created` and a backup location.
4. Find the timestamped folder under this English project `backups/` directory.
5. Copy that entire folder to a secure location if you need protection against computer failure.

The backup includes the decryption key. Someone with the complete backup can recover saved verification data. Do not publish private backups with source code.

### Restore an existing backup

1. Stop all services for this project.
2. In Finder, rename the current `data` folder to something like `data-before-restore`; retain it for safety.
3. Choose the complete timestamped `backup-...` or `reset-...` directory you want to restore.
4. Copy it into the English project root and name the copy `data`.
5. Check that `chain.json`, `deployment.json`, `registry.sqlite`, `vault.key` and `samples/` sit directly inside it, not inside another nested directory.
6. Launch normally and check the restored records.

Do not mix files from different backups or from the Chinese edition. The chain, deployment, database and encryption key must belong together.

## 12 Reset only when you want a new environment

Use reset only to deliberately return to a fresh demonstration. Do not reset merely because startup failed.

1. Stop normally.
2. Double-click `reset-demo.command`.
3. Read the explanation. To proceed, type `RESET ENGLISH` exactly and press Enter.
4. Existing data moves into `backups/reset-...`; it is not directly deleted.
5. The next launch creates a new chain and deployment.
6. Old verification JSON belongs to the old deployment. Register new credentials, or restore the complete old dataset.

Any other confirmation text cancels the reset. The command does not operate on the neighbouring Chinese project.

## 13 Troubleshooting

| Problem | What to do |
|---|---|
| Port already in use | Stop the existing Chinese or English launch window; do not run both default launchers together |
| Still connecting | Wait for startup to finish, keep the launch window running, check the URL and select Reconnect |
| Node not found | Install Node.js 24 LTS and reopen Terminal; this Mac can also use the prepared launcher |
| Backup exists but registration failed | Sign in to Credential records, filter Pending registration and complete it |
| No issuance permission | Have the administrator authorise the current wallet; check that the correct account is selected |
| Cannot export a package | Use the original issuer or administrator and sign in again |
| Session expired | Sign in and retry; another account does not inherit your session |
| Original PDF mismatches | Check whether the file was re-exported, the salt is wrong or the ID belongs to another credential |
| Package belongs to another deployment | Do not mix editions or pre-reset packages; restore the matching dataset or register again |
| Wallet prompt does not appear | Check the extension for a pending request, dismiss stale requests and retry in a compatible browser |
| Wallet balance or nonce looks wrong | Confirm the network; after a reset, follow wallet guidance to clear activity for the test network, without deleting wallet recovery information |
| Last operation missing after a forced stop | Check chain status and pending backups; use normal shutdown in future |
| SQLite experimental warning | Some Node versions display a warning; if startup completes normally, continue. Node 24 LTS is recommended |
| Key/deployment mismatch | Stop services and restore a complete backup rather than deleting random data files |

## 14 Suggested classroom presentation

1. Explain the issuer, holder and employer problem.
2. Show on-chain versus off-chain data.
3. Verify the original as VALID and the altered PDF as HASH_MISMATCH.
4. Authorise Institution B and issue its own credential.
5. Download the package and verify in an independent window.
6. Show records, issuer names, history and gas.
7. Revoke, then obtain REVOKED using the same PDF and JSON.
8. Stop and restart to demonstrate persistence.
9. Show tests for unauthorised actions and signed-session permissions.
10. Discuss truth of the underlying experience, administrator trust, salts, compromised keys and single-node limitations.

Rehearse the real MetaMask extension on the presentation computer and prepare a recording. Automated independent-key and EIP-1193 tests validate the protocol, not the real extension installation, prompts and account/network selection on that device.

# Local benchmark results

Measured at (UTC): 2026-11-24T10:59:29.666Z. Environment: darwin/arm64, Node v24.22.1.

This uses an isolated local Hardhat chain and does not change demonstration data. Hashing inputs are synthetic bytes with a PDF header, not renderable credentials. Functional cases use the actual original and altered sample PDFs. One issuance and revocation are excluded as a warm-up to initialise the counters.

| Input bytes | Median hash ms (5 runs) | Median query ms (10 runs) | Issue gas | Revoke gas |
|---|---|---|---|---|
| 1024 | 0.193 | 14.292 | 99032 | 36999 |
| 102400 | 7.599 | 13.645 | 99032 | 36999 |
| 1048576 | 60.59 | 12.017 | 99032 | 36999 |
| 5242880 | 305.463 | 12.424 | 99032 | 36999 |

Functional cases: 5/5 passed. See the JSON file for full results.

Results apply only to this machine and configuration. Queries include local RPC overhead. This does not measure public-network congestion, consensus delays, multiple institutions or internet latency, and does not show that blockchain is faster than a database.

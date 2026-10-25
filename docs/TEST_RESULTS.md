# Verification results · 25 October 2026

Release: SalonOS 0.1.0, Finance Manager Edition. These results describe what was actually run, not a claim that the entire master specification or production commissioning is complete.

Environment: Linux managed development environment, Node.js v24.22.1, npm 11.9.0, Next.js 16.4.3, Drizzle ORM 0.45.4, PGlite 0.5.11. PostgreSQL compatibility was exercised with the actual embedded PostgreSQL engine, not a mocked database or SQLite. A native PostgreSQL server could not be installed in this environment.

## Passed

| Check                        | Result                                   | Evidence                                                                      |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Dependency installation      | Passed                                   | npm installation and locked dependency tree                                   |
| SQL migrations               | Passed                                   | Initial schema, integrity triggers and rejected-receipt migration applied     |
| Demo seed                    | Passed                                   | 15 clients, 20 bookings, 10 services, 16 expenses and linked payment history  |
| Isolated demo reset          | Passed                                   | Stopped embedded demo recreated and re-seeded; generated credentials retained |
| Strict TypeScript            | Passed, exit 0                           | `verification/typecheck.txt`                                                  |
| Unit/database integration    | 33 passed, 0 failed, 0 skipped           | `verification/unit-integration.txt`                                           |
| Optimized production build   | Passed, exit 0                           | `verification/production-build.txt`                                           |
| Authenticated HTTP workflows | 18 passed                                | `verification/http-smoke.txt`                                                 |
| Ledger consistency check     | Passed                                   | Every journal balanced with at least two lines                                |
| Production dependency audit  | 0 reported vulnerabilities               | Final `npm audit --omit=dev` result                                           |
| Browser rendering            | Login page opened and visually inspected | Cloud Chrome desktop observation                                              |

## Financial/database scenarios covered

The 33-test suite checks integer money and invalid inputs, phone normalization/duplicate prevention, password hashing, credentials/session revocation, owner write rejection, required fields, multiple service quantities, discounts, historical price snapshots, advance liabilities, completion recognition, partial receipts, excess payments, idempotency conflicts, concurrent overpayment prevention, unverified receipt posting, completed-service credits/refunds, cancellation/refund balances, refund limits, duplicate reversals, reversing an advance after completion, future/invalid payment dates, locked completed invoices, stale edits, capitalization, expense accrual and settlement, expense reversals, booking-linked direct cost requirements, database rejection of unbalanced journals, immutable history, receivables/advance control reconciliation, database-derived reports, exact one-paisa allocation, rejection of incorrect reported receipts and concurrent duplicate submissions.

## HTTP scenarios covered

The HTTP suite runs against the real Next.js API and persistent demo database. It verifies the database-backed health endpoint, anonymous access rejection, cross-origin write rejection, both role logins, actual demo reads, client/service/discounted booking creation, repeated submission, excess/future payment rejection, advance → completion → balance receipt → refund, unpaid expense settlement and repeated-settlement prevention, owner rejection on every business mutation endpoint, owner reads, CSV export, an Excel file downloaded and parsed with ExcelJS, invalid upload rejection, stored PNG evidence with authenticated downloads, and session revocation at logout.

These tests create fictional QA records in a dedicated demo. They do not contact a bank or transfer money. They are HTTP workflow tests, not browser end-to-end tests.

## Dependency finding and correction

The initial production audit reported the old UUID dependency used by ExcelJS. The project now overrides that dependency with UUID 11.1.1, preserving ExcelJS's v4 call. The final audit reported zero vulnerabilities. The post-change Excel export is included in the HTTP regression run. Dependency audit results reflect the registry response on the verification date and are not a security certification.

## Not verified or not implemented

- Native PostgreSQL server migration/concurrency testing. The test runner supports an isolated `TEST_DATABASE_URL` ending in `_test` for staging verification.
- Full authenticated UI interactions in a browser, mobile/tablet viewport behavior, accessibility conformance, printed multi-page reports and browser save-to-PDF output. The login page was visually checked; HTTP tests verify the underlying authenticated workflows. Responsive layouts and accessible native controls are implemented, but full browser/device validation is outstanding.
- Docker image build/run, Render deployment, HTTPS/domain setup, a real PostgreSQL backup and restore drill, production monitoring/load testing or an independent security review.
- Inventory, stock units/valuation, creative shoots, reusable assets, payroll, daily closing/reconciliation and staff-report inbox. Those are explicitly future stages and were not tested as implemented features.

The local preview was used only for development verification. No successful public production deployment or permanent live URL is claimed.

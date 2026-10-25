# SalonOS · Finance Manager Edition

A cumulative Next.js application for one finance manager and a read-only owner, built from scratch. This first release implements login, dashboard, clients, service catalogue, multi-service bookings, payments, refunds/corrections, expenses/payables, evidence attachments, reporting and audit history.

**Version 0.1.0.** This is the first working release, not the entire 16-module product. Inventory, shoots, reusable wardrobe assets, payroll, daily closing and the manual staff inbox are planned next. See [scope](docs/RELEASE_SCOPE.md), [architecture](docs/ARCHITECTURE.md), [accounting rules](docs/ACCOUNTING.md), [test results](docs/TEST_RESULTS.md) and [deployment](docs/DEPLOYMENT.md).

## Fast local demo in VS Code

Requires Node.js 22 or newer, npm, and a modern browser. No real client information is needed. Use the full source folder containing this README as the VS Code working directory.

```bash
npm ci
npm run demo:setup
npm run dev
```

Open **http://localhost:3000**. Setup prints two generated passwords:

- Finance manager: `manager@salonos.demo`
- Read-only owner: `owner@salonos.demo`

Passwords are generated locally and saved only in your ignored `.env`. There are no universal default credentials. If you lose the printed demo passwords, inspect your own `.env` locally. Never upload it.

The demo uses persistent embedded PostgreSQL (PGlite, a PostgreSQL engine compiled to WebAssembly) in `.data/demo`, not browser storage. It is a convenient **development-only** option. Production requires a standard PostgreSQL server. All sample people and transactions are fictional. This release seeds 15 clients, 20 bookings, 10 services, advances, partial receipts, one unverified receipt, cancellation/service refunds, 16 expenses, direct costs, equipment purchases and unpaid supplier bills. It does not seed unimplemented inventory/shoot/payroll modules.

Setup deliberately refuses to overwrite an existing `.env`. If setup previously created `.env` but failed before seeding, finish with `npm run db:migrate` and `npm run db:seed`. Do not run the seed twice against a populated database.

To reset **only** the embedded demo, stop the dev server first:

```bash
npm run demo:reset -- --confirm
npm run dev
```

This command refuses all other database URLs and requires a database marked as demo. It deletes the local fictional demo, recreates it and retains the generated demo passwords. To remove demo data before real use, create an entirely separate, empty PostgreSQL database. Do not reuse the demo database.

## Use standard PostgreSQL locally

Install PostgreSQL 16+ or use Docker Desktop with the provided Compose file.

1. Copy `.env.example` to `.env`. On Windows PowerShell: `Copy-Item .env.example .env`. On macOS/Linux: `cp .env.example .env`.
2. Set `POSTGRES_PASSWORD` and set the same password in `DATABASE_URL`. Example database URL: `postgresql://salonos:YOUR_PASSWORD@localhost:5432/salonos` (URL-encode special password characters).
3. Set a random `SESSION_SECRET` of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Keep `APP_ORIGIN=http://localhost:3000`. It must exactly match the browser origin, including the port. This protects write requests against cross-site forgery.
5. Use `DEMO_MODE=false` for a clean business database. For a separate fictional demo database, deliberately set it to `true` and choose both demo passwords, minimum 12 characters.

```bash
docker compose up -d postgres
npm ci
npm run db:migrate
```

For a separate demo database only:

```bash
npm run db:seed
```

For a clean live database, skip seeding and create the two accounts with `npm run user:create` using the environment variables below. Then start with `npm run dev`.

### Create accounts or rotate a password

Set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_ROLE` in the local process environment. Valid roles: `finance_manager`, `owner`. The command creates an account or updates the matching email and revokes its existing sessions. Do not put passwords in command-line arguments or commit them.

PowerShell example (password entry is hidden):

```powershell
$env:ADMIN_NAME = "Hammas Ahmad"
$env:ADMIN_EMAIL = "manager@your-salon.example"
$env:ADMIN_ROLE = "finance_manager"
$secret = Read-Host "New password (12+ characters)" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
npm run user:create
Remove-Item Env:ADMIN_PASSWORD
```

Bash example:

```bash
export ADMIN_NAME='Hammas Ahmad'
export ADMIN_EMAIL='manager@your-salon.example'
export ADMIN_ROLE='finance_manager'
read -rs -p 'New password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_PASSWORD
npm run user:create
unset ADMIN_PASSWORD
```

Repeat with the owner's real name, email and `ADMIN_ROLE=owner`. These administrator commands are intentionally unavailable through the owner UI.

## First complete workflow

1. Sign in as finance manager. Add or find a client.
2. Open Bookings, create a booking, select multiple services and optionally apply a fixed PKR discount. Prices are captured on the invoice.
3. Open its details and record an advance. Verify it only after checking the actual cash or bank evidence.
4. On the service date, confirm the final invoice and mark the booking completed. This recognizes earned revenue and applies the advance.
5. Record the remaining payment. Overpayments are blocked.
6. Record a linked direct artist/rental cost or an operating expense. Record unpaid bills as unpaid, then settle them once.
7. Review the dashboard, client history, P&L, ledger, and outstanding balances. Sign in as owner to view and export the same data without write access.

Refund sends money back; Reverse corrects a mistaken entry. Both preserve the original. A refund after completion also issues a service credit note. Closed invoices cannot be silently rewritten. See the accounting guide for chronological entry rules and scope limits.

## Commands

| Command                           | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Next.js dev server, default port 3000                                  |
| `npm run typecheck`               | Strict TypeScript checking                                             |
| `npm test`                        | 33 unit/database integration tests, isolated embedded PostgreSQL       |
| `npm run test:http`               | Authenticated HTTP workflow smoke test against a running isolated demo |
| `npm run verify:ledger`           | Verify every stored journal balances                                   |
| `npm run build`                   | Optimized production build                                             |
| `npm start`                       | Start production server with standard PostgreSQL                       |
| `npm run db:migrate`              | Apply checksum-verified SQL migrations                                 |
| `npm run db:seed`                 | Deliberately seed an empty, demo-only database                         |
| `npm run user:create`             | Create/update a user from administrator environment variables          |
| `npm run demo:reset -- --confirm` | Reset only the stopped embedded demo                                   |

For HTTP tests, keep the server running in another terminal with `DEMO_MODE=true`. The suite writes fictional QA records and needs the generated demo passwords in the local environment. Set `SALONOS_TEST_URL` if the URL differs from `http://localhost:3000`. It verifies real cookies, API permissions, posting, refunds, CSV/XLSX exports and attachments. It is not a browser end-to-end test.

To run the integration suite against a real PostgreSQL server, create a disposable empty database whose name ends in `_test`, set `TEST_DATABASE_URL` to it and run `npm test`. The test suite creates fictional records and leaves them in that disposable database. Do not point it at a business database. Native PostgreSQL verification was not available in the development environment; the included results identify this limit.

## Storage and security

Business records, attachments, audit history, opaque session hashes and idempotency keys live in PostgreSQL. LocalStorage is not used. Amounts are integer paisa; allocation uses exact integer arithmetic. Every financial command is a single serializable database transaction. The single-salon settings row serializes writes, while version checks reject stale edits. Database constraint triggers independently reject unbalanced journals. Posted ledger entries, posted payments and audit history are protected against alteration.

Uploads are authenticated, manager-only, limited to PNG/JPEG/PDF and 3 MB, validated by file signature, and downloaded as attachments. There is no public uploads folder. Credentials use salted scrypt hashes. Sessions last 12 hours, are revocable and use HTTP-only SameSite cookies, with Secure cookies in production. The database records login throttling by account and IP key.

## Production

Standard PostgreSQL, HTTPS, unique credentials, accurate `APP_ORIGIN`, tested backups and a separate staging database are required. Use the included Render guide and blueprint; no public deployment was performed. A production build is not a substitute for a staging pilot, a native PostgreSQL concurrency run, full browser/device testing or a security review. This release does not provide tax filing, depreciation schedules or statutory accounting advice.

# Deployment and operations

No live production deployment was performed. The package is prepared for a Node web service plus PostgreSQL. Use a staging environment with fictional data before entering business records.

## Render preparation

Use a private Git repository with this source folder at its root. Do not commit `.env`, database files, screenshots, test credentials, `node_modules` or build output. The provided `render.yaml` declares the Node web service, health check, pre-deploy migration and linked PostgreSQL database. Review the service/database plans and costs in Render before creating resources. Pre-deploy commands and backup capabilities depend on the hosting plan; confirm them in the current Render dashboard.

Build:

```bash
npm ci --include=dev && npm run typecheck && npm run build
```

Pre-deploy:

```bash
npm run db:migrate
```

Start:

```bash
npm run start
```

Health path: `/api/health`. It checks the database and returns only ready/error status. It exposes no records. Next.js honors the host's `PORT` environment variable. The public web application must use HTTPS.

Set these environment variables in the hosting service, never in source:

| Variable         | Value                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | The PostgreSQL connection string from the attached database                                   |
| `DATABASE_SSL`   | `true` for TLS with certificate validation; follow the provider's connection/TLS requirements |
| `APP_ORIGIN`     | Exact HTTPS browser origin, including the correct host, with no path                          |
| `SESSION_SECRET` | Unique random secret, minimum 32 characters                                                   |
| `DEMO_MODE`      | `false` for a clean production database                                                       |
| `NODE_VERSION`   | `22`                                                                                          |

The blueprint connects over Render's internal database network and leaves `DATABASE_SSL=false`. Render documents different TLS requirements for internal and external connections; review its current instructions before changing the connection URL/SSL configuration. Never add `rejectUnauthorized:false` as a general workaround for TLS errors.

Run migrations against the empty database. Do not run the demo seed in production. Create the finance manager and owner accounts from a one-off administrator shell using the environment-driven `user:create` command described in README. Remove the temporary `ADMIN_PASSWORD` variable immediately. The runtime requires no permanent administrator password variable.

The Dockerfile builds the Next standalone server and runs as a non-root user. Migrations/account provisioning run separately from a source checkout/CI job; they are not shipped as an automatic production seed. Docker image build/run was not verified in the development environment.

## Staging verification before business use

1. Use a separate PostgreSQL database and different credentials/secrets from production.
2. Run the 33-test suite against an empty disposable `_test` database to verify native server behavior and serialization under the target PostgreSQL version.
3. Seed only a dedicated demo database. Exercise manager and owner workflows on desktop, tablet and mobile browsers. Inspect invoice print and PDF pagination.
4. Check advancing, completion, partial collection, cancellation, refund, reversal, payable settlement, stale edits and duplicated requests. Compare the client subledger with control accounts using the ledger check and SQL query below.
5. Create and restore a backup into a fresh database. Re-run the ledger check and compare counts/totals.
6. Pilot a small set of real operational records, compare manually against source reports, then broaden use. Inventory and payroll remain outside this release.

## Backups

Back up PostgreSQL, including attachments, before every migration and at a frequency appropriate to the salon's acceptable data-loss window. Use the provider's backup/recovery feature plus an encrypted copy outside the running application. Verify retention and availability for the actual plan. Do not back up production into an unprotected developer laptop or commit backups to Git.

With PostgreSQL client tools installed and connection information supplied through `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and a protected password file or `PGPASSWORD`:

```bash
pg_dump --format=custom --no-owner --file=salonos-backup.dump
```

Restore into a **new empty target database** selected through the corresponding `PG*` variables:

```bash
pg_restore --no-owner --no-privileges --dbname=salonos_restore_test salonos-backup.dump
```

The restore command is an operational example, not a tested restore in this environment. Use a PostgreSQL client major version compatible with the server. Restrict file permissions, encrypt backups, store them separately and periodically test a restore. Do not overwrite a live database to test recovery.

After restore, set `DATABASE_URL` to the restored isolated database and run:

```bash
npm run verify:ledger
```

Database-side reconciliation diagnostic:

```sql
SELECT j.id, COALESCE(SUM(l.amount_minor), 0) AS balance, COUNT(l.id) AS lines
FROM journals j
LEFT JOIN ledger_lines l ON l.journal_id = j.id
GROUP BY j.id
HAVING COALESCE(SUM(l.amount_minor), 0) <> 0 OR COUNT(l.id) < 2;
```

It should return zero rows. This detects unbalanced journals; it does not prove that every business transaction was entered correctly or completely.

## Routine maintenance

Restrict database credentials and access. Keep production secrets separate. Rotate user passwords through the administrator command (which revokes their sessions). Review login/error logs using incident IDs; API errors omit SQL/record details. Periodically prune expired sessions and obsolete login throttle records as an administrator; do not delete payment/ledger/audit history. Keep dependencies and the lockfile reviewed, take backups before updates and run the relevant regression tests.

The release includes a manually verified dependency override for ExcelJS's UUID dependency (`11.1.1`) to remove the audited vulnerable version while preserving its v4 API. See the test results for the final audit outcome. This does not replace a broader security review.

Official references consulted during preparation:

- https://render.com/docs/blueprint-spec
- https://render.com/docs/postgresql-creating-connecting
- https://render.com/docs/postgresql-backups
- https://render.com/docs/health-checks
- https://nextjs.org/docs/app/getting-started/installation

# Release 0.1.0 scope

This is the first working version requested at the end of the master brief. It is one cumulative project intended for the remaining stages.

| Area                | Delivered                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login               | Two roles, salted password hashes, opaque server sessions, logout, account/IP throttling                                                                                      |
| Dashboard           | Database-derived earned sales, collections, operating profit, balances, advances, bookings, daily chart and service mix, date presets/custom range                            |
| Clients             | Add/edit, normalized unique phone, search/filter, profiles, booking and payment history, export                                                                               |
| Services            | Add/edit, category, price, duration, planning estimate, active flag, historical booking snapshots                                                                             |
| Bookings            | Multiple services/quantities, fixed discount, artist and hairstylist names, notes, dates/status, individual detail page, advances/balances, direct costs/contribution         |
| Payments            | Seven manual methods, references/evidence, unverified/verified/rejected reports, overpayment checks, partial refunds, linked reversals                                        |
| Expenses            | Categories, overhead/direct/capital classification, paid/unpaid bills, supplier settlement, documented reversals, booking-linked costs, evidence                              |
| Reports             | Earned revenue, collections, receivables, expenses, service performance, booking contribution, P&L, general ledger, clients; date/search/sort, CSV/XLSX, browser print layout |
| Audit               | Append-only before/after records, correction reasons, latest 200 events with search and inspection                                                                            |
| Security/foundation | Server authorization, origin checks, input/amount validation, bounded uploads, transaction safety, idempotency, optimistic versions, SQL migrations and ledger constraints    |
| Delivery            | Full source, lockfile, environment example, Docker/Render preparation, demo seed/reset, tests and guides                                                                      |

Browser print/save-to-PDF uses the browser's normal dialog. Automated PDF generation/export is not implemented or claimed as tested. Tables expand their rows during print, but multi-page PDF layout still requires real browser verification.

## Not yet delivered

Inventory/products, suppliers as separate master records, measurement conversions, stock valuation/consumption, shoots/projects, vendor master records, wardrobe/jewellery checkout, staff master records and payroll/commission automation, daily closing/reconciliation, manual staff report inbox, automated backup scheduling and opening-balance/journal adjustment UI are future stages. The staff/artist fields in current bookings are names, not staff accounts.

Dashboard figures for stock/shoot/payroll are not invented. Those modules are named in Settings as planned. All available navigation routes perform real operations against the current database.

## Practical limits

- One salon and one currency. A manager/admin plus a read-only owner. The role boundary can be extended later.
- Full single-salon bootstrap; server pagination is not implemented. Audit UI shows the latest 200 events; complete audit history remains in the database.
- No automated tax/depreciation calculations, inventory cost accrual, staff commissions, bank reconciliation or messaging ingestion.
- Genuine refunds create a booking-level credit; independent invoice credit notes, cancellation fee recognition, partial expense payments/refunds and multi-booking receipts are not modeled yet.
- No in-app password recovery, password change, two-factor authentication, user management or user deactivation screen. Provision/rotate accounts through the included admin command. Sessions are revoked on password rotation.
- Secure file types and download handling are implemented; malware scanning is not included.
- Standard PostgreSQL, deployment, restore drills and full desktop/mobile authenticated browser E2E remain to be verified in staging. They are not silently marked as passed.

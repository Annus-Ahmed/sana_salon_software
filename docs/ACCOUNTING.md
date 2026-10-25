# First-release financial rules

All amounts are integer paisa, displayed in PKR. Dates are business dates in Asia/Karachi. Event/audit timestamps use timezone-aware timestamps. Automatic recognition is limited to completed salon bookings in this release.

## The four different numbers

- Booking value: contracted service value after discount, before later credits. An appointment is not itself earned revenue.
- Earned revenue: services actually completed, less completed-service refunds/credit notes, on their ledger dates.
- Net collections: verified client cash/digital receipts less cash/digital returns and corrections, on their transaction dates.
- Outstanding balances: unpaid net invoices for current open bookings. This includes future contracted bookings; the receivables control account includes only completed services. The screen labels this distinction.

A client payment marked unverified has zero ledger/balance effect. Verification posts the original receipt date after all financial checks. An incorrect unverified report can be rejected with a reason; its history remains visible.

## Generated journals

Positive ledger amounts are debits; negative amounts are credits. Every entry sums to zero.

| Event                                          | Debit                                                        | Credit                            |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Advance receipt                                | Cash / selected digital account                              | Customer advances                 |
| Completion after a partial advance             | Customer advances for net advance; receivables for remainder | Service revenue for net invoice   |
| Receipt after completion                       | Cash / digital account                                       | Customer receivables              |
| Refund before completion or after cancellation | Customer advances                                            | Cash / digital account            |
| Genuine refund after completion                | Service refunds / credit notes                               | Cash / digital account            |
| Paid operating expense                         | Overhead or linked direct cost                               | Cash / digital account            |
| Unpaid operating expense                       | Overhead or linked direct cost                               | Supplier payables                 |
| Pay an accrued supplier bill                   | Supplier payables                                            | Cash / digital account            |
| Equipment purchase                             | Equipment asset                                              | Cash / digital account or payable |
| Expense correction                             | Original credit-side account                                 | Original cost/asset account       |

Payment method accounts distinguish cash, bank transfers, Raast, Easypaisa, JazzCash, card clearing and other collections. These are manually recorded accounts; there are no payment transfers or integrations.

Example: PKR 80,000 booking, PKR 30,000 advance. The advance creates cash and an advance liability, with zero earned revenue. Completion debits advances PKR 30,000 and receivables PKR 50,000, and credits revenue PKR 80,000. The later PKR 50,000 receipt clears receivables.

## Refund versus recording correction

A refund represents money actually returned. A completed-service refund includes a revenue credit note and reduces the client's net billed amount. A refund before performance reduces the advance, while the contracted service amount remains unchanged. Cancelling/no-showing an appointment recognizes no revenue; its retained advance remains refundable, not profit. Cancellation fees and advance forfeiture are not supported in this release.

A reversal corrects a mistaken posted receipt/refund; it does not erase it. A mistaken receipt reversed after completion debits receivables rather than creating a negative advance liability. Refund reversals also reverse any associated service credit. A receipt with active refunds cannot be reversed until those refunds are reversed. Partial refunds cannot exceed the remaining amount on the original receipt or the booking's net money held. Duplicate reversals are blocked.

Expense reversals are for erroneous entries or a full supplier refund, and restore cash/bank when the expense was paid. Genuine unpaid supplier credit notes and partial supplier refunds are not modeled separately in this release. Do not use an expense reversal to represent an unpaid refund you are still waiting to receive.

## Chronology and correction rules

- Transaction dates must be real calendar dates and cannot be in the future.
- Completion cannot precede the appointment or the latest posted payment date already recorded for the open booking.
- Once a booking is completed, newly entered receipts/refunds/corrections cannot be dated before its completion date.
- Refunds/reversals cannot precede their source transaction. Supplier settlement cannot precede its bill.
- For historical catch-up, enter completion first, then receipts that actually happened later. If a receipt was actually an earlier advance, enter it before completing the booking.
- Open invoice edits require a reason, retain the previous version in audit history and cannot reduce the invoice below net payments already held.
- Completed/cancelled/no-show invoices are locked. An invoice amount error on a closed booking needs a manager-reviewed refund/correcting workflow; general journal editing and reopening are deliberately not exposed yet.
- There is no accounting period lock or daily closing yet. Date validation protects chronology but does not substitute for a closed-period control.

## Profit reporting

Operating profit before depreciation and tax = recognized service revenue − service credit notes − recorded direct costs − operating overheads. Equipment is capitalized and excluded. Advances and money collected are not sales revenue. Supplier settlement never recognizes a second expense. Direct cost accrual is recognized on the entered cost date; this release does not defer work-in-progress costs until booking completion.

Booking contribution uses currently recorded revenue after credits minus actual linked direct costs, across all dates, for completed bookings selected by completion date. This differs from a period P&L. Catalogue material estimates are planning figures and never automatically become expenses. Until inventory is implemented, contribution is incomplete if the manager has not recorded all actual direct costs. It must not be presented as fully absorbed profit.

Service mix/performance allocates fixed discounts exactly across invoice lines with integer allocation. It shows discounted gross earned service value before later credit notes; refunds and actual costs are tracked at booking level, not arbitrarily assigned to an individual service.

The current receivables report is a live register, not an historical aging snapshot. The P&L and ledger are filtered by transaction date. Ledger account balances shown as-of a date include entries through that date. No tax, depreciation, opening-balance import, inventory valuation, payroll accrual engine, bank statement matching or statutory financial statements are claimed in this release.

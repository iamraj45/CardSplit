# CardSplit

CardSplit is a browser-based credit card reconciliation app that helps organize transactions, split expenses among people, track multiple credit cards, and generate detailed person-wise reports. Built with React and Vite, it supports local data storage, statement imports, and backup/restore, with future plans for cloud synchronization.

It reconciles each card's statement by billing period, shows who owes what across several cards and people, then produces a report you can print, save as PDF or paste into a chat.

Built with React, Vite and Material UI. Data is stored in the browser (IndexedDB), and there is no backend. It is designed to be hosted as a static site on Netlify.

The original plan is in [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Features

- **Name-only sign-in** (no password): your name becomes a person in every reconciliation you create or open. A one-click **"(me)"** option in "Who pays for this?" assigns an expense to you. Use **Switch user** in the top bar to change who you are.
- **Reconciliations by period:** each billing period is its own reconciliation. The app warns about duplicate or overlapping periods.
- **Cards:** card name, last four digits only, statement period, statement total, and a gradient tile per card.
- **Transactions:** a single **Expense name** field. Refunds and credits are negative amounts. The original statement description is kept for reference.
- **Statement import** from text-based PDF, CSV or Excel, with a review step before anything is saved (see below).
- **Splits:** one person, equal, percentage, custom amounts, or assign later. Rounding is exact to the paisa (see below).
- **People** are saved on the device and offered again in new reconciliations.
- **External adjustments:** items outside any card statement. They count toward each person's totals and never change a card's statement figures.
- **Checks:** each card's statement total vs the entered transactions, unassigned items or splits that don't add up, totals that don't reconcile, possible duplicates, dates outside the statement period, and notes on refunds and fees. Differences are shown, never adjusted to make totals match.
- **Report:** card-wise person totals, with each item's share and how it was worked out (e.g. "60% of ₹2,742.99"), adjustments, consolidated totals and status.
  - Print or Save as PDF.
  - **Copy text** or **Share** produces the compact layout for pasting into a chat.
- **JSON backups:** export everything or a single reconciliation, then import on another device. Imports are validated and you choose what happens when a reconciliation already exists.
- Every change is saved immediately.

### Statement import

- **PDF:** the parser reads text positions instead of using a separate template for each bank.
  - It finds the table header ("Date … Amount") and matches each value to the nearest column, keeping amounts separate from cashback and reward-point columns.
  - It joins descriptions that wrap onto more than one line, even when the date and amount sit between the lines.
  - It understands Dr/Cr markers and the single-letter C/D/M markers used by SBI Card.
  - Lines without their own date, such as GST rows, take the date of the line above.
  - It detects the card name, last 4 digits, statement period and total due.
  - Tested against real Axis, ICICI, SBI Card and Yes Bank statements (the tests run when the files are in `samples/`, which is gitignored).
  - Password-protected PDFs are supported. Scanned (image-only) PDFs are not.
- **CSV / Excel:**
  - The header row is found automatically, even below preamble rows.
  - Amounts can be one column (with Dr/Cr suffixes or a Dr/Cr column) or separate Debit and Credit columns.
  - Rows without a valid date or amount, such as totals and footers, are skipped.
  - Column choices are remembered for files with the same headers.
- **Review step:**
  - Bill payments are excluded by default; cashback and refunds stay as negative amounts.
  - Rows with the same date and amount as a transaction already on the card start unticked.
  - Everything is editable.
  - The running total is compared with the statement's total due before you import.

### Split rounding

Amounts are integer paise and percentages are basis points (100% = 10000). Equal and percentage splits round each share down, then hand the leftover paise to the largest fractional remainders, with ties going to the person listed first. Shares always add up exactly to the amount. Custom amounts must add up exactly before the item can be saved.

## Data, privacy and backups

- Only the card name and **last four digits** are stored, never a full card number or CVV. Backups are rebuilt field by field when imported, so nothing else can arrive through a file.
- Statement files and PDF passwords are processed entirely in the browser and never uploaded.
- **Data stays in this browser on this device.** Netlify only hosts the app; it never sees your data. Nothing syncs between devices.
  - To move to another device, use **Export backup** on the dashboard and **Import backup** on the other device.
  - Clearing browser or site data deletes local data, so export a backup regularly. The dashboard reminds you when the last backup is more than 30 days old.
- A PDF report is for viewing and sharing. Only the JSON backup restores editable data.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests
npm run lint     # oxlint
npm run build    # production build in dist/
```

Requires Node 20.19+ or 22.12+ (Netlify builds with Node 24).

### Structure

| Path | What it holds |
|---|---|
| `src/features/model.js` | Data model and schema migrations. Money is integer paise; dates are ISO `YYYY-MM-DD`. |
| `src/services/storage/` | Storage abstraction. `index.js` is the single place to swap in a future Supabase adapter. |
| `src/services/calculations/` | Pure functions: splits and rounding, totals, status, checks. |
| `src/services/import/` | Statement parsing (PDF, CSV, Excel), with no UI dependencies. PDF.js, SheetJS and Papa Parse load only when an import starts. |
| `src/features/reports/` | Report data and the plain-text report. |
| `src/features/backups/` | Backup format, validation, migrations and conflict handling. |
| `src/features/reconciliations/useReconciliation.js` | Loads a reconciliation and saves every change immediately, one write at a time. |
| `src/pages/`, `src/components/` | UI. |

## Deploying to Netlify

`netlify.toml` already configures the build (`npm run build`, publish `dist`, Node 24), single-page-app routing, security headers, and long-term caching for `/assets`.

1. In Netlify, choose **Add new site → Import an existing project**, then pick this GitHub repository.
2. Leave the base directory empty. The build settings are read from `netlify.toml`.
3. Deploy. Every push to `main` redeploys automatically.

## Future

- Supabase for sign-in and syncing between devices, behind the existing storage interface.
- OCR for scanned PDFs.

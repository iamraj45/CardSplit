# Credit Card Bill Reconciliation App
## Implementation Plan

**Version:** 1.0  
**Hosting:** Netlify  
**Frontend:** React + Vite  
**Storage for Version 1:** Browser IndexedDB  
**Future enhancement:** Supabase for cloud storage and cross-device synchronization

---

## 1. Project Overview

Build a browser-based application that helps reconcile credit card statements, allocate transactions among people, calculate person-wise totals, and generate a clear reconciliation report.

The app should be easy to use, require no backend for the first version, and be structured so cloud storage can be added later without rewriting the core application.

### Goals

- Import credit card transactions from supported statement files.
- Assign each transaction to one or more people.
- Support equal, percentage-based, and custom-amount splits.
- Track multiple credit cards and monthly reconciliation periods.
- Add separate adjustments that are not included in card statement totals.
- Automatically calculate totals and flag discrepancies.
- Generate a printable report and export it as PDF.
- Save reconciliations locally and transfer them between devices using backups.
- Deploy the application to Netlify.

### Out of Scope for Version 1

- Supabase, account login, and automatic cloud synchronization.
- AI-based transaction categorization.
- Banking or email integrations.
- OCR for scanned PDFs.
- Automatic settlement payments.
- EMI tracking or a full personal-finance dashboard.

---

## 2. Technology Stack

| Area | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Browser-based application |
| UI | Material UI (MUI) | Forms, dialogs, tables, navigation, and cards |
| Hosting | Netlify | Static website hosting and deployment |
| Local persistence | IndexedDB | Store saved reconciliations in the current browser |
| PDF import | PDF.js | Extract text from supported text-based PDFs |
| CSV import | Papa Parse | Parse CSV transaction files |
| Excel import | SheetJS | Parse `.xlsx` files |
| Reports | Browser print / Save as PDF | Generate printable reconciliation reports |
| Backup | JSON export/import | Move and restore full reconciliation data |

No application server, paid API, AI service, or Supabase dependency is required for Version 1.

---

## 3. Main Application Areas

### 3.1 Dashboard

The dashboard should provide:

- Create a new reconciliation.
- Browse and reopen saved reconciliation periods.
- See the period, cards included, people involved, and reconciliation status.
- Import a JSON backup.
- Export a backup of saved data.
- Delete a saved reconciliation, with confirmation.

Each reconciliation period should be a separate project, for example:

- March–April 2026
- April–May 2026
- May–June 2026

The app should warn before creating duplicate periods or replacing an existing reconciliation.

### 3.2 Credit Card Management

Each card should have:

- Card name, such as **HDFC Swiggy Credit Card**.
- Last four digits only.
- Statement period.
- Statement total.
- Imported transaction count.
- Reconciliation status.
- A distinct gradient or placeholder card design.

Example card presentation:

- Card name: HDFC Swiggy Credit Card
- Card number display: `•••• 4821`
- Statement total: ₹6,623.00
- Status: Reconciled / Needs review

Use different gradient treatments to distinguish cards visually. The last four digits should be entered manually when they cannot be reliably extracted from a statement.

**Security:** Never store the full card number or CVV. Only the card name and last four digits are needed.

### 3.3 Statement Import

Support the following import formats in stages:

1. CSV
2. Text-based PDF
3. Excel (`.xlsx`)

Import workflow:

1. Select the credit card and statement period, or create a card record.
2. Upload a statement.
3. Extract transaction date, original transaction description, and amount when available.
4. Show a review screen before saving.
5. Allow corrections to extracted data.
6. Detect likely duplicate transactions and flag them for review.
7. Save confirmed transactions to the reconciliation.

Scanned PDFs and OCR are deferred. Statement formats vary by issuer, so import mappings and validation should be designed to accommodate different layouts. The original transaction description may be retained internally for reference, but the main user-facing editable field will be a single **Expense name** field.

### 3.4 Expense Allocation

Each transaction should include:

- Transaction date.
- Original transaction description, retained as import/reference data when useful.
- **Expense name** — the only user-facing name field, such as `Dentist`, `H&M`, `Recharge`, or `Hotel`.
- Amount.
- Split method.
- Person-wise allocation.
- Assignment status.

Do not show separate editable `Description` and `Expense name` fields. The user-facing field is **Expense name**.

#### Supported assignment methods

**A. All mine / one person**

Assign 100% of a transaction to one person.

**B. Equal split**

Divide the transaction evenly among selected people. Handle rounding deterministically to the nearest paisa so the allocated amounts always sum to the original transaction amount.

**C. Percentage split**

Assign a percentage to each person. Percentages must total 100%. Validate the percentages before accepting the split and calculate each person's share to the nearest paisa, resolving any rounding remainder deterministically.

**D. Custom amounts**

Allow explicit amounts for each person. The sum of the assigned amounts must equal the transaction amount before the split is marked complete.

#### People management

- Save names for reuse across reconciliation periods on the current device.
- Allow people to be added, renamed, and selected for transactions.
- Preserve person references within saved reconciliation data.
- Flag transactions that have not been fully assigned.

### 3.5 Separate Adjustments

Support additional items that are not part of any card statement total, such as:

- Pondicherry: ₹1,000
- Slice: ₹541
- Slice: ₹3,300

Each adjustment should have:

- Name or label.
- Amount.
- Person or people assigned.
- Split method, if shared.
- Optional note.
- Clear designation as an **external adjustment**, separate from card transactions.

External adjustments should affect consolidated person totals but must not silently change card statement totals.

### 3.6 Reconciliation and Validation

The app should calculate totals automatically and flag mismatches.

Required checks:

- Sum of imported transactions compared with the statement total.
- Sum of allocations compared with each transaction amount.
- Sum of person-wise card allocations compared with the card's assigned transaction total.
- Consolidated totals across all cards and adjustments.
- Detection and review of unassigned transactions.
- Duplicate transaction warnings.
- Review of refunds, credits, fees, and other statement-specific entries.
- Clear distinction between statement totals and external adjustments.

Do not silently change values to force totals to match. Show the difference and allow the user to inspect and correct it.

Use integer paise for calculations to avoid floating-point currency errors. Format values as Indian rupees for display.

---

## 4. Report Generation

The final report should follow the user's preferred compact, itemized style.

### Report sections

1. Reconciliation period.
2. Card-wise statement totals.
3. Person-wise allocations under each card.
4. Itemized expense calculations and subtotals.
5. Separate external adjustments.
6. Consolidated total for each person across cards.
7. Final reconciliation status and any discrepancies.

### Example layout

```text
March – April

HDFC Swiggy Credit Card •••• 4821 — ₹6,623

Akansha: ₹2,562
Abhishek: ₹4,061

ICICI Credit Card •••• 1234 — ₹6,982

Akansha: ₹2,880 (Dentist)
Abhishek: ₹4,102

External adjustments
Pondicherry: ₹1,000
Slice: ₹541
Slice: ₹3,300

Consolidated totals
Akansha: [calculated total]
Abhishek: [calculated total]

Reconciliation status: [Reconciled / Needs review]
```

The example is illustrative. The application must calculate the actual totals from saved data rather than rely on hard-coded example values.

### Export options

- Print-friendly report.
- Browser print / Save as PDF.
- JSON backup of the complete editable reconciliation data.

A PDF report is for viewing and sharing; the JSON backup is required to restore the editable transactions and assignments.

---

## 5. Saving and Accessing Reconciliations

### Version 1: IndexedDB and manual backups

Store data locally in IndexedDB, including:

- Reconciliation metadata and period.
- Credit cards and their last four digits.
- Statement totals and transactions.
- Expense names and person assignments.
- Split method and allocation values.
- External adjustments.
- Saved people names and report settings.

Features:

- Auto-save changes.
- Show save status where useful.
- Reopen saved reconciliations in the same browser on the same device.
- Export a JSON backup.
- Import a JSON backup on another device.
- Validate imported backup structure and version.
- Warn before overwriting a reconciliation with the same ID.
- Handle invalid or unsupported backup files with a useful error message.

**Important limitation:** Netlify hosts the app, not the user's saved data. IndexedDB is local to the browser and device. It does not automatically sync across devices. To open a reconciliation on another device in Version 1, export the JSON backup and import it there. Clearing browser/site data may delete local records, so users should keep backups.

### Future Version: Supabase

Supabase is deliberately excluded from Version 1 but should be straightforward to add later.

Future capabilities may include:

- User authentication.
- Cloud persistence for reconciliations.
- Access from multiple devices.
- Synchronization and conflict handling.
- Optional cloud backup.

Avoid coupling UI components or calculation logic directly to IndexedDB. Use a storage abstraction so a future Supabase adapter can be added without major changes.

Suggested storage operations:

```js
listReconciliations()
getReconciliation(id)
saveReconciliation(data)
deleteReconciliation(id)
exportBackup()
importBackup(file)
```

---

## 6. Suggested Project Structure

```text
credit-card-reconciliation/
├── public/
├── src/
│   ├── app/
│   │   ├── App.jsx
│   │   └── routes.jsx
│   ├── components/
│   │   ├── CreditCardTile.jsx
│   │   ├── ExpenseEditor.jsx
│   │   ├── SplitEditor.jsx
│   │   ├── StatementUploader.jsx
│   │   ├── ReconciliationStatus.jsx
│   │   └── ConfirmDialog.jsx
│   ├── pages/
│   │   ├── DashboardPage.jsx
│   │   ├── ReconciliationPage.jsx
│   │   ├── CardTransactionsPage.jsx
│   │   └── ReportPage.jsx
│   ├── features/
│   │   ├── cards/
│   │   ├── transactions/
│   │   ├── people/
│   │   ├── adjustments/
│   │   ├── reports/
│   │   └── backups/
│   ├── services/
│   │   ├── storage/
│   │   │   ├── storageInterface.js
│   │   │   └── indexedDbStorage.js
│   │   ├── import/
│   │   │   ├── csvImporter.js
│   │   │   ├── pdfImporter.js
│   │   │   └── excelImporter.js
│   │   └── calculations/
│   │       ├── splitCalculations.js
│   │       ├── totals.js
│   │       └── reconciliation.js
│   ├── utils/
│   │   ├── currency.js
│   │   └── dates.js
│   ├── theme/
│   └── main.jsx
├── netlify.toml
├── package.json
└── README.md
```

The structure is a starting point and may be adjusted during implementation, but storage, importing, calculations, and presentation should remain separated.

---

## 7. Development Roadmap

### Phase 1 — Foundation and dashboard

- Initialize React + Vite and MUI.
- Configure routing and responsive layout.
- Build dashboard and reconciliation creation.
- Define the data model.
- Implement IndexedDB persistence and auto-save.

**Deliverable:** Create, save, reopen, and delete a monthly reconciliation.

### Phase 2 — Credit cards and transactions

- Build gradient credit card tiles.
- Add card name, last four digits, period, and statement total.
- Implement manual transaction entry and editing.
- Add the single Expense name field.
- Build card transaction lists.

**Deliverable:** Manage multiple cards and transactions without importing statements.

### Phase 3 — Splits and adjustments

- Implement one-person, equal, percentage, and custom splits.
- Validate split totals and rounding.
- Implement saved people names.
- Add external adjustments.
- Build transaction assignment status.

**Deliverable:** Correctly allocate expenses among multiple people.

### Phase 4 — Import and review

- Add CSV import.
- Add PDF text extraction.
- Add Excel import.
- Build import review and correction flow.
- Add duplicate warnings and import validation.

**Deliverable:** Import supported statement formats and verify transactions before saving.

### Phase 5 — Calculations and reports

- Implement card totals and person-wise allocations.
- Add reconciliation discrepancy checks.
- Calculate consolidated totals including external adjustments.
- Build report layout.
- Add print and Save as PDF support.

**Deliverable:** Generate an accurate report from saved data.

### Phase 6 — Backup and Netlify deployment

- Implement JSON backup export and import.
- Validate backup versions and handle import conflicts.
- Test restoration in another browser/device.
- Configure Netlify build and SPA routing.
- Document local storage limitations and backup recommendations.

**Deliverable:** A deployed browser-only app with portable reconciliation backups.

---

## 8. Testing and Acceptance Criteria

- [ ] Create, edit, save, reopen, and delete separate monthly reconciliations.
- [ ] Add multiple cards with names and last four digits.
- [ ] Display card tiles with distinct gradients and statement totals.
- [ ] Use only one user-facing expense name field.
- [ ] Assign transactions to one person.
- [ ] Split transactions equally between people.
- [ ] Split transactions by percentages totaling 100%.
- [ ] Assign custom amounts that sum to the transaction total.
- [ ] Handle currency rounding consistently to the nearest paisa.
- [ ] Save and reuse people names.
- [ ] Add external adjustments without altering card statement totals.
- [ ] Import supported CSV, text-based PDF, and Excel files.
- [ ] Review and correct imported transactions.
- [ ] Flag unassigned expenses, duplicate candidates, and discrepancies.
- [ ] Generate accurate card-wise and consolidated person-wise totals.
- [ ] Print or save a report as PDF.
- [ ] Export and import JSON backups successfully.
- [ ] Restore a backup on a different browser/device.
- [ ] Deploy successfully to Netlify.
- [ ] Verify that no full card number or CVV is stored.

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Statement formats differ by bank | Provide import review and editable extracted fields |
| Scanned PDFs cannot be parsed as text | Defer OCR; clearly explain unsupported files |
| Local browser data is cleared | Provide JSON backups and reminders to export them |
| Data is needed on another device | Use JSON export/import now; add Supabase later |
| Split rounding creates a one-paisa mismatch | Use integer paise and deterministic remainder handling |
| Imported duplicates inflate totals | Flag likely duplicates for user review |
| Statement totals do not match transactions | Show explicit discrepancies rather than silently adjusting values |
| Future cloud storage requires architectural changes | Keep persistence behind a storage abstraction |

---

## 10. Final Implementation Decisions

- **Application:** Credit Card Bill Reconciliation App.
- **Frontend:** React + Vite + Material UI.
- **Hosting:** Netlify.
- **Version 1 persistence:** IndexedDB.
- **Cross-device access in Version 1:** JSON backup export/import; no automatic sync.
- **Future storage:** Supabase, added later.
- **Expense naming:** One user-facing Expense name field.
- **Card presentation:** Gradient/placeholder card design with card name and last four digits.
- **Splitting:** One-person, equal, percentage-based, and custom amounts.
- **Adjustments:** Supported separately from card statement totals.
- **Reports:** Card-wise breakdown, itemized allocations, consolidated person totals, and discrepancy checks.
- **Primary priority:** Correct calculations, reliable local saving, and portable backups before adding cloud synchronization.

**Recommended first implementation milestone:** Build the dashboard, data model, card management, manual transaction entry, and IndexedDB persistence. This establishes the core workflow before statement parsing is introduced.

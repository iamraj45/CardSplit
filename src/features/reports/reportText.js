// Plain-text report in the compact style used for sharing (e.g. pasting into a chat):
//
//   March – April 2026
//
//   HDFC Swiggy Credit Card •••• 4821 — ₹6,623
//   Akansha: ₹2,880 (Dentist)
//   Abhishek: ₹3,743 (Groceries ₹500 + Hotel ₹3,243)
//   ...

import { formatINR } from '../../utils/currency';

const inr = (paise) => formatINR(paise, { compact: true });

/** "Dentist" for a single full-amount item, otherwise "Dentist ₹2,880 + Hotel ₹1,645.79 − Refund ₹60". */
function itemSummary(items) {
  if (items.length === 1 && items[0].sharePaise === items[0].amountPaise) return items[0].name;
  return items
    .map((e, i) => {
      const sign = e.sharePaise < 0 ? (i === 0 ? '−' : ' − ') : i === 0 ? '' : ' + ';
      return `${sign}${e.name} ${inr(Math.abs(e.sharePaise))}`;
    })
    .join('');
}

export function buildReportText(report, { itemised = true } = {}) {
  const lines = [report.name, ''];

  for (const c of report.cards) {
    lines.push(`${c.card.name} •••• ${c.card.last4} — ${inr(c.statementTotalPaise)}`);
    for (const p of c.persons) {
      lines.push(`${p.person.name}: ${inr(p.totalPaise)}${itemised ? ` (${itemSummary(p.items)})` : ''}`);
    }
    if (c.unassigned.items.length) {
      const names = c.unassigned.items.map((t) => t.expenseName).join(', ');
      lines.push(`Unassigned: ${inr(c.unassigned.totalPaise)}${itemised ? ` (${names})` : ''}`);
    }
    if (c.transactionCount > 0 && c.differencePaise !== 0) {
      lines.push(`⚠ Entered ${inr(c.enteredPaise)}, differs from statement by ${inr(c.differencePaise)}`);
    }
    lines.push('');
  }

  if (report.adjustments.length) {
    lines.push('External adjustments');
    for (const a of report.adjustments) {
      let who = '';
      if (!a.assigned) who = ' — unassigned';
      else if (a.shares.length === 1) who = ` — ${a.shares[0].name}`;
      else if (itemised) who = ` — ${a.shares.map((s) => `${s.name} ${inr(s.paise)}`).join(', ')}`;
      lines.push(`${a.adjustment.name}: ${inr(a.adjustment.amountPaise)}${who}`);
    }
    lines.push('');
  }

  const { rows, unassignedCardsPaise, unassignedAdjustmentsPaise } = report.consolidated;
  if (rows.length) {
    lines.push('Consolidated totals');
    for (const r of rows) {
      const breakdown =
        itemised && r.adjustmentsPaise !== 0 ? ` (cards ${inr(r.cardsPaise)} + adjustments ${inr(r.adjustmentsPaise)})` : '';
      lines.push(`${r.person.name}: ${inr(r.totalPaise)}${breakdown}`);
    }
    const unassigned = unassignedCardsPaise + unassignedAdjustmentsPaise;
    if (unassigned !== 0) lines.push(`Unassigned: ${inr(unassigned)}`);
    lines.push('');
  }

  lines.push(`Reconciliation status: ${report.statusLabel}`);
  for (const issue of report.issues) lines.push(`• ${issue.title}`);
  return lines.join('\n').trim();
}

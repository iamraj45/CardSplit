// Extracts transactions and summary details from text-based PDF statements.
//
// The parser works on positioned text (see pdfText.js) rather than a bank-specific template:
//  1. Items are grouped into lines by their y position.
//  2. A header line ("Date ... Amount") defines the table columns; every value is assigned to
//     the column whose header centre is nearest, which separates amount from cashback/reward
//     columns and description from category columns.
//  3. A transaction row is a line with a date aligned to the date column and a parseable amount.
//     Lines directly beneath a row that only contain description text are wrapped descriptions.
//  4. Rows dated well outside the statement period (e.g. EMI schedules) are dropped.

import {
  AMOUNT_TOKEN,
  DATE_PATTERN,
  MARKER_TOKEN,
  isBillPayment,
  parseAmount,
  parseDate,
  signedStatementPaise,
} from './parseHelpers';

export const TXN_KIND = {
  CHARGE: 'charge',
  CREDIT: 'credit',
  PAYMENT: 'payment',
};

const ROLE_PATTERNS = [
  ['date', /^(txn\.?\s*|transaction\s+|posting\s+|tran\s+)?date\b/i],
  ['category', /category/i],
  ['amount', /^(?!.*(intl|international|foreign|cashback|reward|points|emi)).*amount/i],
  ['debit', /^(debit|withdrawal)s?\b/i],
  ['credit', /^(credit|deposit)s?\b(?!\s*card)/i],
  ['description', /(details|description|particulars|narration|merchant|transaction)/i],
];

const center = (item) => item.x + item.w / 2;

/** Group items into lines (top to bottom), items sorted left to right. */
export function buildLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    const tolerance = Math.max(2, Math.min(item.h, line?.h ?? item.h) * 0.4);
    if (line && Math.abs(line.y - item.y) <= tolerance) {
      line.items.push(item);
    } else {
      lines.push({ y: item.y, h: item.h, items: [item] });
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join(' ');
  }
  return lines;
}

/** Split items like "16/09/2026 MAKEMYTRIP" into a date item and a text item. */
function splitLeadingDates(items) {
  const re = new RegExp(`^(${DATE_PATTERN})\\s+(.+)$`);
  return items.flatMap((it) => {
    const m = re.exec(it.str);
    if (!m || !parseDate(m[1])) return [it];
    const ratio = m[1].length / it.str.length;
    const dateW = it.w * ratio;
    return [
      { ...it, str: m[1], w: dateW },
      { ...it, str: m[2], x: it.x + dateW + 2, w: it.w - dateW - 2 },
    ];
  });
}

/** Merge header fragments that sit next to each other ("Amount (in" + "`" + ")"). */
function mergeHeaderItems(items) {
  const merged = [];
  for (const it of items) {
    const prev = merged.at(-1);
    if (prev && it.x - (prev.x + prev.w) < 4) {
      merged[merged.length - 1] = { ...prev, str: `${prev.str} ${it.str}`, w: it.x + it.w - prev.x };
    } else {
      merged.push({ ...it });
    }
  }
  return merged;
}

function headerFromLine(line) {
  const columns = mergeHeaderItems(line.items).map((it) => {
    const role = ROLE_PATTERNS.find(([, re]) => re.test(it.str))?.[0] ?? null;
    return { ...it, role, center: center(it) };
  });
  // The first "date"/"amount"/"description" column wins; later duplicates become unknown columns.
  const seen = new Set();
  for (const c of columns) {
    if (c.role && seen.has(c.role)) c.role = null;
    if (c.role) seen.add(c.role);
  }
  const has = (role) => columns.some((c) => c.role === role);
  if (!has('date') || !(has('amount') || has('debit') || has('credit'))) return null;
  return {
    columns,
    left: Math.min(...columns.map((c) => c.x)) - 15,
    dateColumn: columns.find((c) => c.role === 'date'),
  };
}

const TEXT_ROLES = new Set(['description', 'category', null]);
const NUMBER_ROLES = new Set(['amount', 'debit', 'credit', null]);

/**
 * Nearest header column by centre, among columns that can hold this kind of value:
 * amounts never land in a text column and text never lands in the date or amount columns.
 */
function nearestColumn(header, item) {
  const allowed = isAmountItem(item) ? NUMBER_ROLES : TEXT_ROLES;
  const c = center(item);
  let best = null;
  for (const col of header.columns) {
    if (!allowed.has(col.role)) continue;
    if (!best || Math.abs(col.center - c) < Math.abs(best.center - c)) best = col;
  }
  return best ?? { role: null };
}

const HAS_MARKER = /(?:cr|dr)\.?$|\s[cdm]$/i;

/** Attach stand-alone markers ("Dr", "Cr", or SBI's "C"/"D"/"M") to the amount before them. */
function attachMarkers(items) {
  const out = [];
  for (const it of items) {
    const prev = out.at(-1);
    if (prev && MARKER_TOKEN.test(it.str) && isAmountItem(prev) && !HAS_MARKER.test(prev.str)) {
      out[out.length - 1] = { ...prev, str: `${prev.str} ${it.str}`, w: it.x + it.w - prev.x };
    } else {
      out.push(it);
    }
  }
  return out;
}

// Must actually parse: "90.00)" inside "(EXCL TAX 90.00)" is description text, not an amount.
const isAmountItem = (it) => AMOUNT_TOKEN.test(it.str) && /\.\d{2}/.test(it.str) && parseAmount(it.str) !== null;
const isNumberOnly = (s) => /^[\d\s.,]+$/.test(s);

/** Of several candidates in a column, the one closest to the column's header. */
function closestTo(column, items) {
  if (!column || items.length <= 1) return items[0];
  return [...items].sort((a, b) => Math.abs(center(a) - column.center) - Math.abs(center(b) - column.center))[0];
}

/**
 * Parse one line as a transaction row. `inheritDate` allows a row without its own date
 * (SBI lists GST lines under the fee they belong to) to take the previous row's date.
 */
function parseRow(line, header, inheritDate = null) {
  const items = attachMarkers(splitLeadingDates(line.items));
  const dateIndex = items.findIndex((it) => parseDate(it.str) && (!header || it.x >= header.left));
  let date;
  let rest;
  if (dateIndex === -1) {
    if (!header || !inheritDate) return null;
    date = inheritDate;
    rest = items.filter((it) => it.x >= header.left);
  } else {
    const dateItem = items[dateIndex];
    if (header && Math.abs(center(dateItem) - header.dateColumn.center) > 40 && Math.abs(dateItem.x - header.dateColumn.x) > 25) {
      return null;
    }
    date = parseDate(dateItem.str);
    rest = items.slice(dateIndex + 1);
  }

  let amountPaise = null;
  let description = '';

  if (header) {
    const byRole = { description: [], amount: [], debit: [], credit: [] };
    for (const it of rest) {
      const role = nearestColumn(header, it).role;
      if (role in byRole) byRole[role].push(it);
    }
    const columnFor = (role) => header.columns.find((c) => c.role === role);
    const amountItem = closestTo(columnFor('amount'), byRole.amount.filter(isAmountItem));
    const debitItem = closestTo(columnFor('debit'), byRole.debit.filter(isAmountItem));
    const creditItem = closestTo(columnFor('credit'), byRole.credit.filter(isAmountItem));
    if (amountItem) amountPaise = signedStatementPaise(parseAmount(amountItem.str));
    else if (debitItem) amountPaise = parseAmount(debitItem.str).paise;
    else if (creditItem) amountPaise = -parseAmount(creditItem.str).paise;
    description = byRole.description.map((i) => i.str).join(' ');
    // Header without a recognised description column: use the text between date and amount.
    if (!header.columns.some((c) => c.role === 'description')) {
      description = rest.filter((i) => !isAmountItem(i) && !isNumberOnly(i.str)).map((i) => i.str).join(' ');
    }
  } else {
    const amounts = rest.filter(isAmountItem);
    const pick = amounts.find((i) => /(cr|dr)\.?$/i.test(i.str)) ?? amounts.at(-1);
    if (pick) {
      amountPaise = signedStatementPaise(parseAmount(pick.str));
      description = rest
        .slice(0, rest.indexOf(pick))
        .filter((i) => !isAmountItem(i) && !isNumberOnly(i.str))
        .map((i) => i.str)
        .join(' ');
    }
  }

  if (amountPaise == null || amountPaise === 0) return null;
  description = description.trim();
  if (dateIndex === -1 && !description) return null;
  return { date, description, amountPaise };
}

const SECTION_HEADING = /^(transactions?|purchases?|payments?)\s+(for|of|by)\b/i;

/** A line holding only description text inside the table: part of a wrapped description. */
function isDescriptionOnly(line, header) {
  if (!header) return false;
  const inside = line.items.filter((it) => it.x >= header.left);
  if (inside.length === 0 || inside.length !== line.items.length) return false;
  if (SECTION_HEADING.test(line.text)) return false;
  return inside.every((it) => nearestColumn(header, it).role === 'description' && !isAmountItem(it) && !parseDate(it.str));
}

// Vertical extent of a line's table items (side-panel text can sit slightly higher or lower).
const tableTop = (line, header) => Math.max(...line.items.filter((it) => !header || it.x >= header.left).map((it) => it.y));
const tableBottom = (line, header) => Math.min(...line.items.filter((it) => !header || it.x >= header.left).map((it) => it.y));

function findLast4(allText) {
  const m = /(?:\d{4,6}|[Xx*]{4})[Xx*•\s]{4,14}(\d{4})\b/.exec(allText);
  return m ? m[1] : null;
}

function findPeriod(lines) {
  const re = new RegExp(`(${DATE_PATTERN})\\s*(?:-|–|to)\\s*(${DATE_PATTERN})`, 'gi');
  for (const line of lines) {
    for (const m of line.text.matchAll(re)) {
      const start = parseDate(m[1]);
      const end = parseDate(m[2]);
      if (!start || !end || end < start) continue;
      const days = (Date.parse(end) - Date.parse(start)) / 86400000;
      if (days >= 20 && days <= 62) return { start, end };
    }
  }
  return null;
}

/** "Total Payment Due" / "Total Amount due" with its value on the same line or just below. */
function findTotalDue(lines) {
  const label = /total\s+(payment|amount)s?\s+due|total\s+dues|total\s+outstanding/i;
  for (let i = 0; i < lines.length; i++) {
    const labelItem = lines[i].items.find((it) => label.test(it.str) && !/minimum/i.test(it.str));
    if (!labelItem) continue;
    // Same line, to the right of the label.
    const sameLine = attachMarkers(lines[i].items.filter((it) => it.x > labelItem.x + labelItem.w - 1));
    const right = sameLine.find(isAmountItem);
    if (right) return signedStatementPaise(parseAmount(right.str));
    // Lines below, roughly under the label.
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (lines[i].y - lines[j].y > 40) break;
      const below = attachMarkers(lines[j].items).find(
        (it) => isAmountItem(it) && Math.abs(center(it) - center(labelItem)) < 50,
      );
      if (below) return signedStatementPaise(parseAmount(below.str));
    }
  }
  return null;
}

const BANKS = [
  [/axis\s+bank/i, 'Axis Bank'],
  [/icici/i, 'ICICI Bank'],
  [/hdfc/i, 'HDFC Bank'],
  [/sbi\s*card|state bank/i, 'SBI Card'],
  [/kotak/i, 'Kotak'],
  [/american\s+express|amex/i, 'American Express'],
  [/idfc\s+first/i, 'IDFC FIRST Bank'],
  [/indusind/i, 'IndusInd Bank'],
  [/yes\s+bank/i, 'YES Bank'],
  [/rbl\s+bank/i, 'RBL Bank'],
  [/au\s+small\s+finance|au\s+bank/i, 'AU Bank'],
  [/standard\s+chartered/i, 'Standard Chartered'],
  [/hsbc/i, 'HSBC'],
  [/onecard|one\s+card/i, 'OneCard'],
];

function findCardName(allText) {
  const bank = BANKS.find(([re]) => re.test(allText));
  if (!bank) return null;
  // A product name such as "Axis Bank ACE Credit Card Statement" — only trusted if it names the bank.
  const product = /\b([A-Z][\w&]*(?:[ \t]+[\w&]+){0,5}[ \t]+Credit[ \t]+Card)[ \t]+Statement/i.exec(allText);
  if (product && bank[0].test(product[1])) return product[1].replace(/\s+/g, ' ');
  return /card$/i.test(bank[1]) ? bank[1] : `${bank[1]} Credit Card`;
}

/**
 * Parse positioned pages into { transactions, meta }.
 * transactions: [{ date, description, amountPaise, kind }] — charges positive, credits negative.
 * meta: { cardName, last4, periodStart, periodEnd, totalDuePaise }
 */
export function parseStatement(pages) {
  const pageLines = pages.map((p) => buildLines(p.items));
  const allLines = pageLines.flat();
  const allText = allLines.map((l) => l.text).join('\n');

  const period = findPeriod(allLines);
  const meta = {
    cardName: findCardName(allText),
    last4: findLast4(allText),
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
    totalDuePaise: findTotalDue(allLines),
  };

  const documentHasHeader = allLines.some((l) => headerFromLine(l));
  const minDate = period ? shiftDays(period.start, -40) : null;
  const maxDate = period ? shiftDays(period.end, 10) : null;

  const transactions = [];
  let header = null;
  const inPeriod = (row) => !minDate || (row.date >= minDate && row.date <= maxDate);
  const join = (...parts) => parts.filter(Boolean).join(' ').trim();

  for (const lines of pageLines) {
    // The last accepted row on this page, and description-only lines not yet given to a row.
    // A wrapped description can sit below its row (ICICI) or straddle it, with part of the text
    // above the date/amount line (Yes Bank), so each such line goes to the nearer row.
    let lastRow = null; // { txn, bottom, h }
    let pending = []; // { text, top, bottom, h }

    const flushToLastRow = () => {
      for (const p of pending) {
        if (lastRow && lastRow.bottom - p.top <= Math.max(p.h, lastRow.h) * 1.5) {
          lastRow.txn.description = join(lastRow.txn.description, p.text);
        }
      }
      pending = [];
    };

    for (const line of lines) {
      const newHeader = headerFromLine(line);
      if (newHeader) {
        flushToLastRow();
        header = newHeader;
        lastRow = null;
        continue;
      }
      if (documentHasHeader && !header) continue;

      const top = tableTop(line, header);
      const bottom = tableBottom(line, header);
      const canInherit = lastRow && pending.length === 0 && lastRow.bottom - top <= Math.max(line.h, lastRow.h) * 2.5;
      const row = parseRow(line, header, canInherit ? lastRow.txn.date : null);

      if (row && inPeriod(row)) {
        for (const p of pending) {
          const limit = Math.max(p.h, line.h) * 1.5;
          const gapNext = p.bottom - top;
          const gapPrev = lastRow ? lastRow.bottom - p.top : Infinity;
          if (gapNext < gapPrev && gapNext <= limit) row.description = join(p.text, row.description);
          else if (lastRow && gapPrev <= Math.max(p.h, lastRow.h) * 1.5) lastRow.txn.description = join(lastRow.txn.description, p.text);
        }
        pending = [];
        transactions.push(row);
        lastRow = { txn: row, bottom, h: line.h };
        continue;
      }

      if (isDescriptionOnly(line, header)) {
        pending.push({ text: line.items.map((i) => i.str).join(' '), top, bottom, h: line.h });
        continue;
      }

      flushToLastRow();
      lastRow = null;
    }
    flushToLastRow();
  }

  for (const t of transactions) {
    t.kind = t.amountPaise > 0 ? TXN_KIND.CHARGE : isBillPayment(t.description) ? TXN_KIND.PAYMENT : TXN_KIND.CREDIT;
  }
  return { transactions, meta };
}

function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Excel import: returns each sheet as rows of cells (SheetJS is loaded on demand).
// Date cells come back as Excel serial numbers, which tabular.js converts exactly
// (avoiding the time-zone shifts of JavaScript Date objects).

export async function readWorkbookSheets(arrayBuffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }),
  })).filter((s) => s.rows.length > 0);
  if (sheets.length === 0) throw new Error('This workbook has no data.');
  return sheets;
}

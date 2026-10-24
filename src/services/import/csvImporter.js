// CSV import: returns the file as rows of string cells (Papa Parse is loaded on demand).

export async function readCsvRows(file) {
  const { default: Papa } = await import('papaparse');
  const text = await file.text();
  const result = Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  if (result.data.length === 0) throw new Error('This CSV file is empty.');
  return result.data;
}

// Turns a loaded PDF.js document into positioned text items. Kept free of PDF.js imports
// so it works with both the browser build and the Node build used in tests.

/** Returns [{ pageNumber, items: [{ str, x, y, w, h }] }]. y grows upwards (PDF coordinates). */
export async function extractPositionedText(pdfDocument) {
  const pages = [];
  for (let n = 1; n <= pdfDocument.numPages; n++) {
    const page = await pdfDocument.getPage(n);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => typeof it.str === 'string' && it.str.trim())
      .map((it) => ({
        str: it.str.replace(/\s+/g, ' ').trim(),
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: Math.abs(it.transform[3]) || it.height || 8,
      }));
    pages.push({ pageNumber: n, items });
    page.cleanup?.();
  }
  return pages;
}

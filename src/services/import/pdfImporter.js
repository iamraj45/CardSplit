// Browser PDF import: loads PDF.js on demand, extracts positioned text and parses it.
import { extractPositionedText } from './pdfText';
import { parseStatement } from './statementParser';

export class PdfPasswordError extends Error {
  constructor(incorrect) {
    super(incorrect ? 'Incorrect password' : 'This PDF is password protected');
    this.name = 'PdfPasswordError';
    this.incorrect = incorrect;
  }
}

export class PdfNoTextError extends Error {
  constructor() {
    super('This PDF has no selectable text. It may be a scanned image, which is not supported yet.');
    this.name = 'PdfNoTextError';
  }
}

let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    },
  );
  return pdfjsPromise;
}

/** Parse a statement PDF. Throws PdfPasswordError when a (correct) password is needed. */
export async function importPdf(arrayBuffer, password) {
  const pdfjs = await loadPdfjs();
  // PDF.js takes ownership of the buffer, so pass a copy to allow retrying with a password.
  const task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)), password, verbosity: 0 });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      if (err?.name === 'PasswordException') {
        throw new PdfPasswordError(err.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
      }
      throw err;
    }
    const pages = await extractPositionedText(doc);
    if (!pages.some((p) => p.items.length > 0)) throw new PdfNoTextError();
    return parseStatement(pages);
  } finally {
    task.destroy();
  }
}

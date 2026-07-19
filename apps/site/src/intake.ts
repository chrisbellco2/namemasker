/**
 * Phase 4 file intake: PDF and Word documents, extracted to text entirely
 * in the browser. The file never leaves the device; extraction feeds the
 * same paste box the user could have typed into.
 */
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface ExtractedFile {
  text: string;
  /** Original filename without extension, for naming downloads. */
  baseName: string;
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      if ('str' in item) pageText += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(pageText.trim());
  }
  await doc.cleanup();
  return pages.join('\n\n').trim();
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

/**
 * Extract text from a dropped or chosen file. Throws with a plain-language
 * message when there is nothing honest to extract (e.g. a scanned PDF).
 */
export async function extractTextFromFile(file: File): Promise<ExtractedFile> {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'document';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();

  let text: string;
  if (ext === 'pdf') {
    text = await extractPdf(await file.arrayBuffer());
    if (text.length === 0) {
      throw new Error(
        `No extractable text in ${file.name}. If it is a scanned PDF, the pages are images; this tool does not read images.`,
      );
    }
  } else if (ext === 'docx') {
    text = await extractDocx(await file.arrayBuffer());
  } else if (ext === 'txt' || ext === 'md') {
    text = await file.text();
  } else {
    throw new Error(`Cannot read .${ext} files. Use a PDF, a .docx, or plain text.`);
  }
  if (text.trim().length === 0) throw new Error(`${file.name} contains no text.`);
  return { text, baseName };
}

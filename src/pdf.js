const WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const WORKER_LOCAL = './vendor/pdfjs/pdf.worker.min.js';

const MAX_CHARS = 8000;

export async function extractText(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded — check the script tag in index.html');

  // Use local worker if available, otherwise CDN
  try {
    await fetch(WORKER_LOCAL, { method: 'HEAD' });
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_LOCAL;
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }

  const fullText = pages.join('\n');
  return fullText.length > MAX_CHARS
    ? fullText.slice(0, MAX_CHARS) + '\n[... document truncated ...]'
    : fullText;
}

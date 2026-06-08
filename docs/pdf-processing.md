---
summary: "Client-side PDF text extraction using PDF.js: setup, limitations, worker config"
read_when:
  - PDF text extraction produces garbled, empty, or partial results
  - You are updating the PDF.js version
  - You need to add OCR support for scanned PDFs
  - The PDF worker fails to load
title: "PDF Processing"
---

# PDF Processing

## Library

PDF.js by Mozilla. Vendored in `public/vendor/pdfjs/` — not loaded from CDN.
CDN loading is blocked by Confluence Cloud CSPs and many corporate network policies.

Required files (download from https://github.com/mozilla/pdf.js/releases, prebuilt package):
- `public/vendor/pdfjs/pdf.min.js`
- `public/vendor/pdfjs/pdf.worker.min.js`

## Worker Configuration

Set before any `getDocument()` call:

```js
pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
```

Path is relative to `index.html`. If the app is served from a subdirectory, adjust accordingly.

## Extraction Flow

`src/pdf.js` exports one function:

```js
async function extractText(file: File): Promise<string>
```

1. Read `File` as `ArrayBuffer` via `FileReader`
2. `pdfjsLib.getDocument({ data: arrayBuffer })`
3. Iterate pages: `page.getTextContent()` → join `items` by space
4. Concatenate all pages with newline separators
5. Return full text string

## Limitations

| PDF Type | Support |
|----------|---------|
| Digital PDF (text layer) | Full |
| Scanned / image PDF | No — no OCR |
| Password-protected PDF | No |
| Right-to-left text | Partial — character order may be incorrect |
| Forms / AcroForm fields | Text layer only — does not read form field values |

## Text Truncation

`src/llm.js` truncates the extracted text to `MAX_CHARS` (default: 8000 characters) before
sending to the LLM. If your documents are longer or the model has a larger context window,
raise this constant. For very long documents, consider chunking (not yet implemented).

## Confluence CSP and eval()

Confluence Cloud blocks `eval()`. Use the non-eval PDF.js worker build (`pdf.worker.min.js`
from the official prebuilt release). Do not use a custom-built worker with inline eval.

# PDF.js Vendor Files

Place the PDF.js static files here. Download from https://github.com/mozilla/pdf.js/releases

Required files:
- `pdf.min.js`
- `pdf.worker.min.js`

Use the "prebuilt" release package. Copy the two files above from the `build/` folder.

The app sets the worker source in `src/pdf.js`:
```js
pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
```

Do not load PDF.js from a CDN — Confluence Cloud CSPs block external domains.

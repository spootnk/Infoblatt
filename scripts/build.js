import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const result = buildSync({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
});

const js  = result.outputFiles[0].text;
const css = readFileSync('public/style.css', 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FormFillingTool</title>
  <style>${css}</style>
  <!-- PDF.js from CDN — required for PDF processing, loaded once and cached -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="app"></div>
  <script>${js}</script>
</body>
</html>`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/FormFillingTool.html', html);

const kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
console.log(`✅ dist/FormFillingTool.html (${kb} KB)`);

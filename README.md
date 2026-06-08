# FormFillingTool

A single-page web application that extracts data from uploaded PDF documents using a locally configured LLM and auto-fills a pre-defined form. The filled form can be reviewed, edited, and printed directly in the browser.

Runs standalone or embedded in Confluence via iframe.

## Features

- **Form Builder** — create and manage form templates with sections, fields, and per-field LLM extraction hints
- **Fill Form** — upload a PDF, send it to the LLM in one request, get all fields filled at once
- **Validation & self-correction** — invalid LLM output triggers a second correction request before showing warnings
- **Settings** — connect to Ollama, any OpenAI-compatible API, or a generic HTTP endpoint with a custom API key header
- **Export / Import** — back up and restore all forms and LLM settings as a portable JSON file
- **No backend, no build step** — plain HTML + vanilla JS with native ES modules; runs from any static file server

## Getting Started

### 1. Serve the app

```sh
npx serve .
```

Then open: **http://localhost:3000/public/**

### Without npm — PowerShell Proxy (Windows)

If you cannot install npm or run a local server, use the included PowerShell proxy.
It serves the app **and** forwards LLM requests — solving CORS without any server-side changes.

**Setup (once):**
1. Run `npm run build` to produce `dist/FormFillingTool.html`
2. Copy these three files into the same folder:
   - `dist/FormFillingTool.html`
   - `scripts/Start-FormFillingProxy.ps1`
   - `scripts/Start-FormFillingProxy.cmd`
3. Open `Start-FormFillingProxy.ps1` in a text editor and set `$LLM_TARGET` to your LLM server URL

**Daily use:**
1. Double-click `Start-FormFillingProxy.cmd`
2. The browser opens automatically at `http://localhost:8080/`
3. In Settings, set the LLM endpoint to `http://localhost:8080`
4. Keep the window open while using the app (Ctrl+C or close to stop)

> If the LLM server uses a self-signed TLS certificate, uncomment the
> `ServerCertificateValidationCallback` line in the `.ps1` file.

### 2. Configure the LLM

Go to the **Settings** tab and enter your LLM endpoint and model name.

**Ollama (local):**
```sh
# Start Ollama with CORS enabled
OLLAMA_ORIGINS="*" ollama serve
```
- Endpoint: `http://localhost:11434`
- Type: Ollama

**OpenAI-compatible server** (LM Studio, vLLM, LocalAI, …):
- Endpoint: your server URL
- Type: OpenAI-compatible
- API Key: your token

Verify the connection with the **Test Connection** button — it lists available models and warns if the configured model is not installed.

### 3. Create a form

Go to **Manage Forms** → **+ New Form**. Add sections and fields. For each field, write an **Extraction Hint** that tells the LLM what to look for in the document. Save the form.

### 4. Fill a form

Go to **Fill Form**, upload a PDF, click **Extract & Fill →**. The LLM receives the full document text and all field definitions in a single request and returns values for all fields at once.

Review and correct the extracted values, then click **Print**.

## Field Types

| Type | Description | Validation |
|------|-------------|-----------|
| `text` | Single line (multi-line if maxLength > 150) | minLength, maxLength, pattern |
| `textarea` | Multi-line, auto-growing | minLength, maxLength |
| `number` | Numeric input | min, max, integer |
| `date` | Date picker | min date, max date |
| `select` | Dropdown | must be one of configured options |
| `image` | Static image (logo, stamp) | not extracted by LLM |

Text fields with `maxLength > 150` are automatically rendered as multi-line textareas in Fill Form.

## LLM Validation

After extraction, every field value is validated against its configuration. If issues are found (wrong date format, value exceeds maxLength, invalid select option, …), the app sends a **single correction request** to the LLM describing each problem. Remaining issues after the retry are highlighted in orange with an explanation.

## Confluence Embedding

Embed via an iframe pointing to your local or team server:

```html
<iframe src="http://your-server:3000/public/" width="100%" height="900px" frameborder="0"></iframe>
```

See [docs/confluence-embedding.md](docs/confluence-embedding.md) for CSP constraints, Safari localStorage behaviour, and print notes.

## PDF.js

PDF text extraction runs entirely in the browser via [PDF.js](https://github.com/mozilla/pdf.js). The app uses the CDN version by default. For Confluence deployment (which blocks external CDNs via CSP), download the prebuilt package and place the files in `public/vendor/pdfjs/`:

```
public/vendor/pdfjs/pdf.min.js
public/vendor/pdfjs/pdf.worker.min.js
```

The app automatically prefers the local files if present.

## Configuration Backup

**Settings → Export Config** downloads a `formfillingtool-config.json` file containing all forms and LLM settings. Use **Import Config** to restore on another device or after a browser reset.

> The export includes API keys — treat the file accordingly.

## Project Structure

```
public/
  index.html          — entry point
  style.css
  form-config.json    — optional seed templates (loaded on first run if localStorage is empty)
  vendor/pdfjs/       — place PDF.js files here for Confluence deployment
src/
  app.js              — mode router, navigation, banner logic
  pdf.js              — PDF.js text extraction
  llm.js              — LLM backends, prompt builder, correction request
  form-builder.js     — form template editor
  form-runner.js      — form rendering, extraction flow, validation
  settings.js         — LLM config, export/import
  storage.js          — localStorage with Safari ITP fallback
docs/                 — architecture and integration docs (OpenClaw format)
```

## License

MIT — see [LICENSE](LICENSE)

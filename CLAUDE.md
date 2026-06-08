# FormFillingTool-js

Single-page web tool: upload a PDF → local/remote LLM extracts data → auto-fills a configurable form → user prints or exports. Runs standalone or embedded in Confluence (iframe / HTML macro).

## App Modes

| Mode | Purpose |
|------|---------|
| **Form Builder** | Create/edit/delete form templates (sections, fields, layout, extractionHints) |
| **Form Runner** | Select a form, upload PDF, LLM fills fields, user reviews and prints |
| **Settings** | Configure LLM backend; export/import all config as JSON |

## Tech Stack

- Plain HTML + vanilla JS with native ES modules (no build step, no bundler)
- PDF.js (vendored in `public/vendor/pdfjs/`) for client-side PDF text extraction
- Configurable LLM backend — Ollama, OpenAI-compatible, or generic HTTP+API-key
- All user config stored in `localStorage` (see Storage section)

## Directory Map

```
public/
  index.html          — single entry point
  style.css
  form-config.json    — optional admin seed: pre-loads forms if localStorage is empty
  vendor/pdfjs/       — PDF.js static files (not CDN — Confluence CSP compatibility)
src/
  app.js              — mode router, top-level coordinator
  pdf.js              — PDF.js wrapper: File → extracted text string
  llm.js              — LLM dispatcher (3 backends) + prompt builder
  form-builder.js     — form template CRUD UI
  form-runner.js      — renders form, applies LLM values, handles print
  settings.js         — LLM config UI + export/import
  storage.js          — localStorage read/write with Safari ITP fallback
docs/                 — OpenClaw-format docs (read on demand via frontmatter)
```

## localStorage Schema

| Key | Value |
|-----|-------|
| `formfillingtool.llmSettings` | `{ type, endpoint, model, apiKey?, apiKeyHeader? }` |
| `formfillingtool.forms` | `FormTemplate[]` |
| `formfillingtool.activeFormId` | `string` (UUID) |

**FormTemplate shape:**
```json
{
  "id": "uuid", "name": "My Form",
  "sections": [{
    "title": "Section Title",
    "fields": [{
      "id": "fieldId", "label": "Label", "type": "text",
      "width": "full", "required": true,
      "extractionHint": "What to look for in the document"
    }]
  }]
}
```

Field types: `text` `date` `number` `select` `textarea`. Width: `full` or `half`.

## LLM Backends

| Type | Auth | Endpoint pattern |
|------|------|-----------------|
| `ollama` | none | `<url>/api/chat` |
| `openai` | Bearer token | `<url>/chat/completions` |
| `generic` | Configurable header | `<url>` (OpenAI request shape) |

**Security:** API keys live in `localStorage` — readable by JS on the same origin. Acceptable for local/intranet use only.

**Ollama CORS:** `OLLAMA_ORIGINS="*" ollama serve`

## Safari / Confluence localStorage Note

`localStorage` inside a cross-origin iframe may be blocked by Safari ITP.
`storage.js` detects this and falls back to in-memory state with a visible warning.

## Export / Import

Settings → Export Config → downloads `formfillingtool-config.json` `{ llmSettings, forms }`.
Import reads the file and overwrites localStorage, then reloads the UI.

## CLI Tools

| Task | Command |
|------|---------|
| Serve locally | `npx serve .` |
| Lint JS | `npx eslint src/` |
| Check Ollama | `curl http://localhost:11434/api/tags` |
| Create GH issue | `gh issue create` |
| Open PR | `gh pr create` |

## Commit Style

Atomic commits. Format: `type(scope): message`

Types: `feat` `fix` `docs` `refactor` `chore`

Examples:
- `feat(form-builder): add section drag-and-drop`
- `fix(llm): handle Ollama timeout gracefully`
- `docs(storage): document Safari ITP fallback`

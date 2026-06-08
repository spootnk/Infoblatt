---
summary: "3-mode app design, component responsibilities, and end-to-end data flow"
read_when:
  - You are new to the project and need a mental model
  - You are adding a new processing step or app mode
  - You need to understand what runs where (all client-side, no backend)
title: "Architecture Overview"
---

# Architecture Overview

## App Modes

The app has three distinct modes, selectable from a top navigation bar:

| Mode | Entry module | Purpose |
|------|-------------|---------|
| Form Runner | `src/form-runner.js` | Select form, upload PDF, LLM fills fields, print |
| Form Builder | `src/form-builder.js` | Create/edit/delete form templates |
| Settings | `src/settings.js` | LLM backend config, export/import |

`src/app.js` acts as the mode router — it renders the nav bar and mounts/unmounts the active mode module into the `#app` container.

## Data Flow (Form Runner mode)

```
[User] uploads PDF
  ↓
[src/pdf.js]       — PDF.js extracts all text from the file (client-side)
  ↓
[src/llm.js]       — builds prompt from text + field extractionHints
                     POST to LLM backend (Ollama / OpenAI-compat / Generic)
                     returns { fieldId: value, ... }
  ↓
[src/form-runner.js] — renders FormTemplate as HTML form
                       patches input values from LLM result
  ↓
[User] reviews, edits values, clicks Print
  ↓
window.print()     — prints iframe contents in Confluence; full page standalone
```

## Config Ownership

| Config | Owner | Where |
|--------|-------|-------|
| Form templates | End user (via Form Builder) | localStorage |
| LLM backend settings | End user (via Settings) | localStorage |
| Default/seed templates | Admin/deployer | `public/form-config.json` |

On first load, if localStorage has no forms, the app fetches `public/form-config.json`
and imports those templates as the starting point.

## Everything Runs in the Browser

No backend. All computation happens client-side:
- PDF text extraction: PDF.js (WebAssembly worker)
- LLM call: `fetch()` to configured endpoint (local or remote)
- State: localStorage

The only network call is to the LLM endpoint (configurable, may be localhost or remote).

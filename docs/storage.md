---
summary: "localStorage schema, Safari ITP fallback, and export/import JSON format"
read_when:
  - User settings are not persisting between sessions
  - You are implementing or debugging storage.js
  - Safari / Confluence embedding causes storage errors
  - You need to understand the export/import file format
title: "Storage & Persistence"
---

# Storage & Persistence

## localStorage Keys

All keys are prefixed with `formfillingtool.` to avoid collisions.

| Key | Type | Content |
|-----|------|---------|
| `formfillingtool.llmSettings` | object | LLM backend config |
| `formfillingtool.forms` | array | All FormTemplate objects |
| `formfillingtool.activeFormId` | string | UUID of the currently selected form |

## storage.js API

```js
import { get, set, isAvailable } from './storage.js';

isAvailable()           // → boolean: false in Safari cross-origin iframe
get('formfillingtool.forms')    // → parsed value or null
set('formfillingtool.forms', [/* ... */])
```

## Safari ITP Fallback

Safari's Intelligent Tracking Prevention (ITP) blocks `localStorage` access for third-party
iframe origins. `storage.js` detects this by attempting a test write in a `try/catch`.

If unavailable:
- All `get`/`set` calls use an in-memory `Map` for the current session
- The app shows a persistent warning banner: "Settings cannot be saved in this browser.
  Export your config to avoid losing it."
- The app remains fully functional — settings just reset on reload

## Export / Import Format

Export (Settings → Export Config) downloads `formfillingtool-config.json`:

```json
{
  "version": 1,
  "exportedAt": "2026-05-28T10:00:00Z",
  "llmSettings": { "type": "ollama", "endpoint": "...", "model": "..." },
  "forms": [ { "id": "...", "name": "...", "sections": [...] } ]
}
```

Import reads this file, validates the `version` field, writes `llmSettings` and `forms`
to storage (overwriting existing values), and reloads the UI.

`apiKey` is included in the export — treat the exported file as a secret if it contains credentials.

## First-Run Seed

On startup, if `formfillingtool.forms` is empty or missing, the app fetches
`public/form-config.json`. If the fetch succeeds, the returned templates are written
to `formfillingtool.forms`. If the fetch fails (e.g. file missing), the app starts empty.

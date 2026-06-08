---
summary: "How to embed the tool in Confluence on-prem and Cloud: attachment iframe, HTML macro, local server, CSP and localStorage notes"
read_when:
  - You are deploying the tool in Confluence (on-prem or Cloud)
  - Scripts or styles are blocked in the Confluence iframe
  - User settings are not persisting in Confluence (Safari or CSP issue)
  - Print output from Confluence is unexpected
title: "Confluence Embedding"
---

# Confluence Embedding

## On-Premises Confluence (Server / Data Center)

### Option 1 — Page Attachment + iframe (Recommended)

Use the self-contained single HTML file produced by `npm run build`.

**Step 1:** Build the single-file distribution:
```sh
npm run build   # produces dist/FormFillingTool.html (~50 KB)
```

**Step 2:** Upload as a page attachment:
- Open the Confluence page → **"…"** → **Attachments** → upload `dist/FormFillingTool.html`

**Step 3:** Get the attachment URL:
- Right-click the attachment → copy link → looks like:
  `/download/attachments/123456/FormFillingTool.html`
- The URL is stable across file updates (Confluence versions attachments automatically)

**Step 4:** Embed via HTML macro:
- Edit the page → Insert → Other Macros → **HTML**
```html
<iframe
  src="/download/attachments/123456/FormFillingTool.html"
  width="100%"
  height="900px"
  frameborder="0">
</iframe>
```

### Option 2 — HTML Macro (direct inline)

Paste the full contents of `dist/FormFillingTool.html` directly into the HTML macro.
On-prem Confluence allows `<script>` tags in the HTML macro by default.

If script execution is blocked, an admin must enable it:
`Administration → Security Configuration → Allow HTML macros`

### Option 3 — Local Server + iframe

Run the app on any machine reachable from Confluence users' browsers:

```sh
npm run dev   # starts npx serve . on port 3000
```

In the Confluence HTML macro:
```html
<iframe src="http://YOUR-SERVER:3000/public/" width="100%" height="900px" frameborder="0"></iframe>
```

This is the best option if the tool is used by many people simultaneously or if you want
to push updates without re-uploading a file.

---

## Confluence Cloud

Confluence Cloud enforces a strict Content Security Policy (CSP) that blocks inline
scripts and external CDNs. Use Option 3 (local/intranet server + iframe) — it sidesteps
all CSP issues because the tool's scripts run from their own origin.

Options 1 and 2 are **not reliable on Confluence Cloud** due to CSP restrictions.

---

## Ollama / LLM CORS Requirement

Regardless of embedding option, the browser sends LLM requests directly to Ollama
(or your configured endpoint). Ollama must be started with CORS enabled:

```sh
OLLAMA_ORIGINS="*" ollama serve
```

If Ollama runs on a different server, set the allowed origins to the Confluence server's
domain instead of `*`.

---

## CSP Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `eval()` blocked | Cloud CSP | Use prebuilt PDF.js (no inline eval) — included by default |
| CDN scripts blocked | Cloud CSP | Use Option 3 (local server); vendor PDF.js locally |
| `fetch()` to localhost blocked | Cloud mixed-content policy | Use HTTPS LLM endpoint |
| `localStorage` blocked (Safari) | ITP third-party storage | `storage.js` fallback handles this; advise users to export config |

---

## localStorage in the iframe

The iframe runs under its own origin (e.g. `http://your-server:3000`), so `localStorage`
accesses the tool's own storage — not Confluence's. This works in Chrome and Firefox.

Safari ITP treats cross-origin iframes as "third-party" and may block or periodically
clear storage. The in-memory fallback in `storage.js` handles this gracefully with a
visible warning. Advise Safari users to use **Export Config** regularly.

---

## Printing

`window.print()` inside an iframe prints only the iframe contents in Chrome and Firefox —
the Confluence page chrome is excluded, which is the desired behaviour.

Firefox: iframes may require user interaction before `window.print()` is permitted.
Always trigger printing from a button click, not programmatically on page load.

---

## iframe Height

Use `height="900px"` as a fixed value, or implement `postMessage`-based auto-resize:

```html
<!-- In the Confluence HTML macro — wraps the iframe and listens for resize events -->
<iframe id="fft" src="..." width="100%" height="600px" frameborder="0"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'resize')
      document.getElementById('fft').height = e.data.height + 'px';
  });
</script>
```

```js
// In src/app.js — send height after each render:
window.parent.postMessage({ type: 'resize', height: document.body.scrollHeight }, '*');
```

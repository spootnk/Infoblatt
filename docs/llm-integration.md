---
summary: "3 LLM backend types (Ollama, OpenAI-compatible, Generic), prompt design, CORS, error handling"
read_when:
  - You are changing or debugging the LLM connection
  - LLM returns unexpected formats or empty values
  - You need to add streaming, adjust timeouts, or support a new API type
  - A user reports that their API key or endpoint isn't working
title: "LLM Integration"
---

# LLM Integration

## Backend Types

All backends are configured by the user in the Settings panel and stored in
`localStorage` under `formfillingtool.llmSettings`. `src/llm.js` dispatches based on `type`.

### Type: `ollama`

```json
{ "type": "ollama", "endpoint": "http://localhost:11434", "model": "llama3" }
```

- POST to `<endpoint>/api/chat`
- No auth header
- Request body: `{ "model": "...", "messages": [...], "stream": false, "format": "json" }`
- `format: "json"` asks Ollama to constrain output to valid JSON (not all models honour this — test)
- CORS: requires `OLLAMA_ORIGINS="*" ollama serve`

### Type: `openai`

```json
{ "type": "openai", "endpoint": "https://llm.example.org/v1", "model": "gpt-4o", "apiKey": "sk-..." }
```

- POST to `<endpoint>/chat/completions`
- Header: `Authorization: Bearer <apiKey>`
- Request body: OpenAI `/chat/completions` format, `response_format: { type: "json_object" }`
- Covers: LM Studio, vLLM, LocalAI, private OpenAI-compatible servers

### Type: `generic`

```json
{
  "type": "generic", "endpoint": "https://llm.example.org/api",
  "model": "custom", "apiKey": "token123", "apiKeyHeader": "X-API-Key"
}
```

- POST to `<endpoint>` with `<apiKeyHeader>: <apiKey>`
- Request shape: same as OpenAI `/chat/completions`
- Use this for APIs that don't use Bearer auth but are otherwise OpenAI-compatible

## Prompt Design

Built in `src/llm.js → buildPrompt(text, fields)`:

```
You are a document data extractor. Extract the following fields from the document text.
Return ONLY a JSON object. Keys: <comma-separated field ids>.

Fields:
- <id>: <extractionHint>
...

Document:
---
<extracted text, truncated to MAX_CHARS (default: 8000)>
---

Return JSON only. No explanation.
```

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| Endpoint unreachable | Show "LLM not available" banner; allow manual form fill |
| 401 / 403 | Show auth error; open Settings panel |
| Response not valid JSON | Fall back to empty values; log raw response to console |
| Timeout (>30s) | Abort fetch; show timeout message |
| Model not found | Surface backend error message in UI |

## Security Note

API keys are stored in `localStorage`. Readable by any JS running on the same origin.
Acceptable for local or intranet deployments. Do not deploy on a public server with shared origins.

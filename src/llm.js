// ── Connection test ───────────────────────────────────────────────────────────

export async function testConnection(settings) {
  const { type, endpoint, model, apiKey, apiKeyHeader } = settings;
  const signal = AbortSignal.timeout(8000);

  try {
    if (type === 'ollama') {
      const res = await fetch(`${endpoint}/api/tags`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models ?? []).map(m => m.name);
      const modelFound = models.some(m => m === model || m.startsWith(model + ':'));
      if (models.length && !modelFound) {
        return {
          ok: false,
          message: `Connected, but model "${model}" is not installed.\nAvailable: ${models.join(', ')}\nRun: ollama pull ${model}`,
        };
      }
      return {
        ok: true,
        message: models.length
          ? `Connected — available models: ${models.join(', ')}`
          : 'Connected (no models installed yet)',
      };
    }

    if (type === 'openai') {
      const res = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, message: 'Connected' };
    }

    // generic
    const headers = { 'Content-Type': 'application/json' };
    if (apiKeyHeader && apiKey) headers[apiKeyHeader] = apiKey;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, message: 'Connected' };

  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, message: 'Timeout — server did not respond within 8 s' };
    }
    if (e instanceof TypeError) {
      if (type === 'ollama') {
        return {
          ok: false,
          message: 'Connection failed — is Ollama running? If yes, restart with: OLLAMA_ORIGINS="*" ollama serve',
        };
      }
      return { ok: false, message: `Connection failed — ${e.message}` };
    }
    return { ok: false, message: e.message };
  }
}

// ── Field extraction ──────────────────────────────────────────────────────────

export async function extractFields(text, fields, settings) {
  const extractableFields = fields.filter(f => f.type !== 'image');
  const prompt = _buildPrompt(text, extractableFields);
  return _request([{ role: 'user', content: prompt }], settings);
}

// ── Correction request ────────────────────────────────────────────────────────

export async function correctFields(issues, settings) {
  const fieldList = Object.entries(issues)
    .map(([id, reason]) => `- ${id}: ${reason}`)
    .join('\n');
  const ids = Object.keys(issues).join(', ');

  const prompt = `Your previous field extraction had the following issues:\n\n${fieldList}\n\nPlease return a JSON object with corrected values for only these fields: ${ids}.\nReturn JSON only. No explanation.`;

  return _request([{ role: 'user', content: prompt }], settings);
}

async function _request(messages, settings) {
  const { type, endpoint, model, apiKey, apiKeyHeader } = settings;
  const signal = AbortSignal.timeout(60000);

  let url, body, headers;
  if (type === 'ollama') {
    url = `${endpoint}/api/chat`;
    body = { model, messages, stream: false, format: 'json' };
    headers = { 'Content-Type': 'application/json' };
  } else if (type === 'openai') {
    url = `${endpoint}/chat/completions`;
    body = { model, messages, stream: false, response_format: { type: 'json_object' } };
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  } else {
    url = endpoint;
    body = { model, messages, stream: false };
    headers = { 'Content-Type': 'application/json' };
    if (apiKeyHeader && apiKey) headers[apiKeyHeader] = apiKey;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    if (res.status === 404 && type === 'ollama') {
      throw new Error(`Model "${model}" not found in Ollama — run: ollama pull ${model}`);
    }
    throw new Error(`HTTP ${res.status} from LLM`);
  }

  // Read as text first so we can give a useful error if the envelope isn't JSON
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const snippet = rawText.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(`Response was not JSON (got: "${snippet}…"). If using the proxy, check that gzip decompression is enabled.`);
  }

  const content = type === 'ollama'
    ? data.message?.content
    : data.choices?.[0]?.message?.content;

  if (!content) throw new Error('LLM returned an empty response');

  try {
    return JSON.parse(content);
  } catch {
    // Model may have wrapped JSON in markdown fences or added prose — extract the object
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('LLM response did not contain valid JSON');
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function _buildPrompt(text, fields) {
  const ids = fields.map(f => f.id).join(', ');

  const fieldList = fields.map(f => {
    let line = `- ${f.id}: ${f.extractionHint || f.label}`;
    if (f.outputFormat)       line += `\n  Format: ${f.outputFormat}`;
    if (f.examples?.length)   line += `\n  Example: ${f.examples.join(', ')}`;
    if (f.type === 'select' && f.options?.length)
                              line += `\n  Must be one of: ${f.options.join(', ')}`;
    if (f.type === 'date')    line += '\n  Return as ISO date YYYY-MM-DD, or "" if not found';
    if (f.type === 'number')  line += '\n  Return as a number, or "" if not found';
    return line;
  }).join('\n');

  return `You are a document data extractor.
Extract the following fields from the document text below.
Return ONLY a valid JSON object with exactly these keys: ${ids}.
Use "" for any field that cannot be found in the document.
Do not include any explanation or text outside the JSON object.

Fields:
${fieldList}

Document:
---
${text}
---

Return JSON only.`;
}

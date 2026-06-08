import { get, set } from './storage.js';
import { testConnection } from './llm.js';

export function mount(container) {
  const saved = get('llmSettings') ?? { type: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3' };

  container.innerHTML = `
    <div class="settings-panel">

      <section class="settings-section">
        <h2>LLM Connection</h2>
        <form id="llm-form" novalidate>
          <div class="field-group">
            <label for="s-type">Backend Type</label>
            <select id="s-type" name="type">
              <option value="ollama">Ollama (no auth)</option>
              <option value="openai">OpenAI-compatible + Bearer token</option>
              <option value="generic">Generic HTTP + custom API key header</option>
            </select>
          </div>
          <div class="field-group">
            <label for="s-endpoint">Endpoint URL</label>
            <input id="s-endpoint" name="endpoint" type="text"
              placeholder="http://localhost:11434" autocomplete="off" />
          </div>
          <div class="field-group">
            <label for="s-model">Model Name</label>
            <input id="s-model" name="model" type="text" placeholder="llama3" />
          </div>
          <div class="field-group" id="fg-apiKey">
            <label for="s-apiKey">API Key</label>
            <input id="s-apiKey" name="apiKey" type="password"
              placeholder="sk-…" autocomplete="off" />
          </div>
          <div class="field-group" id="fg-apiKeyHeader">
            <label for="s-apiKeyHeader">API Key Header Name</label>
            <input id="s-apiKeyHeader" name="apiKeyHeader" type="text" placeholder="X-API-Key" />
          </div>

          <div class="form-actions">
            <button type="button" id="test-btn" class="btn btn-secondary">Test Connection</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
          <div id="llm-feedback" class="feedback" aria-live="polite"></div>
        </form>
      </section>

      <section class="settings-section">
        <h2>Configuration Backup</h2>
        <p class="settings-hint">
          Export all forms and LLM settings as a JSON file.
          Import to restore on another device or after a browser reset.
        </p>
        <div class="form-actions">
          <button id="export-btn" class="btn btn-secondary">Export Config</button>
          <label class="btn btn-secondary">
            Import Config
            <input type="file" id="import-input" accept=".json" style="display:none" />
          </label>
        </div>
        <div id="import-feedback" class="feedback" aria-live="polite"></div>
      </section>

    </div>
  `;

  const form = container.querySelector('#llm-form');

  // Populate with saved values
  form.type.value        = saved.type        ?? 'ollama';
  form.endpoint.value    = saved.endpoint    ?? '';
  form.model.value       = saved.model       ?? '';
  form.apiKey.value      = saved.apiKey      ?? '';
  form.apiKeyHeader.value = saved.apiKeyHeader ?? '';

  // Show / hide fields depending on type
  function updateVisibility() {
    const t = form.type.value;
    container.querySelector('#fg-apiKey').hidden       = t === 'ollama';
    container.querySelector('#fg-apiKeyHeader').hidden = t !== 'generic';
  }
  updateVisibility();
  form.type.addEventListener('change', updateVisibility);

  // Test connection
  container.querySelector('#test-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#test-btn');
    const fb  = container.querySelector('#llm-feedback');
    btn.disabled = true;
    btn.textContent = 'Testing…';
    fb.innerHTML = '';

    const result = await testConnection(readForm(form));

    fb.innerHTML = result.ok
      ? `<span class="feedback-ok">✅ ${result.message}</span>`
      : `<span class="feedback-err">❌ ${result.message}</span>`;
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  });

  // Save
  form.addEventListener('submit', e => {
    e.preventDefault();
    set('llmSettings', readForm(form));
    window.dispatchEvent(new CustomEvent('formfillingtool:settingschanged'));
    flash(container.querySelector('#llm-feedback'), '✅ Settings saved');
  });

  // Export
  container.querySelector('#export-btn').addEventListener('click', () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      llmSettings: get('llmSettings'),
      forms: get('forms') ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'formfillingtool-config.json' });
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  container.querySelector('#import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const fb = container.querySelector('#import-feedback');
    try {
      const data = JSON.parse(await file.text());
      if (!data.version) throw new Error('Not a valid FormFillingTool config file');
      if (data.llmSettings) set('llmSettings', data.llmSettings);
      if (Array.isArray(data.forms)) set('forms', data.forms);
      window.dispatchEvent(new CustomEvent('formfillingtool:settingschanged'));
      fb.innerHTML = `<span class="feedback-ok">✅ Config imported — ${data.forms?.length ?? 0} form(s) loaded</span>`;
      mount(container); // re-render to show imported LLM values
    } catch (err) {
      fb.innerHTML = `<span class="feedback-err">❌ Import failed: ${err.message}</span>`;
    }
  });
}

function readForm(form) {
  return {
    type:         form.type.value,
    endpoint:     form.endpoint.value.trim().replace(/\/$/, ''),
    model:        form.model.value.trim(),
    apiKey:       form.apiKey.value,
    apiKeyHeader: form.apiKeyHeader.value.trim(),
  };
}

function flash(el, message) {
  el.innerHTML = `<span class="feedback-ok">${message}</span>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 3000);
}

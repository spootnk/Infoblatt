import { get, set } from './storage.js';
import { extractText } from './pdf.js';
import { extractFields, correctFields } from './llm.js';

export function mount(container) {
  const forms = get('forms') ?? [];
  const llmSettings = get('llmSettings');

  if (forms.length === 0) {
    container.innerHTML = `<p class="stub">No forms yet —
      <a href="#" class="goto-builder">go to Manage Forms</a> to create one.</p>`;
    container.querySelector('.goto-builder').addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('[data-mode="builder"]')?.click();
    });
    return;
  }

  // Module state (survives re-renders)
  const state = {
    formId: get('activeFormId') ?? forms[0].id,
    pdfFile: null,
    values: {},
    status: null,
  };

  render(container, forms, llmSettings, state);
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function render(container, forms, llmSettings, state) {
  const form = forms.find(f => f.id === state.formId) ?? forms[0];
  const canExtract = !!state.pdfFile && !!llmSettings;

  container.innerHTML = `
    <div class="runner-panel">

      <div class="runner-controls">
        ${forms.length > 1 ? `
          <div class="field-group runner-form-select">
            <label for="form-selector">Form</label>
            <select id="form-selector">
              ${forms.map(f =>
                `<option value="${_esc(f.id)}"${f.id === state.formId ? ' selected' : ''}>${_esc(f.name || 'Untitled')}</option>`
              ).join('')}
            </select>
          </div>` : ''}

        <div class="pdf-upload-row">
          <label class="btn btn-secondary pdf-upload-label">
            📎 Upload PDF
            <input type="file" id="pdf-input" accept=".pdf" style="display:none" />
          </label>
          <span class="pdf-filename">${state.pdfFile ? _esc(state.pdfFile.name) : 'No file selected'}</span>
          <button class="btn btn-primary" id="extract-btn" ${canExtract ? '' : 'disabled'}>
            Extract &amp; Fill →
          </button>
        </div>

        ${state.status ? `<div class="runner-status">${state.status}</div>` : ''}
      </div>

      <div class="form-doc" id="form-doc">
        ${_renderFormDoc(form, state.values)}
      </div>

      <div class="runner-footer no-print">
        <button class="btn btn-secondary" id="print-btn">🖨 Print</button>
      </div>
    </div>`;

  // Form selector
  container.querySelector('#form-selector')?.addEventListener('change', e => {
    state.formId = e.target.value;
    state.values = {};
    state.status = null;
    set('activeFormId', state.formId);
    render(container, forms, llmSettings, state);
  });

  // PDF file picker
  container.querySelector('#pdf-input').addEventListener('change', e => {
    state.pdfFile = e.target.files[0] ?? null;
    render(container, forms, llmSettings, state);
  });

  // Extract & Fill
  container.querySelector('#extract-btn').addEventListener('click', () =>
    _doExtract(container, forms, llmSettings, state, form));

  // Print
  container.querySelector('#print-btn').addEventListener('click', () => window.print());

  // Auto-resize textareas + update char counters on user input
  container.querySelectorAll('textarea.form-input').forEach(el => {
    el.addEventListener('input', () => {
      _autoResize(el);
      _updateCounter(el);
    });
  });
}

// ── Extraction flow ───────────────────────────────────────────────────────────

async function _doExtract(container, forms, llmSettings, state, form) {
  const btn = container.querySelector('#extract-btn');
  btn.disabled = true;

  state.status = '<span class="status-info">📄 Reading PDF…</span>';
  _updateStatus(container, state.status);

  let text;
  try {
    text = await extractText(state.pdfFile);
  } catch (e) {
    state.status = `<span class="feedback-err">❌ PDF error: ${_esc(e.message)}</span>`;
    _updateStatus(container, state.status);
    btn.disabled = false;
    return;
  }

  state.status = '<span class="status-info">🤖 Sending to LLM — please wait…</span>';
  _updateStatus(container, state.status);

  const allFields = form.sections.flatMap(s => s.fields);

  let raw;
  try {
    raw = await extractFields(text, allFields, llmSettings);
  } catch (e) {
    state.status = `<span class="feedback-err">❌ LLM error: ${_esc(e.message)}</span>`;
    _updateStatus(container, state.status);
    btn.disabled = false;
    return;
  }

  // Validate — ask LLM to correct any issues (one retry)
  let values = raw;
  let issues = _validate(allFields, raw);

  if (Object.keys(issues).length > 0) {
    const n = Object.keys(issues).length;
    state.status = `<span class="status-info">🔄 Asking LLM to correct ${n} field${n > 1 ? 's' : ''}…</span>`;
    _updateStatus(container, state.status);
    try {
      const corrections = await correctFields(issues, llmSettings);
      values = { ...raw, ...corrections };
      issues = _validate(allFields, values);
    } catch {
      // Retry failed — keep original values, show all original issues as warnings
    }
  }

  state.values = values;

  const warnCount = Object.keys(issues).length;
  state.status = warnCount > 0
    ? `<span class="status-warn">⚠ Fields extracted — ${warnCount} field${warnCount > 1 ? 's' : ''} still need${warnCount === 1 ? 's' : ''} review (highlighted below)</span>`
    : '<span class="feedback-ok">✅ Fields extracted successfully</span>';

  // Patch values and show warnings
  for (const [id, value] of Object.entries(state.values)) {
    const el = container.querySelector(`[name="${CSS.escape(id)}"]`);
    if (!el) continue;
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find(o => o.value === value);
      if (opt) el.value = value;
    } else {
      el.value = value ?? '';
      if (el.tagName === 'TEXTAREA') _autoResize(el);
      _updateCounter(el);
    }
    _setFieldWarning(el, issues[id] ?? null);
  }

  _updateStatus(container, state.status);
  btn.disabled = false;
}

function _validate(fields, values) {
  const issues = {};
  for (const f of fields) {
    if (f.type === 'image') continue;
    const v = String(values[f.id] ?? '');
    if (f.required && !v)
      issues[f.id] = 'Required field — value not found in document';
    else if (f.type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v))
      issues[f.id] = `Returned "${v}" — expected date format YYYY-MM-DD`;
    else if (f.type === 'number' && v !== '' && isNaN(Number(v)))
      issues[f.id] = `Returned "${v}" — expected a number`;
    else if (f.type === 'select' && v && !(f.options ?? []).includes(v))
      issues[f.id] = `"${v}" is not one of the allowed options: ${(f.options ?? []).join(', ')}`;
    else if (f.maxLength && v.length > f.maxLength)
      issues[f.id] = `Value is ${v.length} characters — maximum is ${f.maxLength}`;
    else if (f.minLength && v && v.length < f.minLength)
      issues[f.id] = `Value is ${v.length} characters — minimum is ${f.minLength}`;
    else if (f.pattern && v && !new RegExp(f.pattern).test(v))
      issues[f.id] = `Value does not match required pattern: ${f.pattern}`;
  }
  return issues;
}

function _setFieldWarning(el, message) {
  const fieldEl = el.closest('.form-field');
  if (!fieldEl) return;
  let w = fieldEl.querySelector('.field-warning');
  if (message) {
    fieldEl.classList.add('has-warning');
    if (!w) {
      w = document.createElement('div');
      w.className = 'field-warning';
      fieldEl.appendChild(w);
    }
    w.textContent = '⚠ ' + message;
  } else {
    fieldEl.classList.remove('has-warning');
    w?.remove();
  }
}

function _updateStatus(container, html) {
  let el = container.querySelector('.runner-status');
  if (el) { el.innerHTML = html; return; }
  // Insert after pdf-upload-row if not yet present
  const row = container.querySelector('.pdf-upload-row');
  if (row) {
    el = document.createElement('div');
    el.className = 'runner-status';
    el.innerHTML = html;
    row.after(el);
  }
}

// ── Form document renderer ────────────────────────────────────────────────────

function _renderFormDoc(form, values = {}) {
  return `
    ${form.logo || form.name ? `
      <div class="form-doc-header">
        ${form.logo ? `<img class="form-doc-logo" src="${form.logo}" alt="Logo" />` : ''}
        ${form.name ? `<h1 class="form-doc-title">${_esc(form.name)}</h1>` : ''}
      </div>` : ''}
    ${form.sections.map(s => `
      <div class="form-doc-section">
        ${s.title ? `<h2 class="form-doc-section-title">${_esc(s.title)}</h2>` : ''}
        <div class="form-doc-fields">
          ${s.fields.map(f => _renderField(f, values[f.id] ?? '')).join('')}
        </div>
      </div>`).join('')}`;
}

function _renderField(f, value) {
  if (f.type === 'image') {
    return f.src
      ? `<div class="form-field form-field--full">
           <img src="${f.src}" alt="${_esc(f.alt || '')}" class="form-image" />
         </div>`
      : '';
  }

  const widthClass = f.width === 'half' ? 'form-field--half' : 'form-field--full';
  const label = `${_esc(f.label)}${f.required ? ' <span class="req-star">*</span>' : ''}`;

  // Render text fields with long maxLength as textarea — single-line input is impractical
  const renderAsTextarea = f.type === 'textarea' || (f.type === 'text' && f.maxLength > 150);

  const attrs = [
    `name="${_esc(f.id)}"`,
    f.required    ? 'required'                             : '',
    f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : '',
    f.minLength !== undefined ? `minlength="${f.minLength}"` : '',
    f.maxLength !== undefined ? `maxlength="${f.maxLength}"` : '',
    f.pattern   ? `pattern="${_esc(f.pattern)}"` : '',
    f.min       !== undefined ? `min="${f.min}"` : '',
    f.max       !== undefined ? `max="${f.max}"` : '',
    f.step      !== undefined ? `step="${f.step}"` : '',
    f.minDate   ? `min="${f.minDate}"` : '',
    f.maxDate   ? `max="${f.maxDate}"` : '',
  ].filter(Boolean).join(' ');

  let input;
  if (renderAsTextarea) {
    input = `<textarea class="form-input" ${attrs}>${_esc(value)}</textarea>`;
  } else if (f.type === 'select') {
    const options = (f.options ?? []).map(o =>
      `<option value="${_esc(o)}"${value === o ? ' selected' : ''}>${_esc(o)}</option>`
    ).join('');
    input = `<select class="form-input" ${attrs}><option value="">— Select —</option>${options}</select>`;
  } else {
    input = `<input class="form-input" type="${f.type}" ${attrs} value="${_esc(value)}" />`;
  }

  const showCounter = f.maxLength && (f.type === 'text' || f.type === 'textarea');
  const counter = showCounter
    ? `<div class="char-counter${(value ?? '').length >= f.maxLength ? ' at-limit' : ''}" data-max="${f.maxLength}">
         <span class="char-current">${(value ?? '').length}</span> / ${f.maxLength}
       </div>`
    : '';

  return `<div class="form-field ${widthClass}">
    <label class="form-field-label">${label}</label>
    ${input}
    ${counter}
  </div>`;
}

function _autoResize(el) {
  el.style.height = '0';
  el.style.height = el.scrollHeight + 'px';
}

function _updateCounter(el) {
  const counter = el.closest('.form-field')?.querySelector('.char-counter');
  if (!counter) return;
  const max = +counter.dataset.max;
  const current = counter.querySelector('.char-current');
  if (current) current.textContent = el.value.length;
  counter.classList.toggle('at-limit', el.value.length >= max);
}

function _esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

import { get, set } from './storage.js';

let _forms = [];

export function mount(container) {
  _forms = get('forms') ?? [];
  _showList(container);
}

// ── Form List ─────────────────────────────────────────────────────────────────

function _showList(container) {
  const fieldCount = f => f.sections.reduce((n, s) => n + s.fields.length, 0);

  container.innerHTML = `
    <div class="builder-panel">
      <div class="builder-header">
        <h2>Manage Forms</h2>
        <button class="btn btn-primary" id="new-form-btn">+ New Form</button>
      </div>
      <div class="form-list">
        ${_forms.length === 0
          ? `<p class="stub" style="margin-top:32px">No forms yet — click "+ New Form" to create one.</p>`
          : _forms.map(f => `
            <div class="form-card">
              <div class="form-card-info">
                ${f.logo ? `<img class="form-card-logo" src="${f.logo}" alt="" />` : ''}
                <div>
                  <div class="form-card-name">${_esc(f.name || 'Untitled')}</div>
                  <div class="form-card-meta">${f.sections.length} section${f.sections.length !== 1 ? 's' : ''} · ${fieldCount(f)} field${fieldCount(f) !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div class="form-card-actions">
                <button class="btn btn-secondary edit-btn" data-id="${f.id}">Edit</button>
                <button class="btn btn-danger delete-btn" data-id="${f.id}">Delete</button>
              </div>
            </div>`).join('')}
      </div>
    </div>`;

  container.querySelector('#new-form-btn').addEventListener('click', () => {
    const form = { id: crypto.randomUUID(), name: '', logo: null, sections: [] };
    _forms.push(form);
    _showEditor(container, form);
  });

  container.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const form = _forms.find(f => f.id === btn.dataset.id);
      _showEditor(container, form);
    }));

  container.querySelectorAll('.delete-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const form = _forms.find(f => f.id === btn.dataset.id);
      if (!confirm(`Delete "${form.name || 'Untitled'}"? This cannot be undone.`)) return;
      _forms = _forms.filter(f => f.id !== btn.dataset.id);
      set('forms', _forms);
      _showList(container);
    }));
}

// ── Form Editor ───────────────────────────────────────────────────────────────

function _showEditor(container, form) {
  container.innerHTML = `
    <div class="builder-panel">
      <div class="editor-header">
        <button class="btn btn-secondary back-btn">← Back</button>
        <input class="form-name-input" type="text" placeholder="Form name…" value="${_esc(form.name)}" />
        <div class="logo-upload-group">
          ${form.logo ? `<img class="logo-preview" src="${form.logo}" alt="Logo" />` : ''}
          <label class="btn btn-secondary logo-label">
            ${form.logo ? 'Change Logo' : 'Add Logo'}
            <input type="file" id="logo-input" accept="image/*" style="display:none" />
          </label>
          ${form.logo ? `<button class="btn btn-secondary remove-logo-btn">Remove Logo</button>` : ''}
        </div>
      </div>

      <div id="sections-container">
        ${form.sections.map((_, sIdx) => _renderSection(form, sIdx)).join('')}
      </div>

      <div class="editor-footer">
        <button class="btn btn-secondary add-section-btn">+ Add Section</button>
        <div class="editor-footer-right">
          <div id="save-feedback" class="feedback"></div>
          <button class="btn btn-primary save-btn">Save Form</button>
        </div>
      </div>
    </div>`;

  container.querySelector('.back-btn').addEventListener('click', () => _showList(container));

  container.querySelector('.form-name-input').addEventListener('input', e => {
    form.name = e.target.value;
  });

  container.querySelector('#logo-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    form.logo = await _fileToBase64(file);
    _showEditor(container, form);
  });

  container.querySelector('.remove-logo-btn')?.addEventListener('click', () => {
    form.logo = null;
    _showEditor(container, form);
  });

  container.querySelector('.add-section-btn').addEventListener('click', () => {
    form.sections.push({ title: '', fields: [] });
    _showEditor(container, form);
  });

  container.querySelector('.save-btn').addEventListener('click', () => {
    const idx = _forms.findIndex(f => f.id === form.id);
    if (idx >= 0) _forms[idx] = form; else _forms.push(form);
    set('forms', _forms);
    const fb = container.querySelector('#save-feedback');
    fb.innerHTML = '<span class="feedback-ok">✅ Saved</span>';
    setTimeout(() => { if (fb) fb.innerHTML = ''; }, 2500);
  });

  _attachSectionListeners(container, form);
}

// ── Section renderer ──────────────────────────────────────────────────────────

function _renderSection(form, sIdx) {
  const s = form.sections[sIdx];
  return `
    <div class="section-block" data-sidx="${sIdx}">
      <div class="section-header">
        <input class="section-title-input" type="text"
          placeholder="Section title (optional)" value="${_esc(s.title)}" data-sidx="${sIdx}" />
        <div class="section-btns">
          <button class="move-btn sec-move" data-sidx="${sIdx}" data-dir="up" title="Move section up">↑</button>
          <button class="move-btn sec-move" data-sidx="${sIdx}" data-dir="down" title="Move section down">↓</button>
          <button class="del-section-btn" data-sidx="${sIdx}" title="Delete section">✕</button>
        </div>
      </div>
      <div class="fields-list" data-sidx="${sIdx}">
        ${s.fields.map((_, fIdx) => _renderField(form, sIdx, fIdx)).join('')}
      </div>
      <button class="add-btn add-field-btn" data-sidx="${sIdx}">+ Add Field</button>
    </div>`;
}

// ── Field renderer ────────────────────────────────────────────────────────────

function _renderField(form, sIdx, fIdx) {
  const f = form.sections[sIdx].fields[fIdx];
  const t = f.type || 'text';
  const w = f.width || 'full';
  const isImage = t === 'image';
  const uid = `${sIdx}-${fIdx}`;

  return `
    <div class="field-card" data-sidx="${sIdx}" data-fidx="${fIdx}">
      <div class="field-row">
        <input class="field-label-input" type="text" placeholder="Field label *"
          value="${_esc(f.label || '')}" data-sidx="${sIdx}" data-fidx="${fIdx}" />
        <select class="field-type-select" data-sidx="${sIdx}" data-fidx="${fIdx}">
          ${['text','date','number','select','textarea','image'].map(v =>
            `<option value="${v}"${t === v ? ' selected' : ''}>${_typeLabel(v)}</option>`
          ).join('')}
        </select>
        <div class="width-toggle" ${isImage ? 'hidden' : ''}>
          <label><input type="radio" name="w-${uid}" value="full" ${w === 'full' ? 'checked' : ''} /> Full</label>
          <label><input type="radio" name="w-${uid}" value="half" ${w === 'half' ? 'checked' : ''} /> Half</label>
        </div>
        <label class="req-label" ${isImage ? 'hidden' : ''}>
          <input type="checkbox" class="field-req" ${f.required ? 'checked' : ''} />
          Required
        </label>
        <div class="field-move-del">
          <button class="move-btn fld-move" data-sidx="${sIdx}" data-fidx="${fIdx}" data-dir="up" title="Move field up">↑</button>
          <button class="move-btn fld-move" data-sidx="${sIdx}" data-fidx="${fIdx}" data-dir="down" title="Move field down">↓</button>
          <button class="del-field-btn" data-sidx="${sIdx}" data-fidx="${fIdx}" title="Delete field">✕</button>
        </div>
      </div>

      ${isImage
        ? `<div class="image-field-block">
            <div class="field-group">
              <label>Image file</label>
              <label class="btn btn-secondary">
                ${f.src ? 'Change Image' : 'Upload Image'}
                <input type="file" class="image-src-input" accept="image/*" style="display:none" />
              </label>
              ${f.src ? `<img class="image-field-preview" src="${f.src}" alt="${_esc(f.alt || '')}" />` : ''}
            </div>
            <div class="field-group">
              <label>Alt Text</label>
              <input type="text" class="field-alt-input" placeholder="Describe the image"
                value="${_esc(f.alt || '')}" />
            </div>
          </div>`
        : `<div class="llm-block">
            <div class="field-group">
              <label>Extraction Hint <span class="req-star">*</span></label>
              <textarea class="field-hint-input" rows="2"
                placeholder="What to look for in the document…">${_esc(f.extractionHint || '')}</textarea>
            </div>
            <div class="llm-row">
              <div class="field-group">
                <label>Output Format</label>
                <input type="text" class="field-format-input"
                  placeholder="e.g. DD.MM.YYYY or Last, First"
                  value="${_esc(f.outputFormat || '')}" />
              </div>
              <div class="field-group">
                <label>Examples <span class="field-hint-small">(one per line)</span></label>
                <textarea class="field-examples-input" rows="2"
                  placeholder="Müller, Hans">${_esc((f.examples || []).join('\n'))}</textarea>
              </div>
            </div>
          </div>
          <div class="validation-block">
            <div class="field-group">
              <label>Placeholder</label>
              <input type="text" class="field-placeholder-input" value="${_esc(f.placeholder || '')}" />
            </div>
            ${_renderValidation(t, f, uid)}
          </div>`
      }
    </div>`;
}

function _renderValidation(t, f, uid) {
  if (t === 'text' || t === 'textarea') {
    return `<div class="validation-row">
      <div class="field-group small">
        <label>Min length</label>
        <input type="number" class="v-minLength" min="0" value="${f.minLength ?? ''}" />
      </div>
      <div class="field-group small">
        <label>Max length</label>
        <input type="number" class="v-maxLength" min="0" value="${f.maxLength ?? ''}" />
      </div>
      ${t === 'text' ? `<div class="field-group">
        <label>Pattern (Regex)</label>
        <input type="text" class="v-pattern" placeholder="e.g. [0-9]{5}" value="${_esc(f.pattern || '')}" />
      </div>` : ''}
    </div>`;
  }
  if (t === 'number') {
    return `<div class="validation-row">
      <div class="field-group small"><label>Min</label>
        <input type="number" class="v-min" value="${f.min ?? ''}" /></div>
      <div class="field-group small"><label>Max</label>
        <input type="number" class="v-max" value="${f.max ?? ''}" /></div>
      <div class="field-group">
        <label class="inline-check">
          <input type="checkbox" class="v-integer" ${f.step === 1 ? 'checked' : ''} />
          Integer only
        </label>
      </div>
    </div>`;
  }
  if (t === 'date') {
    return `<div class="validation-row">
      <div class="field-group small"><label>Min date</label>
        <input type="date" class="v-minDate" value="${f.minDate || ''}" /></div>
      <div class="field-group small"><label>Max date</label>
        <input type="date" class="v-maxDate" value="${f.maxDate || ''}" /></div>
    </div>`;
  }
  if (t === 'select') {
    return `<div class="field-group">
      <label>Options <span class="field-hint-small">(one per line)</span></label>
      <textarea class="v-options" rows="3"
        placeholder="Option A&#10;Option B&#10;Option C">${_esc((f.options || []).join('\n'))}</textarea>
    </div>`;
  }
  return '';
}

// ── Event listeners ───────────────────────────────────────────────────────────

function _attachSectionListeners(container, form) {
  // Section title
  container.querySelectorAll('.section-title-input').forEach(inp =>
    inp.addEventListener('input', e => {
      form.sections[+e.target.dataset.sidx].title = e.target.value;
    }));

  // Move section
  container.querySelectorAll('.sec-move').forEach(btn =>
    btn.addEventListener('click', () => {
      const sIdx = +btn.dataset.sidx;
      const target = btn.dataset.dir === 'up' ? sIdx - 1 : sIdx + 1;
      if (target < 0 || target >= form.sections.length) return;
      [form.sections[sIdx], form.sections[target]] = [form.sections[target], form.sections[sIdx]];
      _showEditor(container, form);
    }));

  // Delete section
  container.querySelectorAll('.del-section-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('Delete this section and all its fields?')) return;
      form.sections.splice(+btn.dataset.sidx, 1);
      _showEditor(container, form);
    }));

  // Add field
  container.querySelectorAll('.add-field-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      form.sections[+btn.dataset.sidx].fields.push({
        id: crypto.randomUUID(),
        label: '', type: 'text', width: 'full', required: false, extractionHint: '',
      });
      _showEditor(container, form);
    }));

  // Per-field listeners
  container.querySelectorAll('.field-card').forEach(card => {
    const sIdx = +card.dataset.sidx;
    const fIdx = +card.dataset.fidx;
    const f = form.sections[sIdx].fields[fIdx];

    const on = (sel, evt, fn) => card.querySelector(sel)?.addEventListener(evt, fn);

    on('.field-label-input', 'input', e => {
      f.label = e.target.value;
      f.id = _labelToId(e.target.value) || f.id;
    });

    on('.field-type-select', 'change', e => {
      f.type = e.target.value;
      _showEditor(container, form);
    });

    card.querySelectorAll('input[type="radio"]').forEach(r =>
      r.addEventListener('change', e => { f.width = e.target.value; }));

    on('.field-req',            'change', e => { f.required = e.target.checked; });
    on('.field-hint-input',     'input',  e => { f.extractionHint = e.target.value; });
    on('.field-format-input',   'input',  e => { f.outputFormat = e.target.value; });
    on('.field-examples-input', 'input',  e => {
      f.examples = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    });
    on('.field-placeholder-input', 'input', e => { f.placeholder = e.target.value; });
    on('.v-minLength', 'input', e => { f.minLength = e.target.value ? +e.target.value : undefined; });
    on('.v-maxLength', 'input', e => { f.maxLength = e.target.value ? +e.target.value : undefined; });
    on('.v-pattern',   'input', e => { f.pattern   = e.target.value; });
    on('.v-min',       'input', e => { f.min = e.target.value !== '' ? +e.target.value : undefined; });
    on('.v-max',       'input', e => { f.max = e.target.value !== '' ? +e.target.value : undefined; });
    on('.v-integer',   'change',e => { f.step = e.target.checked ? 1 : undefined; });
    on('.v-minDate',   'input', e => { f.minDate = e.target.value; });
    on('.v-maxDate',   'input', e => { f.maxDate = e.target.value; });
    on('.v-options',   'input', e => {
      f.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    });
    on('.field-alt-input', 'input', e => { f.alt = e.target.value; });

    on('.image-src-input', 'change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      f.src = await _fileToBase64(file);
      _showEditor(container, form);
    });

    // Move field
    card.querySelectorAll('.fld-move').forEach(btn =>
      btn.addEventListener('click', () => {
        const fI = +btn.dataset.fidx;
        const sI = +btn.dataset.sidx;
        const target = btn.dataset.dir === 'up' ? fI - 1 : fI + 1;
        const fields = form.sections[sI].fields;
        if (target < 0 || target >= fields.length) return;
        [fields[fI], fields[target]] = [fields[target], fields[fI]];
        _showEditor(container, form);
      }));

    // Delete field
    on('.del-field-btn', 'click', () => {
      form.sections[sIdx].fields.splice(fIdx, 1);
      _showEditor(container, form);
    });
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _labelToId(label) {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
}

function _esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _typeLabel(t) {
  return { text: 'Text', date: 'Date', number: 'Number', select: 'Select (dropdown)', textarea: 'Text area', image: 'Image' }[t] ?? t;
}

async function _fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

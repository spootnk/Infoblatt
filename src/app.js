import { get, set, isAvailable } from './storage.js';
import { mount as mountBuilder } from './form-builder.js';
import { mount as mountRunner } from './form-runner.js';
import { mount as mountSettings } from './settings.js';

const MODES = {
  runner:   { label: 'Fill Form',     mount: mountRunner },
  builder:  { label: 'Manage Forms',  mount: mountBuilder },
  settings: { label: 'Settings',      mount: mountSettings },
};

let _activeMode = null;

async function loadSeed() {
  const existing = get('forms');
  if (existing && existing.length > 0) return;
  try {
    const res = await fetch('./form-config.json');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) set('forms', data);
  } catch { /* seed file absent or invalid — start empty */ }
}

function defaultMode() {
  if (!get('llmSettings')) return 'settings';
  const forms = get('forms');
  if (!forms || forms.length === 0) return 'builder';
  return 'runner';
}

function switchMode(mode, container) {
  _activeMode = mode;

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.setAttribute('aria-selected', btn.dataset.mode === mode ? 'true' : 'false');
  });

  container.innerHTML = '';
  MODES[mode].mount(container);
}

function renderBanners() {
  const banners = [];

  if (!get('llmSettings')) {
    banners.push(`
      <div class="banner banner--warn" role="alert">
        <span>⚠ No LLM configured — the form cannot be auto-filled.</span>
        <button class="banner-action" data-goto="settings">Open Settings</button>
      </div>`);
  }

  if (!isAvailable()) {
    banners.push(`
      <div class="banner banner--info" role="status">
        <span>ℹ Settings cannot be saved in this browser. Use Export Config to back up your configuration.</span>
      </div>`);
  }

  return banners.join('');
}

function render(initialMode) {
  const app = document.getElementById('app');

  app.innerHTML = `
    <header class="app-header">
      <div class="app-logo">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect width="28" height="28" rx="6" fill="white" fill-opacity="0.2"/>
          <rect x="5" y="7" width="18" height="2.5" rx="1.25" fill="white"/>
          <rect x="5" y="12" width="14" height="2.5" rx="1.25" fill="white"/>
          <rect x="5" y="17" width="10" height="2.5" rx="1.25" fill="white"/>
          <circle cx="21" cy="19" r="5" fill="white" fill-opacity="0.9"/>
          <path d="M18.5 19l1.7 1.7 2.8-2.8" stroke="#2563eb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>FormFillingTool</span>
      </div>
    </header>

    <nav class="app-nav" role="tablist" aria-label="Application modes">
      ${Object.entries(MODES).map(([key, { label }]) => `
        <button class="nav-tab" role="tab" data-mode="${key}"
          aria-selected="${key === initialMode ? 'true' : 'false'}">
          ${label}
        </button>`).join('')}
    </nav>

    <div class="banners" id="banners">${renderBanners()}</div>

    <main class="app-main" id="mode-panel" role="tabpanel"></main>
  `;

  const panel = app.querySelector('#mode-panel');

  app.querySelector('.app-nav').addEventListener('click', e => {
    const btn = e.target.closest('[data-mode]');
    if (btn) switchMode(btn.dataset.mode, panel);
  });

  app.querySelector('#banners').addEventListener('click', e => {
    const btn = e.target.closest('[data-goto]');
    if (btn) switchMode(btn.dataset.goto, panel);
  });

  window.addEventListener('formfillingtool:settingschanged', () => {
    document.getElementById('banners').innerHTML = renderBanners();
  });

  switchMode(initialMode, panel);
}

async function init() {
  await loadSeed();
  render(defaultMode());
}

init();

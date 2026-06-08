const _PREFIX = 'formfillingtool.';
let _mem = null;

function _check() {
  try {
    localStorage.setItem('__ft__', '1');
    localStorage.removeItem('__ft__');
    return true;
  } catch {
    return false;
  }
}

const _ok = _check();
if (!_ok) _mem = new Map();

export function isAvailable() { return _ok; }

export function get(key) {
  if (_ok) {
    const v = localStorage.getItem(_PREFIX + key);
    return v ? JSON.parse(v) : null;
  }
  return _mem.get(key) ?? null;
}

export function set(key, value) {
  if (_ok) localStorage.setItem(_PREFIX + key, JSON.stringify(value));
  else _mem.set(key, value);
}

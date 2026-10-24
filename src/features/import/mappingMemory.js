// Remembers CSV/Excel column choices per header layout, so the next statement from the same
// bank maps itself. A per-device convenience only — losing it just means mapping again.

const KEY = 'ccr.importMappings.v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function loadMapping(signature) {
  return readAll()[signature] ?? null;
}

export function saveMapping(signature, settings) {
  try {
    const all = readAll();
    all[signature] = settings;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode, blocked) — nothing to do.
  }
}

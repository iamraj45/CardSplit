// Notifies open screens when records change underneath them (e.g. pulled from the server),
// so they can reload. Local edits made through the UI do not go through here.

const listeners = new Set();

/** Subscribe to changes; `ids` is an array of changed reconciliation ids, or null for "anything". */
export function onRecordsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRecordsChanged(ids = null) {
  for (const listener of listeners) {
    try {
      listener(ids);
    } catch (err) {
      console.error(err);
    }
  }
}

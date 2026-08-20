/**
 * localStorage abstraction for structured application data.
 * All data is namespaced with "pfh_" prefix.
 * Returns plain JavaScript arrays/objects — no raw localStorage calls in services.
 */

const PREFIX = "pfh_";

function key(name) {
  return PREFIX + name;
}

export function lsGet(name) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function lsSet(name, value) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

export function lsGetArray(name) {
  return lsGet(name) ?? [];
}

export function lsSetArray(name, arr) {
  lsSet(name, arr);
}

export function lsGetObject(name) {
  return lsGet(name) ?? {};
}

export function lsSetObject(name, obj) {
  lsSet(name, obj);
}

/** Clear a single store */
export function lsClear(name) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(name));
}

/** Clear all app data (used on logout if desired) */
export function lsClearAll() {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

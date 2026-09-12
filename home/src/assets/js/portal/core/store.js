/*
Author       : OM Academy
Description  : Browser data store that plays the server for the demo.
  - One localStorage key per collection ("om-portal:<name>"), so two tabs writing different collections never clash.
  - Every write re-reads its collection, changes it and writes it back in one synchronous step (no lost updates).
  - Same-tab changes are broadcast after the current task; other tabs are notified by the "storage" event.
  - Falls back to an in-memory store (with a banner) when localStorage is unavailable.
  Records are plain objects with id / createdAt / updatedAt. Treat what get() returns as read-only.
*/

import { nowISO } from "./clock.js";
import { migrations } from "./migrations.js";

export const APP = "om-academy-portal";
export const PREFIX = "om-portal:";
export const SCHEMA_VERSION = 1;

export const SINGLETONS = ["meta", "counters", "settings"];
export const COLLECTIONS = [
  "roles", "users", "centers", "courses", "batches", "timetableSlots", "enrollments", "attendanceSessions",
  "leaveRequests", "assignments", "submissions", "exams", "marks", "transcripts", "feeStructures", "invoices",
  "payments", "announcements", "notifications", "threads", "messages", "forumThreads", "forumPosts", "resources",
  "events", "files", "activity", "deliveries",
];
export const DATA_KEYS = [...SINGLETONS, ...COLLECTIONS];

// Keys that are not demo data and survive a reset
const KEEP_ON_RESET = [/^session:/, /^theme$/, /^clock$/, /^ui:/];

// Short id prefixes per collection (readable ids like inv_k3x9a2)
const ID_PREFIX = {
  roles: "role", users: "usr", centers: "ctr", courses: "crs", batches: "bat", timetableSlots: "slot",
  enrollments: "enr", attendanceSessions: "att", leaveRequests: "lv", assignments: "asg", submissions: "sub",
  exams: "exm", marks: "mrk", transcripts: "trn", feeStructures: "fs", invoices: "inv", payments: "pay",
  announcements: "ann", notifications: "ntf", threads: "thr", messages: "msg", forumThreads: "ft", forumPosts: "fp",
  resources: "res", events: "evt", files: "file", activity: "act", deliveries: "dlv",
};

/* ---------- backend ---------- */

function memoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

function detectBackend() {
  try {
    const k = PREFIX + "__probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return { storage: window.localStorage, persistent: true };
  } catch {
    return { storage: memoryBackend(), persistent: false };
  }
}

const backend = detectBackend();
export const isPersistent = backend.persistent;

const cache = new Map();
const indexes = new Map();
const listeners = new Set();
const errorListeners = new Set();
let pending = new Set();
let flushTimer = null;

const emptyFor = (name) => (SINGLETONS.includes(name) ? {} : []);

function readRaw(name) {
  const raw = backend.storage.getItem(PREFIX + name);
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const isQuotaError = (e) => e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);

// Free space by trimming the activity log and read notifications. Returns true if anything was removed.
function freeSpace() {
  let freed = false;
  const activity = readRaw("activity");
  if (Array.isArray(activity) && activity.length > 150) {
    backend.storage.setItem(PREFIX + "activity", JSON.stringify(activity.slice(-150)));
    cache.delete("activity");
    freed = true;
  }
  const notes = readRaw("notifications");
  if (Array.isArray(notes)) {
    const kept = notes.filter((n) => !n.readAt);
    if (kept.length < notes.length) {
      backend.storage.setItem(PREFIX + "notifications", JSON.stringify(kept));
      cache.delete("notifications");
      freed = true;
    }
  }
  return freed;
}

function writeRaw(name, value) {
  const json = JSON.stringify(value);
  try {
    backend.storage.setItem(PREFIX + name, json);
  } catch (e) {
    if (isQuotaError(e) && freeSpace()) {
      try {
        backend.storage.setItem(PREFIX + name, json);
        return;
      } catch (e2) {
        e = e2;
      }
    }
    errorListeners.forEach((fn) => fn(e));
    throw new Error("Browser storage is full. Export your demo data, then reset it.");
  }
}

/* ---------- change notification ---------- */

function queue(name) {
  pending.add(name);
  if (!flushTimer) flushTimer = setTimeout(flush, 0);
}

function flush() {
  const changed = pending;
  pending = new Set();
  flushTimer = null;
  listeners.forEach((fn) => {
    try {
      fn(changed);
    } catch (err) {
      console.error(err);
    }
  });
}

// fn(changed: Set<string>) — called after same-tab writes and when another tab writes
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onError(fn) {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.storageArea && e.storageArea !== backend.storage) return;
    if (e.key === null) {
      cache.clear();
      indexes.clear();
      DATA_KEYS.forEach(queue);
      return;
    }
    if (!e.key.startsWith(PREFIX)) return;
    const name = e.key.slice(PREFIX.length);
    cache.delete(name);
    indexes.delete(name);
    queue(name);
  });
}

/* ---------- reads ---------- */

export function get(name) {
  if (!cache.has(name)) cache.set(name, readRaw(name) ?? emptyFor(name));
  return cache.get(name);
}

function indexFor(name) {
  if (!indexes.has(name)) {
    const map = new Map();
    for (const r of get(name)) map.set(r.id, r);
    indexes.set(name, map);
  }
  return indexes.get(name);
}

export const byId = (name, id) => (id == null ? undefined : indexFor(name).get(id));
export const where = (name, pred) => get(name).filter(pred);
export const count = (name, pred) => (pred ? get(name).filter(pred).length : get(name).length);

// Raw key/value access for non-collection keys (sessions, theme, ui prefs)
export function getKey(key) {
  const raw = backend.storage.getItem(PREFIX + key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function setKey(key, value) {
  if (value == null) backend.storage.removeItem(PREFIX + key);
  else backend.storage.setItem(PREFIX + key, JSON.stringify(value));
  queue(key);
}

/* ---------- writes ---------- */

export function newId(prefix = "id") {
  return prefix + "_" + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
}

// Read-modify-write on the freshest copy. fn may mutate its argument or return a replacement.
export function mutate(name, fn) {
  const fresh = readRaw(name) ?? emptyFor(name);
  const result = fn(fresh);
  const next = result === undefined ? fresh : result;
  writeRaw(name, next);
  cache.set(name, next);
  indexes.delete(name);
  queue(name);
  return next;
}

export function insert(name, record) {
  const stamp = nowISO();
  const rec = { id: record.id || newId(ID_PREFIX[name]), createdAt: stamp, updatedAt: stamp, ...record };
  if (!rec.id) rec.id = newId(ID_PREFIX[name]);
  mutate(name, (list) => {
    list.push(rec);
  });
  return rec;
}

export function insertMany(name, records) {
  const stamp = nowISO();
  const recs = records.map((r) => ({ createdAt: stamp, updatedAt: stamp, ...r, id: r.id || newId(ID_PREFIX[name]) }));
  mutate(name, (list) => {
    list.push(...recs);
  });
  return recs;
}

// patch: object merged into the record, or fn(copy) returning the new record
export function update(name, id, patch) {
  let out;
  mutate(name, (list) => {
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`Record not found: ${name}/${id}`);
    const current = list[i];
    const next = typeof patch === "function" ? patch({ ...current }) : { ...current, ...patch };
    next.id = current.id;
    next.updatedAt = nowISO();
    list[i] = next;
    out = next;
  });
  return out;
}

// Update every record matching pred with fn(copy) → record. Returns the number changed.
export function updateWhere(name, pred, fn) {
  let changed = 0;
  mutate(name, (list) => {
    for (let i = 0; i < list.length; i++) {
      if (pred(list[i])) {
        const next = fn({ ...list[i] });
        next.updatedAt = nowISO();
        list[i] = next;
        changed++;
      }
    }
  });
  return changed;
}

// Remove by id or predicate. Returns the removed records.
export function remove(name, idOrPred) {
  const pred = typeof idOrPred === "function" ? idOrPred : (r) => r.id === idOrPred;
  let removed = [];
  mutate(name, (list) => {
    removed = list.filter(pred);
    return list.filter((r) => !pred(r));
  });
  return removed;
}

export function setSingleton(name, value) {
  return mutate(name, () => value);
}

export function patchSingleton(name, patch) {
  return mutate(name, (obj) => ({ ...obj, ...(typeof patch === "function" ? patch(obj) : patch) }));
}

// Readable sequence numbers (invoices, receipts, roll numbers, transcripts)
export function nextNumber(counter) {
  let value = 0;
  mutate("counters", (c) => {
    value = (c[counter] || 0) + 1;
    return { ...c, [counter]: value };
  });
  return value;
}

/* ---------- lifecycle: seed, migrate, reset, export, import ---------- */

function dataKeysInStorage() {
  const keys = [];
  for (let i = 0; i < backend.storage.length; i++) {
    const k = backend.storage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
  }
  return keys;
}

// Remove all demo data (keeps sessions, theme, clock and ui prefs)
export function clearData() {
  for (const key of dataKeysInStorage()) {
    if (KEEP_ON_RESET.some((re) => re.test(key))) continue;
    backend.storage.removeItem(PREFIX + key);
  }
  cache.clear();
  indexes.clear();
}

function writeAll(collections) {
  for (const name of DATA_KEYS) {
    const value = collections[name] ?? emptyFor(name);
    writeRaw(name, value);
  }
  cache.clear();
  indexes.clear();
  DATA_KEYS.forEach(queue);
}

export async function reseed() {
  const { buildSeed } = await import("./seed.js");
  const data = buildSeed();
  clearData();
  writeAll(data);
  return data;
}

function runMigrations(from) {
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    if (migrations[v]) migrations[v]({ get: readRaw, set: writeRaw });
  }
  const meta = readRaw("meta") || {};
  writeRaw("meta", { ...meta, schemaVersion: SCHEMA_VERSION });
  cache.clear();
  indexes.clear();
}

let ready = null;

// Seed on first run, migrate older data, reseed corrupt or newer data. Returns { seeded, reason }.
export function init() {
  if (!ready) {
    ready = (async () => {
      const meta = readRaw("meta");
      if (!meta || meta.app !== APP || !meta.schemaVersion) {
        await reseed();
        return { seeded: true, reason: "first-run" };
      }
      if (meta.schemaVersion > SCHEMA_VERSION) {
        await reseed();
        return { seeded: true, reason: "newer-version" };
      }
      if (meta.schemaVersion < SCHEMA_VERSION) runMigrations(meta.schemaVersion);
      const missing = COLLECTIONS.some((n) => backend.storage.getItem(PREFIX + n) == null);
      if (missing) {
        await reseed();
        return { seeded: true, reason: "incomplete" };
      }
      return { seeded: false };
    })();
  }
  return ready;
}

export function exportAll() {
  const collections = {};
  for (const name of DATA_KEYS) collections[name] = readRaw(name) ?? emptyFor(name);
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: nowISO(), collections };
}

export function importAll(payload) {
  if (!payload || payload.app !== APP || !payload.collections) throw new Error("This file is not an OM Academy portal export.");
  if (payload.schemaVersion > SCHEMA_VERSION) throw new Error("This export was made by a newer version of the portal.");
  clearData();
  writeAll(payload.collections);
  if (payload.schemaVersion < SCHEMA_VERSION) runMigrations(payload.schemaVersion);
}

// Approximate bytes used by portal data (for Settings → Data)
export function usageBytes() {
  let total = 0;
  for (const key of dataKeysInStorage()) {
    const v = backend.storage.getItem(PREFIX + key) || "";
    total += (key.length + v.length) * 2;
  }
  return total;
}

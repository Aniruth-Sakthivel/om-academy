/*
Author       : OM Academy
Description  : Portal clock. Every date in the portal goes through here so the demo date can be overridden
               (Settings → System → demo date) and date-only strings are parsed as local dates, never UTC.
*/

const OVERRIDE_KEY = "om-portal:clock";

export const pad = (n) => String(n).padStart(2, "0");

function readOverride() {
  try {
    return localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

// Current moment. With an override, the date is replaced but the time of day keeps running.
export function now() {
  const real = new Date();
  const override = readOverride();
  if (!override || !/^\d{4}-\d{2}-\d{2}$/.test(override)) return real;
  const [y, m, d] = override.split("-").map(Number);
  const shifted = new Date(real);
  shifted.setFullYear(y, m - 1, d);
  return shifted;
}

export function setOverride(isoDateOrNull) {
  try {
    if (isoDateOrNull) localStorage.setItem(OVERRIDE_KEY, isoDateOrNull);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* storage unavailable: the override simply doesn't apply */
  }
}

export const getOverride = () => readOverride();

// "YYYY-MM-DD" for a Date (local calendar date)
export function isoDate(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export const today = () => isoDate(now());
export const nowISO = () => now().toISOString();

// Parse "YYYY-MM-DD" as a local date; anything else goes to the Date constructor.
export function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

// Date-only part of an ISO date or datetime string
export const dateOf = (value) => (typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : isoDate(parseDate(value)));

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function addMonths(iso, n) {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDate(d);
}

// Whole days from b to a (a - b), immune to DST because it compares calendar dates.
export function diffDays(a, b) {
  const da = parseDate(dateOf(a));
  const db = parseDate(dateOf(b));
  return Math.round((Date.UTC(da.getFullYear(), da.getMonth(), da.getDate()) - Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())) / 86400000);
}

export const weekday = (iso) => parseDate(iso).getDay();
export const monthKey = (iso) => dateOf(iso).slice(0, 7);
export const startOfMonth = (iso) => dateOf(iso).slice(0, 8) + "01";

export function endOfMonth(iso) {
  const d = parseDate(startOfMonth(iso));
  return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfWeek(iso, weekStartsOn = 1) {
  const d = parseDate(iso);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

// Every date from..to inclusive
export function eachDay(from, to) {
  const out = [];
  for (let d = dateOf(from); d <= dateOf(to); d = addDays(d, 1)) out.push(d);
  return out;
}

// Local Date for a date + "HH:MM"
export function combine(iso, time = "00:00") {
  const d = parseDate(dateOf(iso));
  const [h, m] = String(time).split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

// ISO string for a date + "HH:MM"
export const combineISO = (iso, time) => combine(iso, time).toISOString();

export const isPast = (value) => parseDate(value).getTime() < now().getTime();

// Minutes since midnight for "HH:MM"
export function minutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Indian financial year label for a date: 2026-09-12 → "26-27"
export function financialYear(iso = today()) {
  const d = parseDate(dateOf(iso));
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return String(startYear).slice(2) + "-" + String(startYear + 1).slice(2);
}

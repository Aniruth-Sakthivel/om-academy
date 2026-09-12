/*
Author       : OM Academy
Description  : Display formatting: rupees (en-IN grouping), dates, times, relative time, percentages, names.
               Dates are local calendar dates (see clock.js).
*/

import { parseDate, now, diffDays, dateOf } from "./clock.js";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat("en-IN");
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dateShortFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });
const monthYearFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });
const monthLongFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const weekdayLongFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

export const money = (n) => inr.format(Math.round(Number(n) || 0));
export const moneyExact = (n) => inrExact.format(Number(n) || 0);
export const num = (n) => numFmt.format(Number(n) || 0);

// Compact rupees for chart axes: ₹1.2L, ₹45K
export function moneyShort(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 10000000) return "₹" + (v / 10000000).toFixed(1).replace(/\.0$/, "") + "Cr";
  if (Math.abs(v) >= 100000) return "₹" + (v / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  if (Math.abs(v) >= 1000) return "₹" + (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return "₹" + v;
}

const valid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

export function date(value) {
  if (!value) return "—";
  const d = parseDate(value);
  return valid(d) ? dateFmt.format(d) : "—";
}

export function dateShort(value) {
  if (!value) return "—";
  const d = parseDate(value);
  return valid(d) ? dateShortFmt.format(d) : "—";
}

export const monthYear = (value) => monthYearFmt.format(parseDate(value));
export const monthLong = (value) => monthLongFmt.format(parseDate(value));
export const weekdayShort = (value) => weekdayFmt.format(parseDate(value));
export const weekdayLong = (value) => weekdayLongFmt.format(parseDate(value));

// "14:30" → "2:30 pm"; also accepts an ISO datetime
export function time(value) {
  if (!value) return "—";
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return timeFmt.format(d);
  }
  const d = parseDate(value);
  return valid(d) ? timeFmt.format(d) : "—";
}

export const timeRange = (start, end) => time(start) + " – " + time(end);

export function dateTime(value) {
  if (!value) return "—";
  const d = parseDate(value);
  return valid(d) ? dateFmt.format(d) + ", " + timeFmt.format(d) : "—";
}

// "just now", "5 min ago", "3 h ago", "yesterday", "in 2 days", then a date
export function relative(value) {
  if (!value) return "—";
  const d = parseDate(value);
  if (!valid(d)) return "—";
  const diffMs = now().getTime() - d.getTime();
  const future = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return future ? `in ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && dateOf(value) === dateOf(now().toISOString())) return future ? `in ${hours} h` : `${hours} h ago`;
  const days = diffDays(dateOf(now().toISOString()), dateOf(value));
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  if (Math.abs(days) < 7) return days > 0 ? `${days} days ago` : `in ${-days} days`;
  return date(value);
}

// Days until a date: "Today", "Tomorrow", "in 3 days", "2 days overdue"
export function dueIn(value) {
  const days = diffDays(dateOf(value), dateOf(now().toISOString()));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${-days} days overdue`;
}

export function pct(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits) + "%";
}

export const plural = (n, word, pluralWord) => n + " " + (n === 1 ? word : pluralWord || word + "s");

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function fileSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

export const truncate = (s, n = 120) => (String(s || "").length > n ? String(s).slice(0, n - 1).trimEnd() + "…" : String(s || ""));

export const titleCase = (s) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

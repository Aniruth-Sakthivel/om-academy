/*
Author       : OM Academy
Description  : Student → Attendance. KPIs and a below-minimum warning, per-course cards, a month heatmap,
               a monthly chart, the full records table and the Leave tab (request, history, cancel).
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import * as files from "../core/files.js";
import { html, raw, on, qs, toast, modal, confirm, dataTable, badge, statCard, emptyState, tabs, setSearchParam, getSearchParam, downloadCsv } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateShort, monthLong, monthYear, weekdayShort, fileSize, plural } from "../core/format.js";
import { today, addMonths, startOfMonth, endOfMonth, eachDay, weekday, monthKey, diffDays } from "../core/clock.js";
import { barChart, palette } from "../core/charts.js";
import { run, friendlyMessage } from "../core/errors.js";

const TABS = ["overview", "records", "leave"];
const MARKS = {
  P: { status: "present", label: "Present" },
  A: { status: "absent", label: "Absent" },
  L: { status: "late", label: "Late" },
  E: { status: "excused", label: "Excused" },
};
const LEAVE_TYPES = [["sick", "Sick leave"], ["personal", "Personal"], ["family", "Family function"], ["exam", "Exam / interview"], ["other", "Other"]];
const LEAVE_LABEL = Object.fromEntries(LEAVE_TYPES);
const DOC_RE = /\.(pdf|jpe?g|png)$/i;

let ctx;
let month;
let recordsTable;
let leaveTable;
let chart = null;
let chartPromise = null;
let destroyed = false;

boot({
  id: "student-attendance",
  portal: "student",
  watch: ["attendanceSessions", "leaveRequests", "enrollments", "batches", "courses", "events", "settings", "files"],
  mount(c) {
    ctx = c;
    const m = getSearchParam("month");
    month = /^\d{4}-\d{2}$/.test(m || "") && m <= monthKey(today()) ? m : monthKey(today());
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) {
      const rec = store.byId("leaveRequests", id);
      if (!rec || rec.studentId !== ctx.user.id) toast("That leave request couldn't be found.", { type: "warning" });
    }
  },
  update: () => refresh(),
  unmount() {
    destroyed = true;
    chart?.destroy();
    recordsTable?.destroy();
    leaveTable?.destroy();
  },
});

/* ---------- data ---------- */

const minPct = () => (store.get("settings").attendance || {}).minPct ?? 75;
const pctClass = (n) => "pct-" + Math.min(100, Math.max(0, Math.round((Number(n) || 0) / 5) * 5));
const toneFor = (pct) => (pct >= minPct() ? "green" : pct >= minPct() - 5 ? "amber" : "rust");

function myBatches() {
  return sel.activeBatchesOf(ctx.user.id).map((b) => ({ batch: b, course: store.byId("courses", b.courseId) || { title: b.name, tone: "blue" } }));
}

function recordRows() {
  const out = [];
  for (const { batch, course } of myBatches()) {
    for (const s of sel.sessionsForBatch(batch.id)) {
      const mark = s.records[ctx.user.id];
      if (!mark) continue;
      out.push({ id: s.id, date: s.date, courseId: course.id, courseTitle: course.title, courseCode: course.code || "", batchName: batch.name, mark, markLabel: MARKS[mark]?.label || mark });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function holidaysIn(from, to) {
  const map = {};
  for (const e of sel.eventsVisibleTo(ctx.user).filter((ev) => ev.type === "holiday")) {
    const start = String(e.start).slice(0, 10);
    const end = String(e.end || e.start).slice(0, 10);
    for (const d of eachDay(start < from ? from : start, end > to ? to : end)) map[d] = e.title;
  }
  return map;
}

function leaveRows() {
  return sel.leaveRequestsFor(ctx.user.id).map((l) => ({ ...l, days: diffDays(l.to, l.from) + 1, typeLabel: LEAVE_LABEL[l.type] || l.type, file: l.fileId ? store.byId("files", l.fileId) : null }));
}

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "overview";
  const courses = myBatches().map((b) => b.course);
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Attendance</li></ol>
        <h1 class="page-title">Attendance</h1>
        <p class="page-subtitle">Your class attendance across courses, and leave requests.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="export">${raw(icon("Download", { size: 16 }))}Export</button>
        <button type="button" class="btn btn-primary" data-act="leave">${raw(icon("CalendarX", { size: 16 }))}Request leave</button>
      </div>
    </div>
    <div data-alert></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="overview">${raw(icon("ChartColumn", { size: 15 }))}Overview</button>
        <button type="button" class="tab" role="tab" data-tab="records">${raw(icon("List", { size: 15 }))}Records <span class="tab-count" data-count="records"></span></button>
        <button type="button" class="tab" role="tab" data-tab="leave">${raw(icon("CalendarX", { size: 15 }))}Leave <span class="tab-count" data-count="leave"></span></button>
      </div>
      <div data-tab-panel="overview">
        <div class="card-body stack">
          <div data-course-cards></div>
          <div class="grid grid-2">
            <section class="card">
              <div class="card-header">
                <div><h3 class="card-title" data-month-title></h3><p class="card-subtitle" data-month-sub></p></div>
                <div class="cluster">
                  <button type="button" class="btn btn-outline btn-sm btn-icon" data-month="-1" aria-label="Previous month">${raw(icon("ChevronLeft", { size: 16 }))}</button>
                  <button type="button" class="btn btn-outline btn-sm" data-month="0">This month</button>
                  <button type="button" class="btn btn-outline btn-sm btn-icon" data-month="1" aria-label="Next month">${raw(icon("ChevronRight", { size: 16 }))}</button>
                </div>
              </div>
              <div class="card-body stack">
                <div class="att-heatmap" data-heatmap></div>
                <div class="cal-legend">
                  ${[["P", "Present"], ["L", "Late"], ["A", "Absent"], ["E", "Excused"], ["H", "Holiday"]].map(([k, l]) => html`<span class="cal-legend-item"><span class="att-swatch mark-${raw(k)}"></span>${l}</span>`)}
                  <span class="cal-legend-item"><span class="att-swatch is-sunday"></span>Sunday</span>
                </div>
              </div>
            </section>
            <section class="card">
              <div class="card-header"><div><h3 class="card-title">Monthly attendance</h3><p class="card-subtitle">Classes by status, last 6 months</p></div></div>
              <div class="card-body"><div class="chart-box" data-chart></div></div>
            </section>
          </div>
        </div>
      </div>
      <div data-tab-panel="records" hidden><div data-records-table></div></div>
      <div data-tab-panel="leave" hidden>
        <div class="card-body stack-sm">
          <div class="alert tone-blue">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Approved leave marks those classes as <strong>excused</strong>, so they don't count against your attendance. You can cancel a request while it is pending.</div></div>
        </div>
        <div data-leave-table></div>
      </div>
    </div>`;

  tabs(ctx.root, {
    active,
    onChange: (id) => {
      setSearchParam("tab", id);
      if (id === "overview") ensureChart();
    },
  });

  recordsTable = dataTable(qs("[data-records-table]", ctx.root), {
    rows: [],
    searchKeys: ["courseTitle", "batchName", "date"],
    filters: [
      { key: "courseId", label: "Course", options: courses.map((c) => [c.id, c.title]) },
      { key: "mark", label: "Status", options: Object.entries(MARKS).map(([k, v]) => [k, v.label]) },
    ],
    columns: [
      { key: "date", label: "Date", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${date(r.date)}</span><span class="cell-sub">${weekdayShort(r.date)}</span></div>` },
      { key: "courseTitle", label: "Course", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.courseTitle}</span><span class="cell-sub">${r.batchName}</span></div>` },
      { key: "mark", label: "Status", render: (r) => badge(MARKS[r.mark]?.status, r.markLabel) },
    ],
    empty: emptyState({ icon: "CalendarCheck", title: "No attendance records", text: "Records appear here once your instructor marks attendance." }),
  });

  leaveTable = dataTable(qs("[data-leave-table]", ctx.root), {
    rows: [],
    searchKeys: ["reason", "typeLabel"],
    filters: [{ key: "status", label: "Status", options: [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]] }],
    columns: [
      { key: "from", label: "Dates", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.from === r.to ? date(r.from) : dateShort(r.from) + " – " + date(r.to)}</span><span class="cell-sub">${plural(r.days, "day")}</span></div>` },
      { key: "typeLabel", label: "Type", hideBelow: "md" },
      { key: "reason", label: "Reason", render: (r) => html`<span class="leave-reason">${r.reason}</span>${r.reviewNote ? html`<div class="cell-sub">Note: ${r.reviewNote}</div>` : raw("")}` },
      { key: "status", label: "Status", render: (r) => badge(r.status, r.status) },
    ],
    rowActions: [
      { label: "Download document", icon: "Paperclip", hidden: (r) => !r.fileId, onClick: (r) => downloadDoc(r) },
      { label: "Cancel request", icon: "X", danger: true, hidden: (r) => r.status !== "pending", onClick: (r) => cancelFlow(r.id) },
    ],
    empty: emptyState({ icon: "CalendarX", title: "No leave requests", text: "Requests you make will be listed here with their status.", actionLabel: "Request leave", actionAttrs: 'data-act="leave"' }),
  });
}

function refresh() {
  const stats = sel.attendanceStats(ctx.user.id);
  const min = minPct();
  const needed = sel.classesNeededFor75(ctx.user.id);
  const records = recordRows();
  const leaves = leaveRows();

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "CalendarCheck", label: "Overall attendance", value: stats.total ? stats.pct + "%" : "—", tone: stats.total ? toneFor(stats.pct) : "slate" }),
    statCard({ icon: "UserCheck", label: "Present", value: String(stats.present - stats.late), tone: "green" }),
    statCard({ icon: "UserX", label: "Absent", value: String(stats.absent), tone: stats.absent ? "rust" : "slate" }),
    statCard({ icon: "Timer", label: "Late", value: String(stats.late), tone: stats.late ? "amber" : "slate" }),
    statCard({ icon: "ShieldCheck", label: "Excused", value: String(stats.excused), tone: "purple" }),
  ].join("");

  qs("[data-alert]", ctx.root).innerHTML =
    stats.total && stats.pct < min
      ? html`<div class="alert tone-rust page-section" role="alert">
          ${raw(icon("TriangleAlert", { size: 18 }))}
          <div class="alert-body"><p class="alert-title">Your attendance is ${stats.pct}% — below the required ${min}%</p>${needed ? `Attend the next ${plural(needed, "class", "classes")} without a break to get back to ${min}%. ` : ""}Low attendance can affect your exam eligibility.</div>
        </div>`
      : "";

  qs('[data-count="records"]', ctx.root).textContent = records.length;
  qs('[data-count="leave"]', ctx.root).textContent = leaves.filter((l) => l.status === "pending").length || leaves.length;

  qs("[data-course-cards]", ctx.root).innerHTML = courseCardsHtml();
  renderHeatmap();
  recordsTable.update(records);
  leaveTable.update(leaves);
  if (chart) chart.updateSeries(chartData().series, false);
  else if (!qs('[data-tab-panel="overview"]', ctx.root).hidden) ensureChart();
}

function courseCardsHtml() {
  const list = myBatches();
  if (!list.length) return emptyState({ icon: "BookOpen", title: "No active courses", text: "Attendance appears here once you're enrolled in a batch." });
  return html`<div class="grid grid-2">${list.map(({ batch, course }) => {
    const s = sel.attendanceStats(ctx.user.id, batch.id);
    const tone = s.total ? toneFor(s.pct) : "slate";
    const need = sel.classesNeededFor75(ctx.user.id, batch.id);
    return html`
      <article class="att-course">
        <div class="cluster-between">
          <div class="cluster att-course-head">
            <span class="icon-tile icon-tile-sm tone-${raw(course.tone || "blue")}">${raw(icon("BookOpen", { size: 16 }))}</span>
            <div class="list-row-main"><div class="list-row-title">${course.title}</div><div class="list-row-sub">${batch.name}</div></div>
          </div>
          <span class="att-course-pct tone-${raw(tone)}">${s.total ? s.pct + "%" : "—"}</span>
        </div>
        <div class="progress tone-${raw(tone)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.pct}" aria-label="Attendance ${course.title}"><span class="progress-bar ${raw(pctClass(s.total ? s.pct : 0))}"></span></div>
        <div class="att-course-counts">
          <span><span class="att-swatch mark-P"></span>${s.present - s.late} present</span>
          <span><span class="att-swatch mark-L"></span>${s.late} late</span>
          <span><span class="att-swatch mark-A"></span>${s.absent} absent</span>
          <span><span class="att-swatch mark-E"></span>${s.excused} excused</span>
        </div>
        ${need ? html`<p class="text-xs text-danger m-0">Attend ${plural(need, "more class", "more classes")} in a row to reach ${minPct()}%.</p>` : raw("")}
      </article>`;
  })}</div>`;
}

function renderHeatmap() {
  const from = startOfMonth(month + "-01");
  const to = endOfMonth(from);
  const marks = sel.attendanceHeatmap(ctx.user.id, from);
  const holidays = holidaysIn(from, to);
  const t = today();
  const lead = (weekday(from) + 6) % 7; // Monday-first grid
  const counts = { P: 0, A: 0, L: 0, E: 0 };
  Object.values(marks).forEach((m) => counts[m] != null && counts[m]++);

  qs("[data-month-title]", ctx.root).textContent = monthLong(from);
  qs("[data-month-sub]", ctx.root).textContent = Object.keys(marks).length
    ? `${counts.P} present · ${counts.L} late · ${counts.A} absent · ${counts.E} excused`
    : "No classes recorded this month";
  qs('[data-month="1"]', ctx.root).disabled = month >= monthKey(t);
  qs('[data-month="0"]', ctx.root).disabled = month === monthKey(t);

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="att-day is-blank" aria-hidden="true"></span>`);
  for (const d of eachDay(from, to)) {
    const mark = marks[d];
    const holiday = holidays[d];
    const sunday = weekday(d) === 0;
    let cls = "heat-0";
    let label = "No class";
    if (mark) {
      cls = "mark-" + mark;
      label = MARKS[mark]?.label || mark;
    } else if (holiday) {
      cls = "mark-H";
      label = "Holiday: " + holiday;
    } else if (sunday) {
      cls = "is-sunday";
      label = "Sunday";
    } else if (d > t) {
      cls = "heat-0 is-future";
      label = "Upcoming";
    }
    const text = `${date(d)} — ${label}`;
    cells.push(html`<span class="heat-cell att-day ${raw(cls)} ${raw(d === t ? "is-today" : "")}" title="${text}" aria-label="${text}" role="img">${Number(d.slice(8))}</span>`);
  }
  qs("[data-heatmap]", ctx.root).innerHTML = html`
    <div class="att-grid att-grid-head" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map((l) => html`<span>${l}</span>`)}</div>
    <div class="att-grid">${cells}</div>`;
}

function chartData() {
  const t = today();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthKey(addMonths(startOfMonth(t), -i)));
  const rows = recordRows();
  const count = (m, mark) => rows.filter((r) => r.date.slice(0, 7) === m && r.mark === mark).length;
  return {
    categories: months.map((m) => monthYear(m + "-01")),
    series: [
      { name: "Present", data: months.map((m) => count(m, "P")) },
      { name: "Late", data: months.map((m) => count(m, "L")) },
      { name: "Absent", data: months.map((m) => count(m, "A")) },
      { name: "Excused", data: months.map((m) => count(m, "E")) },
    ],
  };
}

function ensureChart() {
  if (chart || chartPromise) return;
  const el = qs("[data-chart]", ctx.root);
  const p = palette();
  const { series, categories } = chartData();
  chartPromise = barChart(el, { series, categories, stacked: true, height: 280, colors: [p.success, p.warning, p.danger, p.series[3]] })
    .then((c) => {
      if (destroyed) return c?.destroy();
      chart = c;
    })
    .catch((err) => {
      console.error(err);
      el.innerHTML = emptyState({ icon: "TriangleAlert", title: "The chart couldn't load", text: "Reload the page to try again." });
    });
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", "[data-month]", (e, btn) => {
    const step = Number(btn.dataset.month);
    const next = step === 0 ? monthKey(today()) : monthKey(addMonths(month + "-01", step));
    if (next > monthKey(today())) return;
    month = next;
    setSearchParam("month", month === monthKey(today()) ? null : month);
    renderHeatmap();
  });
  on(ctx.root, "click", '[data-act="leave"]', () => requestFlow());
  on(ctx.root, "click", '[data-act="export"]', () => {
    const rows = recordRows();
    if (!rows.length) return toast("There are no attendance records to export yet.", { type: "info" });
    downloadCsv("om-academy-attendance.csv", rows, [
      { label: "Date", value: (r) => r.date },
      { label: "Day", value: (r) => weekdayShort(r.date) },
      { key: "courseTitle", label: "Course" },
      { key: "batchName", label: "Batch" },
      { key: "markLabel", label: "Status" },
    ]);
    toast("Attendance exported.", { type: "success" });
  });
}

async function requestFlow() {
  const t = today();
  const limitKB = (store.get("settings").system || {}).maxUploadKB || 2048;
  const limitLabel = limitKB >= 1024 ? Math.round((limitKB / 1024) * 10) / 10 + " MB" : limitKB + " KB";
  const data = await modal.form({
    title: "Request leave",
    submitLabel: "Submit request",
    fields: [
      { name: "from", label: "From", type: "date", required: true, min: t },
      { name: "to", label: "To", type: "date", required: true, min: t },
      { name: "type", label: "Leave type", type: "select", required: true, options: LEAVE_TYPES, span: 2 },
      { name: "reason", label: "Reason", type: "textarea", rows: 3, required: true, span: 2, placeholder: "Briefly explain why you need leave" },
      { name: "doc", label: "Supporting document (optional)", type: "file", accept: ".pdf,.jpg,.jpeg,.png", span: 2, help: `PDF, JPG or PNG up to ${limitLabel} — e.g. a medical certificate.` },
    ],
    values: { from: t, to: t, type: "sick" },
    validate: (v) => {
      const errors = {};
      if (!v.from) errors.from = "Choose a start date.";
      else if (v.from < t) errors.from = "Leave can't start in the past.";
      if (!v.to) errors.to = "Choose an end date.";
      else if (v.from && v.to < v.from) errors.to = "The end date must be on or after the start date.";
      else if (v.from && diffDays(v.to, v.from) > 30) errors.to = "A single request can cover at most 31 days.";
      if (!v.type) errors.type = "Choose a leave type.";
      if (v.reason.trim().length < 5) errors.reason = "Give a reason of at least 5 characters.";
      else if (v.reason.length > 500) errors.reason = "Keep the reason under 500 characters.";
      const f = v.doc;
      if (f) {
        if (!DOC_RE.test(f.name)) errors.doc = `"${f.name}" isn't a PDF, JPG or PNG file.`;
        else if (f.size > limitKB * 1024) errors.doc = `"${f.name}" is ${fileSize(f.size)} — the limit is ${limitLabel}.`;
        else if (f.size === 0) errors.doc = `"${f.name}" is empty.`;
      }
      return errors;
    },
  });
  if (!data) return;
  const res = await run(() => services.requestLeave(ctx.user, { from: data.from, to: data.to, type: data.type, reason: data.reason.trim(), fileList: data.doc ? [data.doc] : null }), {
    success: "Leave request sent to your instructor.",
    error: "Couldn't send the leave request",
  });
  if (res) {
    qs('[data-tab="leave"]', ctx.root).click();
  }
}

async function cancelFlow(id) {
  const rec = store.byId("leaveRequests", id);
  if (!rec || rec.studentId !== ctx.user.id) return toast("That leave request couldn't be found.", { type: "warning" });
  if (rec.status !== "pending") return toast("Only a pending request can be cancelled.", { type: "info" });
  const ok = await confirm({ title: "Cancel this leave request?", message: `${date(rec.from)}${rec.to !== rec.from ? " – " + date(rec.to) : ""} · ${LEAVE_LABEL[rec.type] || rec.type}`, confirmLabel: "Cancel request", cancelLabel: "Keep it", danger: true });
  if (!ok) return;
  await run(() => services.cancelLeave(ctx.user, id), { success: "Leave request cancelled.", error: "Couldn't cancel the request" });
}

async function downloadDoc(r) {
  if (!r.file) return toast("The attached document is no longer available.", { type: "warning" });
  try {
    await files.downloadFile(r.file);
  } catch (err) {
    console.error(err);
    toast(`Couldn't download "${r.file.name}": ${friendlyMessage(err)}`, { type: "danger", duration: 6000 });
  }
}

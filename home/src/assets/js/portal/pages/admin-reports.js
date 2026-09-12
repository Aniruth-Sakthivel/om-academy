/*
Author       : OM Academy
Description  : Staff → Reports. One tab per permission:
                 Attendance (date range + course/batch; per-batch and per-student %, below-minimum highlighted),
                 Performance (batch/exam; pass %, average, grade distribution, top performers),
                 Financial (date range; collections by month/method/course, defaulters, dues aging),
                 Enrolment (by course/center, new enrolments per month).
               Each report: KPIs, charts (updated in place), a table, Export CSV (reports.export) and Print.
               Teachers only see their assigned batches.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import { html, raw, on, qs, toast, dataTable, badge, statCard, emptyState, tabs, setSearchParam, getSearchParam, avatar, downloadCsv, printDoc, serialize } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, moneyShort, date, dateTime, monthYear, pct, num, plural } from "../core/format.js";
import { today, addDays, addMonths, startOfMonth, monthKey, diffDays, nowISO } from "../core/clock.js";
import { areaChart, barChart, donutChart, palette } from "../core/charts.js";
import { paymentMethodLabel, PAYMENT_METHODS } from "../core/docs.js";

const TABS = [
  { id: "attendance", label: "Attendance", icon: "CalendarCheck", perm: ["reports.attendance"] },
  { id: "performance", label: "Performance", icon: "GraduationCap", perm: ["reports.performance"] },
  { id: "financial", label: "Financial", icon: "IndianRupee", perm: ["reports.financial"] },
  { id: "enrolment", label: "Enrolment", icon: "Users", perm: ["reports.attendance", "reports.performance", "reports.financial"] },
];

let ctx;
let visible = [];
let activeTab = null;
const tables = {};
const live = new Map();
const filters = {
  attendance: { from: addDays(today(), -30), to: today(), courseId: "", batchId: "" },
  performance: { batchId: "", examId: "" },
  financial: { from: startOfMonth(addMonths(today(), -5)), to: today() },
  enrolment: { centerId: "", courseId: "" },
};

boot({
  id: "admin-reports",
  portal: "admin",
  perm: ["reports.attendance", "reports.performance", "reports.financial"],
  watch: ["attendanceSessions", "batches", "enrollments", "users", "exams", "marks", "payments", "invoices", "courses", "centers", "settings"],
  mount(c) {
    ctx = c;
    visible = TABS.filter((t) => t.perm.some((p) => ctx.can(p)));
    renderLayout();
    wire();
    refresh();
  },
  update: () => refresh(),
  unmount() {
    Object.values(tables).forEach((t) => t.destroy());
    destroyCharts();
  },
});

/* ---------- helpers ---------- */

const userById = (id) => store.byId("users", id);
const settings = () => store.get("settings");
const minPct = () => (settings().attendance || {}).minPct ?? 75;
const isAssigned = () => sel.roleOf(ctx.user)?.scope === "assigned";
const scopeBatches = () => (isAssigned() ? sel.batchesVisibleTo(ctx.user) : store.get("batches"));
const inScope = (batchId) => !isAssigned() || scopeBatches().some((b) => b.id === batchId);
const round1 = (n) => Math.round(n * 10) / 10;
const canExport = () => ctx.can("reports.export");

function destroyCharts() {
  live.forEach((entry) => entry.p.then((c) => c?.destroy()).catch(() => {}));
  live.clear();
}

// Create once, then update in place (updateOptions/updateSeries) on later repaints.
function upsertChart(key, el, spec) {
  if (!el) return;
  const cur = live.get(key);
  if (cur && cur.el === el && !cur.empty && !spec.empty && el.isConnected) {
    cur.p.then((c) => {
      if (!c) return;
      if (spec.labels) c.updateOptions({ labels: spec.labels }, false, false);
      else if (spec.categories) c.updateOptions({ xaxis: { categories: spec.categories } }, false, false);
      c.updateSeries(spec.series, false);
    }).catch(() => {});
    return;
  }
  if (cur) cur.p.then((c) => c?.destroy()).catch(() => {});
  if (spec.empty) {
    el.innerHTML = emptyState({ icon: "ChartColumn", title: "No data for these filters", text: "Widen the date range or clear a filter." });
    live.set(key, { p: Promise.resolve(null), el, empty: true });
    return;
  }
  el.innerHTML = "";
  live.set(key, { p: spec.create(el, spec).catch((err) => (console.error(err), null)), el, empty: false });
}

function monthsBetween(from, to) {
  const out = [];
  for (let m = monthKey(from); m <= monthKey(to); m = monthKey(addMonths(m + "-01", 1))) out.push(m);
  return out;
}

/* ---------- filter controls ---------- */

const fSelect = (name, label, options, value, placeholder) => html`
  <label class="rep-filter"><span class="form-label">${label}</span>
    <select class="form-control form-control-sm" name="${name}">
      ${placeholder ? html`<option value="">${placeholder}</option>` : raw("")}
      ${raw(options.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(value) ? "selected" : "")}>${l}</option>`).join(""))}
    </select>
  </label>`;

const fDate = (name, label, value) => html`
  <label class="rep-filter"><span class="form-label">${label}</span><input type="date" class="form-control form-control-sm" name="${name}" value="${value}" max="${today()}"></label>`;

function filterBar(tab) {
  const f = filters[tab];
  const batches = scopeBatches();
  const courseIds = new Set(batches.map((b) => b.courseId));
  const courses = store.where("courses", (c) => courseIds.has(c.id) || !isAssigned());
  let fields = "";
  if (tab === "attendance") {
    fields = [fDate("from", "From", f.from), fDate("to", "To", f.to), fSelect("courseId", "Course", courses.map((c) => [c.id, c.code]), f.courseId, "All courses"), fSelect("batchId", "Batch", batches.filter((b) => !f.courseId || b.courseId === f.courseId).map((b) => [b.id, b.code]), f.batchId, "All batches")].join("");
  } else if (tab === "performance") {
    fields = [fSelect("batchId", "Batch", batches.map((b) => [b.id, b.code]), f.batchId, "All batches"), fSelect("examId", "Exam", examsInScope().filter((e) => !f.batchId || e.batchId === f.batchId).map((e) => [e.id, `${store.byId("batches", e.batchId)?.code || ""} · ${e.cycle || e.title}`]), f.examId, "All exams")].join("");
  } else if (tab === "financial") {
    fields = [fDate("from", "From", f.from), fDate("to", "To", f.to)].join("");
  } else {
    fields = [fSelect("centerId", "Center", store.get("centers").map((c) => [c.id, c.name]), f.centerId, "All centers"), fSelect("courseId", "Course", courses.map((c) => [c.id, c.code]), f.courseId, "All courses")].join("");
  }
  return html`
    <form class="rep-filters" data-filter-form="${tab}" novalidate>${raw(fields)}
      <button type="button" class="btn btn-ghost btn-sm" data-reset="${tab}">${raw(icon("RotateCcw", { size: 14 }))}Reset</button>
    </form>
    <div class="cluster">
      ${canExport() ? html`<button type="button" class="btn btn-outline btn-sm" data-export="${tab}">${raw(icon("FileSpreadsheet", { size: 15 }))}Export CSV</button>` : raw("")}
      <button type="button" class="btn btn-outline btn-sm" data-print="${tab}">${raw(icon("Printer", { size: 15 }))}Print</button>
    </div>`;
}

const DEFAULTS = {
  attendance: () => ({ from: addDays(today(), -30), to: today(), courseId: "", batchId: "" }),
  performance: () => ({ batchId: "", examId: "" }),
  financial: () => ({ from: startOfMonth(addMonths(today(), -5)), to: today() }),
  enrolment: () => ({ centerId: "", courseId: "" }),
};

/* ---------- layout ---------- */

const chartCard = (key, title, subtitle) => html`
  <div class="card"><div class="card-header"><div><h3 class="card-title">${title}</h3><p class="card-subtitle">${subtitle}</p></div></div><div class="card-body"><div class="chart-box" data-chart="${key}"></div></div></div>`;

const tableCard = (title, subtitle, attr, extra = "") => html`
  <div class="card page-section"><div class="card-header"><div><h3 class="card-title">${title}</h3><p class="card-subtitle">${subtitle}</p></div>${raw(extra)}</div><div ${raw(attr)}></div></div>`;

function panelHtml(tab) {
  const head = html`<div class="card page-section"><div class="card-body rep-filterbar" data-filterbar="${tab}"></div></div><div class="grid grid-kpi page-section" data-kpis="${tab}"></div>`;
  if (tab === "attendance") {
    return html`${head}
      <div class="grid grid-main-side page-section">${raw(chartCard("att-batch", "Attendance by batch", "Present + late as a share of countable classes"))}
        <div class="card"><div class="card-header"><div><h3 class="card-title">Batch summary</h3><p class="card-subtitle" data-min-note></p></div></div><div class="table-scroll" data-att-batches></div></div>
      </div>
      ${raw(tableCard("Students", "Per student and batch — rows below the minimum are highlighted", "data-table-att"))}`;
  }
  if (tab === "performance") {
    return html`${head}
      <div class="grid grid-3 page-section">
        ${raw(chartCard("perf-grades", "Grade distribution", "Using the grading scale in Settings"))}
        ${raw(chartCard("perf-exams", "Average by exam", "Mean percentage per exam"))}
        <div class="card"><div class="card-header"><div><h3 class="card-title">Top performers</h3><p class="card-subtitle">Highest average in the selection</p></div></div><div data-top></div></div>
      </div>
      ${raw(tableCard("Results", "Every mark in the selection", "data-table-perf"))}`;
  }
  if (tab === "financial") {
    return html`${head}
      <div class="grid grid-main-side page-section">${raw(chartCard("fin-month", "Collections by month", "Successful payments in the range"))}${raw(chartCard("fin-method", "By payment method", "Share of the amount collected"))}</div>
      <div class="grid grid-main-side page-section">
        <div class="card"><div class="card-header"><div><h3 class="card-title">By course</h3><p class="card-subtitle">Billed in the range, collected in the range, outstanding today</p></div></div><div class="table-scroll" data-fin-course></div></div>
        ${raw(chartCard("fin-aging", "Dues aging", "Overdue balance by days past due"))}
      </div>
      ${raw(tableCard("Outstanding & defaulters", "Students with overdue balances today", "data-table-fin"))}`;
  }
  return html`${head}
    <div class="grid grid-3 page-section">${raw(chartCard("enr-course", "Active enrolments by course", "Students currently enrolled"))}${raw(chartCard("enr-center", "By center", "Active enrolments per center"))}${raw(chartCard("enr-month", "New enrolments", "Per month, last 12 months"))}</div>
    <div class="card page-section"><div class="card-header"><div><h3 class="card-title">Enrolment by course</h3><p class="card-subtitle">Active, completed, transferred and dropped</p></div></div><div class="table-scroll" data-enr-course></div></div>`;
}

function renderLayout() {
  const requested = getSearchParam("tab");
  activeTab = visible.some((t) => t.id === requested) ? requested : visible[0]?.id;
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Reports</li></ol>
        <h1 class="page-title">Reports</h1>
        <p class="page-subtitle">${isAssigned() ? "Attendance and results for your assigned batches." : "Attendance, results, collections and enrolment across all centers."}</p>
      </div>
    </div>
    <div class="card page-section">
      <div class="tabs" data-tab-list role="tablist">
        ${raw(visible.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.id}">${raw(icon(t.icon, { size: 15 }))}${t.label}</button>`).join(""))}
      </div>
    </div>
    ${raw(visible.map((t) => html`<section data-tab-panel="${t.id}" hidden>${raw(panelHtml(t.id))}</section>`).join(""))}`;

  tabs(ctx.root, {
    active: activeTab,
    onChange: (id) => {
      activeTab = id;
      setSearchParam("tab", id);
      paintCharts(id);
    },
  });

  visible.forEach((t) => (qs(`[data-filterbar="${t.id}"]`, ctx.root).innerHTML = filterBar(t.id)));

  if (qs("[data-table-att]", ctx.root)) {
    tables.attendance = dataTable(qs("[data-table-att]", ctx.root), {
      rows: [],
      searchKeys: ["name", "rollNo", "batchCode"],
      filters: [{ key: "status", label: "Status", options: [["below", "Below minimum"], ["ok", "At or above"]] }],
      getRowClass: (r) => (r.status === "below" ? "rep-row-warn" : ""),
      columns: [
        { key: "name", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.name, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.rollNo}</span></div></div>` },
        { key: "batchCode", label: "Batch", sortable: true, hideBelow: "md" },
        { key: "P", label: "Present", sortable: true, align: "right", hideBelow: "md" },
        { key: "A", label: "Absent", sortable: true, align: "right" },
        { key: "L", label: "Late", sortable: true, align: "right", hideBelow: "md" },
        { key: "E", label: "Excused", sortable: true, align: "right", hideBelow: "md" },
        { key: "pct", label: "Attendance", sortable: true, align: "right", render: (r) => html`<span class="badge tone-${raw(r.status === "below" ? "rust" : r.pct >= 90 ? "green" : "blue")}">${pct(r.pct, 1)}</span>` },
      ],
      empty: emptyState({ icon: "CalendarCheck", title: "No attendance in this range", text: "Change the dates or batch filter." }),
    });
  }
  if (qs("[data-table-perf]", ctx.root)) {
    tables.performance = dataTable(qs("[data-table-perf]", ctx.root), {
      rows: [],
      searchKeys: ["name", "rollNo", "examTitle"],
      filters: [{ key: "result", label: "Result", options: [["pass", "Pass"], ["fail", "Fail"], ["absent", "Absent"]] }],
      columns: [
        { key: "name", label: "Student", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.rollNo}</span></div>` },
        { key: "examTitle", label: "Exam", sortable: true, hideBelow: "md", render: (r) => html`${r.examTitle}<div class="cell-sub">${r.batchCode} · ${date(r.examDate)}</div>` },
        { key: "marks", label: "Marks", sortable: true, align: "right", render: (r) => (r.absent ? "AB" : `${r.marks} / ${r.maxMarks}`) },
        { key: "pct", label: "%", sortable: true, align: "right", render: (r) => (r.absent ? "—" : pct(r.pct, 1)) },
        { key: "grade", label: "Grade", sortable: true },
        { key: "result", label: "Result", render: (r) => badge(r.result === "pass" ? "approved" : r.result === "absent" ? "excused" : "failed", r.result === "pass" ? "Pass" : r.result === "absent" ? "Absent" : "Fail") },
      ],
      empty: emptyState({ icon: "GraduationCap", title: "No results", text: "Results appear once marks are entered for an exam." }),
    });
  }
  if (qs("[data-table-fin]", ctx.root)) {
    tables.financial = dataTable(qs("[data-table-fin]", ctx.root), {
      rows: [],
      searchKeys: ["name", "rollNo", "phone"],
      filters: [{ key: "bucket", label: "Age", options: [["0-15", "0–15 days"], ["16-30", "16–30 days"], ["31-60", "31–60 days"], ["60+", "60+ days"]] }],
      columns: [
        { key: "name", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.name, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.rollNo} · ${r.phone}</span></div></div>` },
        { key: "count", label: "Invoices", sortable: true, align: "right", hideBelow: "md" },
        { key: "oldestDue", label: "Oldest due", sortable: true, hideBelow: "md", render: (r) => html`${date(r.oldestDue)}<div class="cell-sub text-danger">${plural(r.days, "day")} overdue</div>` },
        { key: "overdue", label: "Overdue", sortable: true, align: "right", render: (r) => html`<span class="money fw-600 text-danger">${money(r.overdue)}</span>` },
        { key: "balance", label: "Total balance", sortable: true, align: "right", hideBelow: "sm", render: (r) => html`<span class="money">${money(r.balance)}</span>` },
      ],
      onRowClick: ctx.can("fees.view") ? (r) => (window.location.href = "admin-fees.html?id=" + r.oldestInvoiceId) : null,
      empty: emptyState({ icon: "BadgeCheck", title: "No defaulters", text: "No student has an overdue balance." }),
    });
  }
}

/* ---------- data: attendance ---------- */

function attendanceData() {
  const f = filters.attendance;
  const min = minPct();
  const batches = scopeBatches().filter((b) => (!f.courseId || b.courseId === f.courseId) && (!f.batchId || b.id === f.batchId));
  const perBatch = [];
  const rows = new Map();
  let sessionsTotal = 0;
  let P = 0;
  let C = 0;
  for (const b of batches) {
    const sessions = sel.sessionsForBatch(b.id, { from: f.from, to: f.to });
    sessionsTotal += sessions.length;
    let bp = 0;
    let bc = 0;
    for (const s of sessions) {
      for (const [sid, m] of Object.entries(s.records || {})) {
        const key = sid + "__" + b.id;
        if (!rows.has(key)) {
          const u = userById(sid);
          rows.set(key, { id: key, studentId: sid, name: u?.name || "Unknown", rollNo: u?.rollNo || "", batchCode: b.code, batchName: b.name, P: 0, A: 0, L: 0, E: 0 });
        }
        const r = rows.get(key);
        r[m] = (r[m] || 0) + 1;
        if (m !== "E") {
          bc++;
          if (m === "P" || m === "L") bp++;
        }
      }
    }
    P += bp;
    C += bc;
    perBatch.push({ id: b.id, code: b.code, name: b.name, sessions: sessions.length, pct: bc ? round1((bp / bc) * 100) : null });
  }
  const students = [...rows.values()].map((r) => {
    const countable = r.P + r.A + r.L;
    const p = countable ? round1(((r.P + r.L) / countable) * 100) : 100;
    return { ...r, pct: p, status: p < min ? "below" : "ok" };
  });
  perBatch.forEach((b) => (b.below = students.filter((s) => s.batchCode === b.code && s.status === "below").length));
  students.sort((a, b) => a.pct - b.pct);
  return { perBatch, students, sessionsTotal, overall: C ? round1((P / C) * 100) : null, min };
}

/* ---------- data: performance ---------- */

function examsInScope() {
  const withMarks = new Set(store.get("marks").map((m) => m.examId));
  return store.where("exams", (e) => inScope(e.batchId) && (e.status === "published" || withMarks.has(e.id))).sort((a, b) => b.date.localeCompare(a.date));
}

function performanceData() {
  const f = filters.performance;
  const exams = examsInScope().filter((e) => (!f.batchId || e.batchId === f.batchId) && (!f.examId || e.id === f.examId));
  const examMap = new Map(exams.map((e) => [e.id, e]));
  const rows = store
    .where("marks", (m) => examMap.has(m.examId))
    .map((m) => {
      const e = examMap.get(m.examId);
      const u = userById(m.studentId);
      const p = m.absent || m.marks == null ? null : round1((m.marks / e.maxMarks) * 100);
      const pass = !m.absent && m.marks != null && m.marks >= (e.passMarks ?? 0);
      return { id: m.id, studentId: m.studentId, name: u?.name || "Unknown", rollNo: u?.rollNo || "", examId: e.id, examTitle: e.title, examDate: e.date, batchCode: store.byId("batches", e.batchId)?.code || "", marks: m.marks, maxMarks: e.maxMarks, absent: !!m.absent, pct: p ?? -1, grade: p == null ? "—" : sel.gradeFor(p).grade, result: m.absent ? "absent" : pass ? "pass" : "fail" };
    });
  const sat = rows.filter((r) => !r.absent);
  const avg = sat.length ? round1(sat.reduce((t, r) => t + r.pct, 0) / sat.length) : null;
  const passPct = sat.length ? round1((sat.filter((r) => r.result === "pass").length / sat.length) * 100) : null;
  const scale = (settings().grading || {}).scale || [];
  const grades = scale.map((g) => ({ grade: g.grade, count: sat.filter((r) => r.grade === g.grade).length }));
  const byExam = exams
    .map((e) => {
      const list = sat.filter((r) => r.examId === e.id);
      return { label: `${store.byId("batches", e.batchId)?.code || ""} ${e.cycle || ""}`.trim(), avg: list.length ? round1(list.reduce((t, r) => t + r.pct, 0) / list.length) : 0, n: list.length };
    })
    .filter((x) => x.n)
    .slice(0, 8);
  const byStudent = new Map();
  sat.forEach((r) => {
    const s = byStudent.get(r.studentId) || { name: r.name, rollNo: r.rollNo, batch: r.batchCode, total: 0, n: 0 };
    s.total += r.pct;
    s.n++;
    byStudent.set(r.studentId, s);
  });
  const top = [...byStudent.values()].map((s) => ({ ...s, avg: round1(s.total / s.n) })).sort((a, b) => b.avg - a.avg).slice(0, 5);
  return { rows, exams, avg, passPct, grades, byExam, top, absent: rows.length - sat.length };
}

/* ---------- data: financial ---------- */

function financialData() {
  const f = filters.financial;
  const pays = store.where("payments", (p) => p.status === "success" && p.paidAt.slice(0, 10) >= f.from && p.paidAt.slice(0, 10) <= f.to);
  const collected = pays.reduce((t, p) => t + p.amount, 0);
  const months = monthsBetween(f.from, f.to);
  const byMonth = months.map((m) => pays.filter((p) => p.paidAt.slice(0, 7) === m).reduce((t, p) => t + p.amount, 0));
  const methods = Object.keys(PAYMENT_METHODS)
    .map((k) => ({ key: k, amount: pays.filter((p) => p.method === k).reduce((t, p) => t + p.amount, 0) }))
    .filter((m) => m.amount);

  const liveInvoices = store.where("invoices", (i) => i.status !== "cancelled" && i.status !== "draft");
  const courseOfInv = (inv) => store.byId("enrollments", inv.enrollmentId)?.courseId || "_other";
  const byCourse = new Map();
  const ensure = (id) => {
    if (!byCourse.has(id)) byCourse.set(id, { id, name: id === "_other" ? "Other charges" : store.byId("courses", id)?.title || "Course", billed: 0, collected: 0, outstanding: 0 });
    return byCourse.get(id);
  };
  let outstanding = 0;
  for (const inv of liveInvoices) {
    const c = ensure(courseOfInv(inv));
    const issued = String(inv.issuedAt).slice(0, 10);
    if (issued >= f.from && issued <= f.to) c.billed += inv.total;
    const bal = Math.max(0, inv.total - sel.paidAmount(inv.id));
    c.outstanding += bal;
    outstanding += bal;
  }
  const invById = new Map(liveInvoices.map((i) => [i.id, i]));
  pays.forEach((p) => {
    const inv = invById.get(p.invoiceId);
    if (inv) ensure(courseOfInv(inv)).collected += p.amount;
  });

  const defaulters = new Map();
  const overdueList = sel.overdueInvoices();
  for (const inv of overdueList) {
    const bal = Math.max(0, inv.total - sel.paidAmount(inv.id));
    if (!bal) continue;
    const d = defaulters.get(inv.studentId) || { id: inv.studentId, count: 0, overdue: 0, oldestDue: inv.dueDate, oldestInvoiceId: inv.id };
    d.count++;
    d.overdue += bal;
    if (inv.dueDate < d.oldestDue) {
      d.oldestDue = inv.dueDate;
      d.oldestInvoiceId = inv.id;
    }
    defaulters.set(inv.studentId, d);
  }
  const defRows = [...defaulters.values()]
    .map((d) => {
      const u = userById(d.id);
      const days = diffDays(today(), d.oldestDue);
      return { ...d, name: u?.name || "Unknown", rollNo: u?.rollNo || "", phone: u?.phone || "", days, bucket: days <= 15 ? "0-15" : days <= 30 ? "16-30" : days <= 60 ? "31-60" : "60+", balance: sel.feeSummary(d.id).balance };
    })
    .sort((a, b) => b.overdue - a.overdue);
  const overdueAmt = defRows.reduce((t, r) => t + r.overdue, 0);
  return { pays, collected, months, byMonth, methods, byCourse: [...byCourse.values()].sort((a, b) => b.collected - a.collected), outstanding, overdueAmt, defRows, aging: sel.duesAging() };
}

/* ---------- data: enrolment ---------- */

function enrolmentData() {
  const f = filters.enrolment;
  const batches = new Map(scopeBatches().filter((b) => (!f.centerId || b.centerId === f.centerId) && (!f.courseId || b.courseId === f.courseId)).map((b) => [b.id, b]));
  const list = store.where("enrollments", (e) => batches.has(e.batchId));
  const active = list.filter((e) => e.status === "active");
  const byCourse = new Map();
  for (const e of list) {
    const c = byCourse.get(e.courseId) || { id: e.courseId, code: store.byId("courses", e.courseId)?.code || "—", name: store.byId("courses", e.courseId)?.title || "Course", active: 0, completed: 0, transferred: 0, dropped: 0 };
    if (c[e.status] != null) c[e.status]++;
    byCourse.set(e.courseId, c);
  }
  const byCenter = new Map();
  active.forEach((e) => {
    const cid = batches.get(e.batchId)?.centerId;
    byCenter.set(cid, (byCenter.get(cid) || 0) + 1);
  });
  const months = monthsBetween(addMonths(startOfMonth(today()), -11), today());
  const perMonth = months.map((m) => list.filter((e) => String(e.enrolledAt).slice(0, 7) === m).length);
  const thisMonth = perMonth[perMonth.length - 1] || 0;
  return {
    list,
    active,
    byCourse: [...byCourse.values()].sort((a, b) => b.active - a.active),
    byCenter: [...byCenter.entries()].map(([id, n]) => ({ name: store.byId("centers", id)?.name || "—", n })),
    months,
    perMonth,
    thisMonth,
    completed: list.filter((e) => e.status === "completed").length,
    dropped: list.filter((e) => e.status === "dropped").length,
  };
}

/* ---------- painting ---------- */

const cache = {};

function refresh() {
  visible.forEach((t) => paint(t.id));
}

function paint(tab) {
  const kpiEl = qs(`[data-kpis="${tab}"]`, ctx.root);
  if (!kpiEl) return;
  if (tab === "attendance") {
    const d = (cache.attendance = attendanceData());
    const below = d.students.filter((s) => s.status === "below").length;
    kpiEl.innerHTML = [
      statCard({ icon: "CalendarCheck", label: "Overall attendance", value: d.overall == null ? "—" : pct(d.overall, 1), tone: d.overall != null && d.overall < d.min ? "rust" : "green" }),
      statCard({ icon: "Clock", label: "Classes held", value: num(d.sessionsTotal), tone: "blue" }),
      statCard({ icon: "Users", label: "Students tracked", value: num(new Set(d.students.map((s) => s.studentId)).size), tone: "purple" }),
      statCard({ icon: "TriangleAlert", label: `Below ${d.min}%`, value: num(below), tone: below ? "amber" : "slate" }),
    ].join("");
    qs("[data-min-note]", ctx.root).textContent = `${date(filters.attendance.from)} – ${date(filters.attendance.to)} · minimum ${d.min}%`;
    qs("[data-att-batches]", ctx.root).innerHTML = d.perBatch.length
      ? html`<table class="simple-table"><thead><tr><th>Batch</th><th class="text-right">Classes</th><th class="text-right">Attendance</th><th class="text-right">Below</th></tr></thead><tbody>${raw(
          d.perBatch.map((b) => html`<tr><td><span class="fw-600 text-title">${b.code}</span><div class="text-xs text-muted">${b.name}</div></td><td class="text-right">${b.sessions}</td><td class="text-right">${b.pct == null ? "—" : raw(html`<span class="${raw(b.pct < d.min ? "text-danger fw-600" : "")}">${pct(b.pct, 1)}</span>`)}</td><td class="text-right">${b.below}</td></tr>`).join("")
        )}</tbody></table>`
      : emptyState({ icon: "Layers", title: "No batches", text: isAssigned() ? "You have no assigned batches." : "No batch matches the filters." });
    tables.attendance?.update(d.students);
  } else if (tab === "performance") {
    const d = (cache.performance = performanceData());
    kpiEl.innerHTML = [
      statCard({ icon: "ClipboardList", label: `Results · ${plural(d.exams.length, "exam")}`, value: num(d.rows.length), tone: "blue" }),
      statCard({ icon: "Target", label: "Average score", value: d.avg == null ? "—" : pct(d.avg, 1), tone: "purple" }),
      statCard({ icon: "BadgeCheck", label: "Pass rate", value: d.passPct == null ? "—" : pct(d.passPct, 1), tone: d.passPct != null && d.passPct < 60 ? "amber" : "green" }),
      statCard({ icon: "UserX", label: "Absent", value: num(d.absent), tone: d.absent ? "rust" : "slate" }),
    ].join("");
    qs("[data-top]", ctx.root).innerHTML = d.top.length
      ? html`<ul class="list-plain">${raw(d.top.map((s, i) => html`<li class="list-row"><span class="icon-tile icon-tile-sm tone-${raw(i === 0 ? "amber" : "blue")}">${i === 0 ? raw(icon("Award", { size: 16 })) : String(i + 1)}</span><div class="list-row-main"><div class="list-row-title">${s.name}</div><div class="list-row-sub">${s.rollNo} · ${s.batch} · ${plural(s.n, "exam")}</div></div><span class="fw-700 text-title">${pct(s.avg, 1)}</span></li>`).join(""))}</ul>`
      : emptyState({ icon: "Award", title: "No results yet" });
    const examSel = qs('[data-filter-form="performance"] [name="examId"]', ctx.root);
    if (examSel) {
      const f = filters.performance;
      const opts = examsInScope().filter((e) => !f.batchId || e.batchId === f.batchId);
      examSel.innerHTML = html`<option value="">All exams</option>${raw(opts.map((e) => html`<option value="${e.id}" ${raw(e.id === f.examId ? "selected" : "")}>${store.byId("batches", e.batchId)?.code || ""} · ${e.cycle || e.title}</option>`).join(""))}`;
    }
    tables.performance?.update(d.rows);
  } else if (tab === "financial") {
    const d = (cache.financial = financialData());
    kpiEl.innerHTML = [
      statCard({ icon: "IndianRupee", label: `Collected · ${plural(d.pays.length, "payment")}`, value: money(d.collected), tone: "green" }),
      statCard({ icon: "Wallet", label: "Outstanding today", value: money(d.outstanding), tone: "amber" }),
      statCard({ icon: "TriangleAlert", label: `Overdue · ${plural(d.defRows.length, "student")}`, value: money(d.overdueAmt), tone: d.overdueAmt ? "rust" : "slate" }),
      statCard({ icon: "Receipt", label: "Average payment", value: money(d.pays.length ? d.collected / d.pays.length : 0), tone: "blue" }),
    ].join("");
    qs("[data-fin-course]", ctx.root).innerHTML = d.byCourse.length
      ? html`<table class="simple-table"><thead><tr><th>Course</th><th class="text-right">Billed</th><th class="text-right">Collected</th><th class="text-right">Outstanding</th></tr></thead><tbody>${raw(d.byCourse.map((c) => html`<tr><td>${c.name}</td><td class="text-right money">${money(c.billed)}</td><td class="text-right money">${money(c.collected)}</td><td class="text-right money ${raw(c.outstanding ? "text-danger" : "")}">${money(c.outstanding)}</td></tr>`).join(""))}</tbody></table>`
      : emptyState({ icon: "Receipt", title: "No invoices yet" });
    tables.financial?.update(d.defRows);
  } else {
    const d = (cache.enrolment = enrolmentData());
    kpiEl.innerHTML = [
      statCard({ icon: "Users", label: "Active enrolments", value: num(d.active.length), tone: "blue" }),
      statCard({ icon: "UserPlus", label: "New this month", value: num(d.thisMonth), tone: "green" }),
      statCard({ icon: "Award", label: "Completed", value: num(d.completed), tone: "purple" }),
      statCard({ icon: "UserX", label: "Dropped", value: num(d.dropped), tone: d.dropped ? "rust" : "slate" }),
    ].join("");
    qs("[data-enr-course]", ctx.root).innerHTML = d.byCourse.length
      ? html`<table class="simple-table"><thead><tr><th>Course</th><th class="text-right">Active</th><th class="text-right">Completed</th><th class="text-right">Transferred</th><th class="text-right">Dropped</th></tr></thead><tbody>${raw(d.byCourse.map((c) => html`<tr><td><span class="fw-600 text-title">${c.code}</span><div class="text-xs text-muted">${c.name}</div></td><td class="text-right">${c.active}</td><td class="text-right">${c.completed}</td><td class="text-right">${c.transferred}</td><td class="text-right">${c.dropped}</td></tr>`).join(""))}</tbody></table>`
      : emptyState({ icon: "Users", title: "No enrolments", text: "No enrolment matches the filters." });
  }
  if (tab === activeTab) paintCharts(tab);
}

function paintCharts(tab) {
  const d = cache[tab];
  if (!d) return;
  const p = palette();
  const el = (k) => qs(`[data-chart="${k}"]`, ctx.root);
  if (tab === "attendance") {
    const rows = d.perBatch.filter((b) => b.pct != null);
    upsertChart("att-batch", el("att-batch"), { empty: !rows.length, series: [{ name: "Attendance %", data: rows.map((b) => b.pct) }], categories: rows.map((b) => b.code), create: (e, s) => barChart(e, { series: s.series, categories: s.categories, colors: [p.primary], yFormatter: (v) => Math.round(v) + "%", height: 280 }) });
  } else if (tab === "performance") {
    upsertChart("perf-grades", el("perf-grades"), { empty: !d.grades.some((g) => g.count), series: [{ name: "Students", data: d.grades.map((g) => g.count) }], categories: d.grades.map((g) => g.grade), create: (e, s) => barChart(e, { series: s.series, categories: s.categories, colors: [p.accent], height: 260 }) });
    upsertChart("perf-exams", el("perf-exams"), { empty: !d.byExam.length, series: [{ name: "Average %", data: d.byExam.map((x) => x.avg) }], categories: d.byExam.map((x) => x.label), create: (e, s) => barChart(e, { series: s.series, categories: s.categories, horizontal: true, colors: [p.primary], yFormatter: (v) => (typeof v === "number" ? Math.round(v) + "%" : v), height: 260 }) });
  } else if (tab === "financial") {
    upsertChart("fin-month", el("fin-month"), { empty: !d.byMonth.some(Boolean), series: [{ name: "Collected", data: d.byMonth }], categories: d.months.map((m) => monthYear(m + "-01")), create: (e, s) => areaChart(e, { series: s.series, categories: s.categories, yFormatter: moneyShort, tooltipFormatter: money, height: 260 }) });
    upsertChart("fin-method", el("fin-method"), { empty: !d.methods.length, series: d.methods.map((m) => m.amount), labels: d.methods.map((m) => paymentMethodLabel(m.key)), create: (e, s) => donutChart(e, { series: s.series, labels: s.labels, height: 260 }) });
    upsertChart("fin-aging", el("fin-aging"), { empty: !Object.values(d.aging).some(Boolean), series: [{ name: "Overdue", data: Object.values(d.aging) }], categories: ["0–15 days", "16–30 days", "31–60 days", "60+ days"], create: (e, s) => barChart(e, { series: s.series, categories: s.categories, colors: [p.gold], yFormatter: moneyShort, height: 240 }) });
  } else {
    upsertChart("enr-course", el("enr-course"), { empty: !d.byCourse.some((c) => c.active), series: [{ name: "Active", data: d.byCourse.map((c) => c.active) }], categories: d.byCourse.map((c) => c.code), create: (e, s) => barChart(e, { series: s.series, categories: s.categories, colors: [p.primary], height: 260 }) });
    upsertChart("enr-center", el("enr-center"), { empty: !d.byCenter.length, series: d.byCenter.map((c) => c.n), labels: d.byCenter.map((c) => c.name), create: (e, s) => donutChart(e, { series: s.series, labels: s.labels, centerLabel: "Students", height: 260 }) });
    upsertChart("enr-month", el("enr-month"), { empty: !d.perMonth.some(Boolean), series: [{ name: "New enrolments", data: d.perMonth }], categories: d.months.map((m) => monthYear(m + "-01")), create: (e, s) => barChart(e, { series: s.series, categories: s.categories, colors: [p.accent], height: 260 }) });
  }
}

/* ---------- export & print ---------- */

const rangeText = (f) => `${date(f.from)} – ${date(f.to)}`;

function exportCsv(tab) {
  if (!canExport()) return toast("You don't have permission to export reports.", { type: "warning" });
  const d = cache[tab];
  const stamp = today();
  if (tab === "attendance") {
    if (!d.students.length) return toast("There is nothing to export for these filters.", { type: "info" });
    downloadCsv(`om-academy-attendance-${stamp}.csv`, d.students, [
      { key: "name", label: "Student" }, { key: "rollNo", label: "Roll no." }, { key: "batchCode", label: "Batch" },
      { key: "P", label: "Present" }, { key: "A", label: "Absent" }, { key: "L", label: "Late" }, { key: "E", label: "Excused" },
      { key: "pct", label: "Attendance %" }, { label: "Below minimum", value: (r) => (r.status === "below" ? "Yes" : "No") },
    ]);
    return toast(`Exported ${plural(d.students.length, "row")}.`, { type: "success" });
  }
  if (tab === "performance") {
    if (!d.rows.length) return toast("There is nothing to export for these filters.", { type: "info" });
    downloadCsv(`om-academy-results-${stamp}.csv`, d.rows, [
      { key: "name", label: "Student" }, { key: "rollNo", label: "Roll no." }, { key: "examTitle", label: "Exam" }, { key: "batchCode", label: "Batch" },
      { label: "Date", value: (r) => date(r.examDate) }, { label: "Marks", value: (r) => (r.absent ? "AB" : r.marks) }, { key: "maxMarks", label: "Max" },
      { label: "%", value: (r) => (r.absent ? "" : r.pct) }, { key: "grade", label: "Grade" }, { key: "result", label: "Result" },
    ]);
    return toast(`Exported ${plural(d.rows.length, "result")}.`, { type: "success" });
  }
  if (tab === "financial") {
    if (!d.pays.length && !d.defRows.length) return toast("There is nothing to export for this range.", { type: "info" });
    const rows = [
      ...d.pays.map((p) => ({ type: "Payment", date: p.paidAt.slice(0, 10), ref: p.receiptNo, name: userById(p.studentId)?.name || "", detail: paymentMethodLabel(p.method), amount: p.amount })),
      ...d.defRows.map((r) => ({ type: "Overdue balance", date: r.oldestDue, ref: r.rollNo, name: r.name, detail: `${r.count} invoice(s), ${r.days} days`, amount: r.overdue })),
    ];
    downloadCsv(`om-academy-financial-${stamp}.csv`, rows, [{ key: "type", label: "Type" }, { key: "date", label: "Date" }, { key: "ref", label: "Reference" }, { key: "name", label: "Student" }, { key: "detail", label: "Detail" }, { key: "amount", label: "Amount (INR)" }]);
    return toast(`Exported ${plural(rows.length, "row")}.`, { type: "success" });
  }
  if (!d.byCourse.length) return toast("There is nothing to export for these filters.", { type: "info" });
  downloadCsv(`om-academy-enrolment-${stamp}.csv`, d.byCourse, [{ key: "code", label: "Code" }, { key: "name", label: "Course" }, { key: "active", label: "Active" }, { key: "completed", label: "Completed" }, { key: "transferred", label: "Transferred" }, { key: "dropped", label: "Dropped" }]);
  toast(`Exported ${plural(d.byCourse.length, "course")}.`, { type: "success" });
}

function printSheet(title, subtitle, summary, sections) {
  const inst = settings().institution || { name: "OM Academy" };
  return html`
    <div class="print-sheet">
      <div class="print-head">
        <div class="print-brand"><span class="print-mark">OM</span><div><div class="print-org">${inst.name}</div>${inst.address ? html`<div class="print-org-sub">${inst.address}</div>` : raw("")}</div></div>
        <div class="print-doc"><div class="print-doc-title">${title}</div><div class="print-meta">${subtitle}</div><div class="print-meta">Generated ${dateTime(nowISO())} by ${ctx.user.name}</div></div>
      </div>
      <table class="print-table"><tbody>${raw(summary.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`).join(""))}</tbody></table>
      ${raw(
        sections
          .map(
            (s) => html`<div class="print-label">${s.heading}</div>
          <table class="print-table"><thead><tr>${raw(s.cols.map((c) => html`<th class="${raw(c.num ? "num" : "")}">${c.label}</th>`).join(""))}</tr></thead>
          <tbody>${raw(s.rows.length ? s.rows.map((r) => html`<tr>${raw(r.map((v, i) => html`<td class="${raw(s.cols[i].num ? "num" : "")}">${v}</td>`).join(""))}</tr>`).join("") : html`<tr><td colspan="${s.cols.length}">No records.</td></tr>`)}</tbody></table>`
          )
          .join("")
      )}
      <div class="print-foot">Computer-generated report from the OM Academy portal (demo data).</div>
    </div>`;
}

function printReport(tab) {
  const d = cache[tab];
  if (!d) return;
  if (tab === "attendance") {
    const f = filters.attendance;
    return printDoc("Attendance report", printSheet("Attendance report", rangeText(f), [["Overall attendance", d.overall == null ? "—" : pct(d.overall, 1)], ["Classes held", d.sessionsTotal], ["Minimum required", d.min + "%"], ["Below minimum", d.students.filter((s) => s.status === "below").length]], [
      { heading: "By batch", cols: [{ label: "Batch" }, { label: "Classes", num: true }, { label: "Attendance", num: true }, { label: "Below min.", num: true }], rows: d.perBatch.map((b) => [`${b.code} — ${b.name}`, b.sessions, b.pct == null ? "—" : pct(b.pct, 1), b.below]) },
      { heading: "By student", cols: [{ label: "Student" }, { label: "Batch" }, { label: "P", num: true }, { label: "A", num: true }, { label: "L", num: true }, { label: "E", num: true }, { label: "%", num: true }], rows: d.students.map((s) => [`${s.name} (${s.rollNo})${s.status === "below" ? " (below minimum)" : ""}`, s.batchCode, s.P, s.A, s.L, s.E, pct(s.pct, 1)]) },
    ]));
  }
  if (tab === "performance") {
    return printDoc("Performance report", printSheet("Performance report", d.exams.length === 1 ? d.exams[0].title : plural(d.exams.length, "exam"), [["Results", d.rows.length], ["Average", d.avg == null ? "—" : pct(d.avg, 1)], ["Pass rate", d.passPct == null ? "—" : pct(d.passPct, 1)], ["Absent", d.absent]], [
      { heading: "Grade distribution", cols: [{ label: "Grade" }, { label: "Students", num: true }], rows: d.grades.map((g) => [g.grade, g.count]) },
      { heading: "Top performers", cols: [{ label: "Student" }, { label: "Batch" }, { label: "Average", num: true }], rows: d.top.map((s) => [s.name, s.batch, pct(s.avg, 1)]) },
      { heading: "Results", cols: [{ label: "Student" }, { label: "Exam" }, { label: "Marks", num: true }, { label: "Grade" }, { label: "Result" }], rows: d.rows.map((r) => [r.name, r.examTitle, r.absent ? "AB" : `${r.marks}/${r.maxMarks}`, r.grade, r.result]) },
    ]));
  }
  if (tab === "financial") {
    const f = filters.financial;
    return printDoc("Financial report", printSheet("Financial report", rangeText(f), [["Collected", money(d.collected)], ["Payments", d.pays.length], ["Outstanding today", money(d.outstanding)], ["Overdue", money(d.overdueAmt)]], [
      { heading: "Collections by month", cols: [{ label: "Month" }, { label: "Collected", num: true }], rows: d.months.map((m, i) => [monthYear(m + "-01"), money(d.byMonth[i])]) },
      { heading: "By payment method", cols: [{ label: "Method" }, { label: "Amount", num: true }], rows: d.methods.map((m) => [paymentMethodLabel(m.key), money(m.amount)]) },
      { heading: "By course", cols: [{ label: "Course" }, { label: "Billed", num: true }, { label: "Collected", num: true }, { label: "Outstanding", num: true }], rows: d.byCourse.map((c) => [c.name, money(c.billed), money(c.collected), money(c.outstanding)]) },
      { heading: "Defaulters", cols: [{ label: "Student" }, { label: "Oldest due" }, { label: "Days", num: true }, { label: "Overdue", num: true }], rows: d.defRows.map((r) => [`${r.name} (${r.rollNo})`, date(r.oldestDue), r.days, money(r.overdue)]) },
    ]));
  }
  printDoc("Enrolment report", printSheet("Enrolment report", filters.enrolment.centerId ? store.byId("centers", filters.enrolment.centerId)?.name || "" : "All centers", [["Active enrolments", d.active.length], ["New this month", d.thisMonth], ["Completed", d.completed], ["Dropped", d.dropped]], [
    { heading: "By course", cols: [{ label: "Course" }, { label: "Active", num: true }, { label: "Completed", num: true }, { label: "Transferred", num: true }, { label: "Dropped", num: true }], rows: d.byCourse.map((c) => [`${c.code} — ${c.name}`, c.active, c.completed, c.transferred, c.dropped]) },
    { heading: "By center", cols: [{ label: "Center" }, { label: "Active", num: true }], rows: d.byCenter.map((c) => [c.name, c.n]) },
    { heading: "New enrolments per month", cols: [{ label: "Month" }, { label: "Enrolments", num: true }], rows: d.months.map((m, i) => [monthYear(m + "-01"), d.perMonth[i]]) },
  ]));
}

/* ---------- wiring ---------- */

function wire() {
  on(ctx.root, "change", "[data-filter-form]", (e, form) => {
    const tab = form.dataset.filterForm;
    const next = { ...filters[tab], ...serialize(form) };
    if (next.from && next.to && next.from > next.to) {
      toast("The start date must be on or before the end date.", { type: "warning" });
      form.elements.namedItem(e.target.name).value = filters[tab][e.target.name];
      return;
    }
    if ((tab === "attendance" || tab === "performance") && e.target.name === (tab === "attendance" ? "courseId" : "batchId")) {
      if (tab === "attendance") next.batchId = "";
      else next.examId = "";
    }
    filters[tab] = next;
    if (tab === "attendance" && e.target.name === "courseId") qs(`[data-filterbar="attendance"]`, ctx.root).innerHTML = filterBar("attendance");
    paint(tab);
  });
  on(ctx.root, "click", "[data-reset]", (e, btn) => {
    const tab = btn.dataset.reset;
    filters[tab] = DEFAULTS[tab]();
    qs(`[data-filterbar="${tab}"]`, ctx.root).innerHTML = filterBar(tab);
    paint(tab);
  });
  on(ctx.root, "click", "[data-export]", (e, btn) => exportCsv(btn.dataset.export));
  on(ctx.root, "click", "[data-print]", (e, btn) => printReport(btn.dataset.print));
}

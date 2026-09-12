/*
Author       : OM Academy
Description  : Staff → Academics. Attendance marking, leave review, assignments + grading, exams + marks entry +
               results publishing, and transcripts. Teachers (scope "assigned") only ever see their own batches.
               Every mutation goes through services via errors.run(); the one missing service (delete exam) is
               implemented locally with a permission check and an activity entry.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, drawer, dataTable, badge, statCard, emptyState, tabs, printDoc, setSearchParam, getSearchParam, confirm, avatar } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateTime, dueIn, time, timeRange, pct, plural, relative, weekdayLong, titleCase, fileSize } from "../core/format.js";
import { transcriptDoc } from "../core/docs.js";
import { today, diffDays, weekday, dateOf, nowISO } from "../core/clock.js";
import { downloadFile } from "../core/files.js";
import { run } from "../core/errors.js";

const TAB_DEFS = [
  { id: "attendance", label: "Attendance", icon: "CalendarCheck", perms: ["attendance.view", "attendance.mark"] },
  { id: "leave", label: "Leave requests", icon: "CalendarX", perms: ["leave.review"] },
  { id: "assignments", label: "Assignments", icon: "ClipboardList", perms: ["assignments.manage", "assignments.grade"] },
  { id: "exams", label: "Exams & marks", icon: "GraduationCap", perms: ["exams.manage", "marks.enter", "results.publish"] },
  { id: "transcripts", label: "Transcripts", icon: "FileBadge", perms: ["transcripts.issue"] },
];

const MARKS = [
  ["P", "Present"],
  ["A", "Absent"],
  ["L", "Late"],
  ["E", "Excused"],
];
const MARK_LABEL = Object.fromEntries(MARKS);
const EXAM_STATUS = { scheduled: "Scheduled", "marks-entry": "Marks entry", published: "Published" };
const CYCLES = ["Unit Test", "Mid-Term", "Term Final", "Practical Exam", "Upcoming Assessment", "Re-appear"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let ctx;
let allowedTabs = [];
let attTable, leaveTable, asgTable, examTable, trTable;
const att = { batchId: "", date: "", slotId: "", marks: {}, dirty: false, key: "" };
const tr = { query: "", studentId: "" };

boot({
  id: "admin-academics",
  portal: "admin",
  perm: ["attendance.view", "attendance.mark", "leave.review", "assignments.manage", "assignments.grade", "exams.manage", "marks.enter", "results.publish", "transcripts.issue"],
  watch: ["attendanceSessions", "leaveRequests", "assignments", "submissions", "exams", "marks", "transcripts", "enrollments", "batches", "timetableSlots", "users", "settings", "events", "roles"],
  mount(c) {
    ctx = c;
    allowedTabs = TAB_DEFS.filter((t) => t.perms.some((p) => ctx.can(p)));
    renderLayout();
    wire();
    refresh();
    openDeepLink();
  },
  update: () => refresh(),
  unmount() {
    [attTable, leaveTable, asgTable, examTable, trTable].forEach((t) => t?.destroy());
  },
});

/* ---------- scope & data helpers ---------- */

const userById = (id) => store.byId("users", id);
const byName = (a, b) => (a?.name || "").localeCompare(b?.name || "");
const isAssigned = () => sel.roleOf(ctx.user)?.scope === "assigned";
const scopeBatches = () => sel.batchesVisibleTo(ctx.user).slice().sort(byName);
const scopeIds = () => new Set(scopeBatches().map((b) => b.id));
const batchName = (id) => store.byId("batches", id)?.name || "—";
const has = (tabId) => allowedTabs.some((t) => t.id === tabId);
const quant = (n) => Math.max(0, Math.min(100, Math.round((Number(n) || 0) / 5) * 5));
const progress = (value, tone = "green") => html`<div class="progress progress-sm tone-${raw(tone)}"><span class="progress-bar pct-${raw(quant(value))}"></span></div>`;
const dueLabel = (dueAt) => `${date(dateOf(dueAt))}, ${time(String(dueAt).slice(11, 16) || "23:59")}`;
const settings = () => store.get("settings") || {};
const editWindow = () => Number((settings().attendance || {}).editWindowDays ?? 3);

function rosterOf(batchId) {
  return store
    .where("enrollments", (e) => e.batchId === batchId && e.status === "active")
    .map((e) => userById(e.studentId))
    .filter(Boolean)
    .sort(byName);
}

function scopedStudents() {
  if (!isAssigned()) return store.where("users", (u) => u.role === "student").sort(byName);
  const ids = scopeIds();
  const set = new Set(store.where("enrollments", (e) => ids.has(e.batchId) && e.status === "active").map((e) => e.studentId));
  return [...set].map(userById).filter(Boolean).sort(byName);
}

function approvedLeaveOn(studentId, day) {
  return store.get("leaveRequests").find((l) => l.studentId === studentId && l.status === "approved" && l.from <= day && day <= l.to);
}

function holidayOn(day) {
  return store.get("events").find((e) => e.type === "holiday" && dateOf(e.start) <= day && day <= dateOf(e.end || e.start));
}

function slotsFor(batchId, day) {
  if (!batchId || !day) return [];
  const slots = store.where("timetableSlots", (s) => s.batchId === batchId && s.weekday === weekday(day));
  // Keep a session whose slot was later removed from the timetable reachable.
  store
    .where("attendanceSessions", (s) => s.batchId === batchId && s.date === day && !slots.some((x) => x.id === s.slotId))
    .forEach((s) => slots.push({ id: s.slotId, batchId, weekday: weekday(day), start: "", end: "", room: "", removed: true }));
  return slots.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
}

function sessionStats(records, roster) {
  const c = { P: 0, A: 0, L: 0, E: 0, unmarked: 0 };
  const ids = roster ? roster.map((s) => s.id) : Object.keys(records || {});
  ids.forEach((id) => {
    const m = records?.[id];
    if (m && c[m] != null) c[m]++;
    else c.unmarked++;
  });
  const countable = c.P + c.A + c.L;
  return { ...c, pct: countable ? ((c.P + c.L) / countable) * 100 : null };
}

function examRoster(exam) {
  const roster = rosterOf(exam.batchId);
  store.where("marks", (m) => m.examId === exam.id && !roster.some((s) => s.id === m.studentId)).forEach((m) => {
    const u = userById(m.studentId);
    if (u) roster.push(u);
  });
  return roster;
}

function passMarkOf(exam) {
  if (exam.passMarks != null) return Number(exam.passMarks);
  return Math.ceil(((settings().grading || {}).passPct ?? 35) * exam.maxMarks / 100);
}

function examStats(exam) {
  const roster = examRoster(exam);
  const marks = store.where("marks", (m) => m.examId === exam.id);
  const sat = marks.filter((m) => !m.absent && m.marks != null);
  const pass = passMarkOf(exam);
  const passed = sat.filter((m) => m.marks >= pass).length;
  const avg = sat.length ? sat.reduce((t, m) => t + m.marks, 0) / sat.length : null;
  const top = [...sat].sort((a, b) => b.marks - a.marks).slice(0, 3).map((m) => ({ ...m, name: userById(m.studentId)?.name || "—" }));
  const grades = {};
  sat.forEach((m) => {
    const g = sel.gradeFor((m.marks / exam.maxMarks) * 100).grade;
    grades[g] = (grades[g] || 0) + 1;
  });
  return {
    roster: roster.length,
    entered: marks.length,
    missing: roster.filter((s) => !marks.some((m) => m.studentId === s.id)).length,
    absent: marks.filter((m) => m.absent).length,
    sat: sat.length,
    passed,
    passPct: sat.length ? (passed / sat.length) * 100 : null,
    avg,
    high: sat.length ? Math.max(...sat.map((m) => m.marks)) : null,
    low: sat.length ? Math.min(...sat.map((m) => m.marks)) : null,
    top,
    grades,
  };
}

/* ---------- rows ---------- */

function leaveRows() {
  const ids = scopeIds();
  const assigned = isAssigned();
  return store
    .get("leaveRequests")
    .filter((l) => !assigned || sel.activeBatchesOf(l.studentId).some((b) => ids.has(b.id)))
    .map((l) => {
      const st = userById(l.studentId);
      return { ...l, studentName: st?.name || "—", rollNo: st?.rollNo || "", days: diffDays(l.to, l.from) + 1, batches: sel.activeBatchesOf(l.studentId).map((b) => b.code || b.name).join(", ") };
    })
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.from.localeCompare(a.from));
}

function assignmentRows() {
  const ids = scopeIds();
  return store
    .where("assignments", (a) => ids.has(a.batchId))
    .map((a) => {
      const b = store.byId("batches", a.batchId);
      const subs = store.where("submissions", (s) => s.assignmentId === a.id);
      const rosterSize = store.count("enrollments", (e) => e.batchId === a.batchId && e.status === "active");
      return { ...a, batchName: b?.name || "—", batchCode: b?.code || "", dueDate: dateOf(a.dueAt), rosterSize, subCount: subs.length, gradedCount: subs.filter((s) => s.status === "graded").length, toGrade: subs.filter((s) => s.status === "submitted").length };
    })
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt));
}

function examRows() {
  const ids = scopeIds();
  return store
    .where("exams", (e) => ids.has(e.batchId))
    .map((e) => {
      const b = store.byId("batches", e.batchId);
      return { ...e, batchName: b?.name || "—", batchCode: b?.code || "", rosterSize: store.count("enrollments", (x) => x.batchId === e.batchId && x.status === "active"), entered: store.count("marks", (m) => m.examId === e.id) };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
}

function sessionRows() {
  const ids = scopeIds();
  return store
    .where("attendanceSessions", (s) => ids.has(s.batchId))
    .map((s) => {
      const b = store.byId("batches", s.batchId);
      const slot = store.byId("timetableSlots", s.slotId);
      const st = sessionStats(s.records);
      return { ...s, batchName: b?.name || "—", batchCode: b?.code || "", slotTime: slot ? timeRange(slot.start, slot.end) : "—", sortKey: s.date + (slot?.start || ""), stats: st, pctVal: st.pct ?? 0, markedByName: userById(s.markedBy)?.name || "—" };
    })
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function transcriptRows() {
  const students = new Set(scopedStudents().map((s) => s.id));
  return store
    .where("transcripts", (t) => students.has(t.studentId))
    .map((t) => ({ ...t, studentName: t.snapshot?.studentName || userById(t.studentId)?.name || "—", rollNo: t.snapshot?.rollNo || "", gpa: t.snapshot?.gpa, resultCount: (t.snapshot?.results || []).length, issuer: userById(t.issuedBy)?.name || "Staff" }))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

function kpis() {
  const ids = scopeIds();
  const day = today();
  let present = 0, countable = 0;
  const todays = store.where("attendanceSessions", (s) => s.date === day && ids.has(s.batchId));
  todays.forEach((s) => Object.values(s.records || {}).forEach((m) => {
    if (m === "E") return;
    countable++;
    if (m === "P" || m === "L") present++;
  }));
  return {
    attPct: countable ? (present / countable) * 100 : null,
    sessionsToday: todays.length,
    pendingLeave: leaveRows().filter((l) => l.status === "pending").length,
    toGrade: sel.ungradedSubmissionsCount([...ids]),
    upcoming: store.count("exams", (e) => ids.has(e.batchId) && e.date >= day && e.status === "scheduled"),
  };
}

/* ---------- layout ---------- */

function renderLayout() {
  const requested = getSearchParam("tab");
  const active = allowedTabs.some((t) => t.id === requested) ? requested : allowedTabs[0]?.id;
  const scoped = isAssigned();
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Academics</li></ol>
        <h1 class="page-title">Academics</h1>
        <p class="page-subtitle">${scoped ? "Attendance, leave, assignments and exams for the batches you teach." : "Attendance, leave, assignments, exams and transcripts across all batches."}</p>
      </div>
      <div class="page-actions">
        ${ctx.can("assignments.manage") ? html`<button type="button" class="btn btn-outline" data-act="new-assignment">${raw(icon("Plus", { size: 16 }))}New assignment</button>` : raw("")}
        ${ctx.can("exams.manage") ? html`<button type="button" class="btn btn-primary" data-act="new-exam">${raw(icon("CalendarClock", { size: 16 }))}Schedule exam</button>` : raw("")}
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    ${scoped && !scopeBatches().length ? html`<div class="alert tone-amber page-section">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body"><div class="alert-title">No batches assigned</div>You aren't assigned to any batch yet, so there is nothing to show. Ask an administrator to add you as an instructor.</div></div>` : raw("")}
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${raw(allowedTabs.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.id}">${raw(icon(t.icon, { size: 15 }))}${t.label}${["leave", "assignments", "exams"].includes(t.id) ? html` <span class="tab-count" data-count="${t.id}"></span>` : raw("")}</button>`).join(""))}
      </div>
      ${has("attendance") ? html`<div data-tab-panel="attendance" hidden>${raw(attendancePanelHtml())}</div>` : raw("")}
      ${has("leave") ? html`<div data-tab-panel="leave" hidden><div data-leave-table></div></div>` : raw("")}
      ${has("assignments") ? html`<div data-tab-panel="assignments" hidden><div data-asg-table></div></div>` : raw("")}
      ${has("exams") ? html`<div data-tab-panel="exams" hidden><div data-exam-table></div></div>` : raw("")}
      ${has("transcripts") ? html`<div data-tab-panel="transcripts" hidden>
        <div class="card-body">
          <div class="tr-layout">
            <div class="tr-picker">
              <label class="form-label" for="tr-search">Find a student</label>
              <div class="search-field">${raw(icon("Search", { size: 15 }))}<input type="search" id="tr-search" class="form-control" placeholder="Name, roll no. or email" data-tr-search autocomplete="off"></div>
              <div class="tr-results" data-tr-results role="listbox" aria-label="Students"></div>
            </div>
            <div class="tr-preview" data-tr-preview></div>
          </div>
        </div>
        <div class="card-header card-header-plain"><div><h3 class="card-title">Issued transcripts</h3><p class="card-subtitle">Every transcript keeps a snapshot of the results on its issue date.</p></div></div>
        <div data-tr-table></div>
      </div>` : raw("")}
    </div>`;

  if (active) tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });
  if (has("attendance")) initAttendance();
  if (has("leave")) initLeaveTable();
  if (has("assignments")) initAssignmentTable();
  if (has("exams")) initExamTable();
  if (has("transcripts")) initTranscripts();
}

function refresh() {
  const k = kpis();
  const cards = [];
  if (has("attendance")) cards.push(statCard({ icon: "UserCheck", label: `Today's attendance · ${plural(k.sessionsToday, "session")}`, value: k.attPct == null ? "—" : pct(k.attPct, 1), tone: k.attPct != null && k.attPct < ((settings().attendance || {}).minPct ?? 75) ? "rust" : "green" }));
  if (has("leave")) cards.push(statCard({ icon: "CalendarX", label: "Pending leave requests", value: String(k.pendingLeave), tone: k.pendingLeave ? "amber" : "slate", href: "admin-academics.html?tab=leave" }));
  if (has("assignments")) cards.push(statCard({ icon: "NotebookPen", label: "Submissions to grade", value: String(k.toGrade), tone: k.toGrade ? "purple" : "slate", href: "admin-academics.html?tab=assignments" }));
  if (has("exams")) cards.push(statCard({ icon: "CalendarClock", label: "Upcoming exams", value: String(k.upcoming), tone: "blue", href: "admin-academics.html?tab=exams" }));
  qs("[data-kpis]", ctx.root).innerHTML = cards.join("");

  const setCount = (id, n) => {
    const el = qs(`[data-count="${id}"]`, ctx.root);
    if (el) {
      el.textContent = n || "";
      el.hidden = !n;
    }
  };
  setCount("leave", k.pendingLeave);
  setCount("assignments", k.toGrade);
  setCount("exams", k.upcoming);

  if (has("attendance")) refreshAttendance();
  leaveTable?.update(leaveRows());
  asgTable?.update(assignmentRows());
  examTable?.update(examRows());
  if (has("transcripts")) {
    trTable.update(transcriptRows());
    renderTrResults();
    renderTrPreview();
  }
}

function wire() {
  on(ctx.root, "click", '[data-act="new-assignment"]', () => assignmentFlow());
  on(ctx.root, "click", '[data-act="new-exam"]', () => examFlow());
}

function openDeepLink() {
  const id = ctx.params.get("id");
  if (!id) return;
  const tab = getSearchParam("tab");
  if ((tab === "leave" || !tab) && store.byId("leaveRequests", id) && has("leave")) return openLeave(id);
  if ((tab === "assignments" || !tab) && store.byId("assignments", id) && has("assignments")) return ctx.can("assignments.grade") ? openGrading(id) : assignmentFlow(id);
  if ((tab === "exams" || !tab) && store.byId("exams", id) && has("exams")) return openResults(id);
  if (store.byId("submissions", id) && has("assignments")) return openGrading(store.byId("submissions", id).assignmentId, id);
  toast("The linked record couldn't be found — it may have been removed.", { type: "warning" });
}

/* =========================================================================================
   ATTENDANCE
   ========================================================================================= */

function attendancePanelHtml() {
  const batches = scopeBatches().filter((b) => b.status !== "completed");
  if (!batches.length) return html`<div class="card-body">${raw(emptyState({ icon: "CalendarCheck", title: "No batches to mark", text: "Attendance appears here once you're assigned to an active batch." }))}</div>`;
  return html`
    <div class="card-body">
      <div class="att-controls">
        <div class="form-field">
          <label class="form-label" for="att-batch">Batch</label>
          <select id="att-batch" class="form-control" data-att-batch>${raw(batches.map((b) => html`<option value="${b.id}">${b.name}</option>`).join(""))}</select>
        </div>
        <div class="form-field">
          <label class="form-label" for="att-date">Date</label>
          <input type="date" id="att-date" class="form-control" data-att-date max="${today()}">
        </div>
        <div class="form-field">
          <label class="form-label" for="att-slot">Class</label>
          <select id="att-slot" class="form-control" data-att-slot></select>
        </div>
      </div>
      <div data-att-editor></div>
    </div>
    <div class="card-header card-header-plain"><div><h3 class="card-title">Recent sessions</h3><p class="card-subtitle">Select a session to open it in the register above.</p></div></div>
    <div data-att-history></div>`;
}

function initAttendance() {
  const batchSel = qs("[data-att-batch]", ctx.root);
  if (!batchSel) return;
  const day = today();
  const batches = [...batchSel.options].map((o) => o.value);
  att.date = day;
  att.batchId = batches.find((id) => slotsFor(id, day).length) || batches[0];
  batchSel.value = att.batchId;
  qs("[data-att-date]", ctx.root).value = day;

  const change = async (apply) => {
    if (att.dirty && !(await confirm({ title: "Discard unsaved marks?", message: "You have attendance marks that haven't been saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true }))) {
      batchSel.value = att.batchId;
      qs("[data-att-date]", ctx.root).value = att.date;
      qs("[data-att-slot]", ctx.root).value = att.slotId;
      return;
    }
    apply();
    att.dirty = false;
    renderAttEditor(true);
  };
  on(ctx.root, "change", "[data-att-batch]", (e, s) => change(() => ((att.batchId = s.value), (att.slotId = ""))));
  on(ctx.root, "change", "[data-att-date]", (e, input) => {
    if (!input.value) {
      input.value = att.date;
      return toast("Pick a date.", { type: "info" });
    }
    change(() => ((att.date = input.value), (att.slotId = "")));
  });
  on(ctx.root, "change", "[data-att-slot]", (e, s) => change(() => (att.slotId = s.value)));

  on(ctx.root, "click", "[data-att-mark]", (e, btn) => setMark(btn.closest("[data-att-row]").dataset.attRow, btn.dataset.attMark, btn));
  on(ctx.root, "keydown", ".att-seg", (e, group) => attKeydown(e, group));
  on(ctx.root, "click", '[data-att="all-present"]', () => markAllPresent());
  on(ctx.root, "click", '[data-att="reset"]', () => {
    att.dirty = false;
    renderAttEditor(true);
  });
  on(ctx.root, "click", '[data-att="save"]', () => saveAttendance());
  on(ctx.root, "click", '[data-att="today"]', () => change(() => ((att.date = today()), (att.slotId = ""))));

  attTable = dataTable(qs("[data-att-history]", ctx.root), {
    rows: [],
    can: ctx.can,
    pageSize: 10,
    searchKeys: ["batchName", "batchCode", "date", "markedByName"],
    filters: [{ key: "batchId", label: "Batch", options: scopeBatches().map((b) => [b.id, b.code || b.name]) }],
    columns: [
      { key: "date", label: "Date", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${date(r.date)}</span><span class="cell-sub">${weekdayLong(r.date)} · ${r.slotTime}</span></div>` },
      { key: "batchName", label: "Batch", sortable: true, hideBelow: "md", render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.batchCode}</span><span class="cell-sub">${r.batchName}</span></div>` },
      { key: "pctVal", label: "Present", sortable: true, render: (r) => html`<div class="att-pct"><span class="fw-600 tabular">${r.stats.pct == null ? "—" : pct(r.stats.pct, 0)}</span>${progress(r.pctVal, r.pctVal < 75 ? "rust" : "green")}</div>` },
      { key: "counts", label: "P / A / L / E", hideBelow: "sm", render: (r) => html`<span class="tabular">${r.stats.P} / ${r.stats.A} / ${r.stats.L} / ${r.stats.E}</span>` },
      { key: "markedByName", label: "Marked by", hideBelow: "md", render: (r) => html`${r.markedByName}<div class="cell-sub">${relative(r.markedAt)}</div>` },
    ],
    rowActions: [{ label: "Open in register", icon: "Eye", onClick: (r) => openSession(r) }],
    onRowClick: (r) => openSession(r),
    empty: emptyState({ icon: "CalendarCheck", title: "No sessions yet", text: "Marked sessions for your batches will be listed here." }),
  });
  renderAttEditor(true);
}

async function openSession(r) {
  if (att.dirty && !(await confirm({ title: "Discard unsaved marks?", message: "You have attendance marks that haven't been saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true }))) return;
  att.batchId = r.batchId;
  att.date = r.date;
  att.slotId = r.slotId;
  att.dirty = false;
  qs("[data-att-batch]", ctx.root).value = r.batchId;
  qs("[data-att-date]", ctx.root).value = r.date;
  renderAttEditor(true);
  qs("[data-att-editor]", ctx.root)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function refreshAttendance() {
  if (!qs("[data-att-batch]", ctx.root)) return;
  attTable?.update(sessionRows());
  if (!att.dirty) renderAttEditor(true);
}

function attLock() {
  if (!ctx.can("attendance.mark")) return "You can view attendance but your role can't mark it.";
  if (att.date > today()) return "Attendance can't be marked for a future date.";
  const age = diffDays(today(), att.date);
  const win = editWindow();
  if (age > win) return `This date is ${age} days ago. Attendance can only be marked or changed within ${plural(win, "day")} (Settings → Attendance → edit window), so this register is read-only.`;
  return null;
}

function loadMarks(roster, session) {
  if (session) return { ...session.records };
  const marks = {};
  roster.forEach((s) => {
    if (approvedLeaveOn(s.id, att.date)) marks[s.id] = "E";
  });
  return marks;
}

function renderAttEditor(reload) {
  const box = qs("[data-att-editor]", ctx.root);
  if (!box) return;
  const slotSel = qs("[data-att-slot]", ctx.root);
  const batch = store.byId("batches", att.batchId);
  if (!batch) {
    box.innerHTML = emptyState({ icon: "CalendarCheck", title: "Choose a batch", text: "Pick a batch and date to open its register." });
    return;
  }
  const slots = slotsFor(att.batchId, att.date);
  if (!slots.some((s) => s.id === att.slotId)) att.slotId = slots[0]?.id || "";
  slotSel.innerHTML = slots.length ? slots.map((s) => html`<option value="${s.id}">${s.removed ? "Removed slot" : timeRange(s.start, s.end)}${s.room ? " · " + s.room : ""}</option>`).join("") : html`<option value="">No class</option>`;
  slotSel.value = att.slotId;
  slotSel.disabled = slots.length < 2;

  const holiday = holidayOn(att.date);
  if (holiday) {
    box.innerHTML = html`<div class="alert tone-amber">${raw(icon("CalendarX", { size: 18 }))}<div class="alert-body"><div class="alert-title">${holiday.title}</div>${date(att.date)} is a holiday on the academic calendar, so no attendance is taken.</div></div>`;
    return;
  }
  if (!slots.length) {
    const days = [...new Set(store.where("timetableSlots", (s) => s.batchId === att.batchId).map((s) => s.weekday))].sort().map((d) => WEEKDAYS[d]);
    box.innerHTML = html`<div class="alert tone-blue">${raw(icon("Info", { size: 18 }))}<div class="alert-body"><div class="alert-title">No class on ${weekdayLong(att.date)}, ${date(att.date)}</div>${days.length ? `${batch.name} meets on ${days.join(", ")}. Pick one of those days.` : "This batch has no timetable slots yet. Add them from Courses → Batches."}</div>${att.date !== today() ? html`<div class="alert-actions"><button type="button" class="btn btn-outline btn-sm" data-att="today">Go to today</button></div>` : raw("")}</div>`;
    return;
  }

  const roster = rosterOf(att.batchId);
  if (!roster.length) {
    box.innerHTML = emptyState({ icon: "Users", title: "No students enrolled", text: "Students appear in the register once they're enrolled in this batch." });
    return;
  }
  const session = store.get("attendanceSessions").find((s) => s.batchId === att.batchId && s.slotId === att.slotId && s.date === att.date);
  const key = `${att.batchId}|${att.date}|${att.slotId}`;
  if (reload || key !== att.key) {
    att.marks = loadMarks(roster, session);
    att.key = key;
  }
  const lock = attLock();
  const slot = slots.find((s) => s.id === att.slotId);

  box.innerHTML = html`
    ${lock ? html`<div class="alert tone-slate section-gap">${raw(icon("Lock", { size: 18 }))}<div class="alert-body"><div class="alert-title">Read-only register</div>${lock}</div></div>` : raw("")}
    <div class="att-toolbar">
      <div class="att-meta">
        <div class="fw-600 text-title">${batch.name}</div>
        <div class="text-sm text-muted">${weekdayLong(att.date)}, ${date(att.date)}${slot?.start ? " · " + timeRange(slot.start, slot.end) : ""}${slot?.room ? " · " + slot.room : ""} · ${session ? html`Marked by ${userById(session.markedBy)?.name || "staff"} ${relative(session.markedAt)}` : "Not marked yet"}</div>
      </div>
      ${lock ? raw("") : html`<div class="cluster">
        <button type="button" class="btn btn-outline btn-sm" data-att="all-present">${raw(icon("CheckCheck", { size: 15 }))}Mark all present</button>
        <button type="button" class="btn btn-ghost btn-sm" data-att="reset" data-att-dirty-only hidden>${raw(icon("RotateCcw", { size: 15 }))}Undo changes</button>
        <button type="button" class="btn btn-primary btn-sm" data-att="save">${raw(icon("Save", { size: 15 }))}${session ? "Update attendance" : "Save attendance"}</button>
      </div>`}
    </div>
    <div class="att-summary cluster section-gap" data-att-summary aria-live="polite"></div>
    <ul class="att-roster" aria-label="Class register">
      ${raw(roster.map((s, i) => attRowHtml(s, i, !!lock)).join(""))}
    </ul>
    ${lock ? raw("") : html`<p class="text-xs text-muted att-hint">${raw(icon("Info", { size: 13 }))}Keyboard: Tab to a student, ←/→ to change, P / A / L / E to mark and move down, ↑/↓ to move between students.</p>`}`;
  updateAttSummary();
}

function attRowHtml(student, index, locked) {
  const mark = att.marks[student.id] || "";
  const leave = approvedLeaveOn(student.id, att.date);
  const focusMark = mark || "P";
  return html`
    <li class="att-row" data-att-row="${student.id}">
      <span class="att-index text-muted tabular">${index + 1}</span>
      <div class="cell-user att-student">${raw(avatar({ name: student.name, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${student.name}</span><span class="cell-sub">${student.rollNo || ""}</span></div>
        ${leave ? html`<span class="chip tone-purple att-leave">${raw(icon("CalendarX", { size: 12 }))}${titleCase(leave.type)} leave</span>` : raw("")}
      </div>
      <div class="att-seg" role="radiogroup" aria-label="Attendance for ${student.name}">
        ${raw(MARKS.map(([m, label]) => html`<button type="button" role="radio" data-att-mark="${m}" aria-checked="${String(mark === m)}" tabindex="${m === focusMark ? "0" : "-1"}" title="${label}" aria-label="${label}" ${raw(locked ? "disabled" : "")}>${m}</button>`).join(""))}
      </div>
    </li>`;
}

function setMark(studentId, mark, btn) {
  if (attLock()) return;
  att.marks[studentId] = mark;
  att.dirty = true;
  const row = qs(`[data-att-row="${studentId}"]`, ctx.root);
  if (!row) return;
  row.classList.remove("is-missing");
  qsa("[data-att-mark]", row).forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.attMark === mark));
    b.tabIndex = b.dataset.attMark === mark ? 0 : -1;
  });
  if (btn) btn.focus();
  updateAttSummary();
}

function attKeydown(e, group) {
  const row = group.closest("[data-att-row]");
  const buttons = qsa("[data-att-mark]", group);
  const idx = Math.max(0, buttons.indexOf(document.activeElement));
  const rows = qsa("[data-att-row]", ctx.root);
  const r = rows.indexOf(row);
  const focusRow = (target) => {
    if (!target) return;
    const btn = qs('[data-att-mark][tabindex="0"]', target) || qs("[data-att-mark]", target);
    btn?.focus();
  };
  const key = e.key.toUpperCase();
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const next = buttons[(idx + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
    setMark(row.dataset.attRow, next.dataset.attMark, next);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    focusRow(rows[r + (e.key === "ArrowDown" ? 1 : -1)]);
  } else if (MARK_LABEL[key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    setMark(row.dataset.attRow, key, null);
    if (rows[r + 1]) focusRow(rows[r + 1]);
    else qs('[data-att="save"]', ctx.root)?.focus();
  }
}

function markAllPresent() {
  if (attLock()) return;
  const roster = rosterOf(att.batchId);
  let n = 0;
  roster.forEach((s) => {
    if (!att.marks[s.id] || att.marks[s.id] === "A") {
      if (approvedLeaveOn(s.id, att.date)) att.marks[s.id] = "E";
      else att.marks[s.id] = "P";
      n++;
    }
  });
  att.dirty = true;
  renderAttEditor(false);
  toast(n ? `Marked ${plural(n, "student")} present. Students on approved leave stay Excused.` : "Everyone already has a mark.", { type: "info", duration: 2600 });
}

function updateAttSummary() {
  const box = qs("[data-att-summary]", ctx.root);
  if (!box) return;
  const roster = rosterOf(att.batchId);
  const s = sessionStats(att.marks, roster);
  box.innerHTML = html`
    <span class="chip tone-green">${raw(icon("CircleCheck", { size: 13 }))}Present ${s.P}</span>
    <span class="chip tone-rust">${raw(icon("CircleX", { size: 13 }))}Absent ${s.A}</span>
    <span class="chip tone-amber">${raw(icon("Clock", { size: 13 }))}Late ${s.L}</span>
    <span class="chip tone-purple">${raw(icon("CalendarX", { size: 13 }))}Excused ${s.E}</span>
    ${s.unmarked ? html`<span class="chip">${raw(icon("CircleAlert", { size: 13 }))}Unmarked ${s.unmarked}</span>` : raw("")}
    <span class="att-summary-pct fw-600 text-title">${s.pct == null ? "—" : pct(s.pct, 1)} present</span>`;
  const reset = qs("[data-att-dirty-only]", ctx.root);
  if (reset) reset.hidden = !att.dirty;
}

async function saveAttendance() {
  const lock = attLock();
  if (lock) return toast(lock, { type: "warning" });
  const roster = rosterOf(att.batchId);
  const missing = roster.filter((s) => !att.marks[s.id]);
  if (missing.length) {
    missing.forEach((s) => qs(`[data-att-row="${s.id}"]`, ctx.root)?.classList.add("is-missing"));
    qs(`[data-att-row="${missing[0].id}"] [data-att-mark]`, ctx.root)?.focus();
    return toast(`${plural(missing.length, "student is", "students are")} still unmarked. Mark them, or use "Mark all present".`, { type: "warning" });
  }
  const records = Object.fromEntries(roster.map((s) => [s.id, att.marks[s.id]]));
  const s = sessionStats(records, roster);
  const batch = store.byId("batches", att.batchId);
  const saved = await run(() => services.markAttendance(ctx.user, { batchId: att.batchId, slotId: att.slotId, date: att.date, records }), { success: `Attendance saved for ${batch?.code || batch?.name} — ${pct(s.pct ?? 0, 0)} present.`, error: "Couldn't save attendance" });
  if (saved) {
    att.dirty = false;
    renderAttEditor(true);
  }
}

/* =========================================================================================
   LEAVE
   ========================================================================================= */

function initLeaveTable() {
  leaveTable = dataTable(qs("[data-leave-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["studentName", "rollNo", "reason", "type", "batches"],
    filters: [{ key: "status", label: "Status", options: [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]] }],
    columns: [
      { key: "studentName", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.studentName, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.studentName}</span><span class="cell-sub">${r.rollNo}${r.batches ? " · " + r.batches : ""}</span></div></div>` },
      { key: "from", label: "Dates", sortable: true, render: (r) => html`${r.from === r.to ? date(r.from) : `${date(r.from)} – ${date(r.to)}`}<div class="cell-sub">${plural(r.days, "day")}</div>` },
      { key: "type", label: "Type", hideBelow: "md", render: (r) => html`${titleCase(r.type)}${r.fileId ? html` <span class="text-muted" title="Has attachment">${raw(icon("Paperclip", { size: 13 }))}</span>` : raw("")}` },
      { key: "createdAt", label: "Requested", sortable: true, hideBelow: "md", render: (r) => relative(r.createdAt) },
      { key: "status", label: "Status", render: (r) => badge(r.status, titleCase(r.status)) },
    ],
    rowActions: [
      { label: "Review", icon: "Eye", onClick: (r) => openLeave(r.id) },
      { label: "Approve", icon: "Check", perm: "leave.review", hidden: (r) => r.status !== "pending", onClick: (r) => decideLeave(r.id, "approved", "") },
    ],
    onRowClick: (r) => openLeave(r.id),
    getRowClass: (r) => (r.status === "pending" ? "is-highlight" : ""),
    empty: emptyState({ icon: "CalendarX", title: "No leave requests", text: "Requests students send from their Attendance page appear here, pending first." }),
  });
}

function affectedSessions(l) {
  const ids = sel.activeBatchesOf(l.studentId).map((b) => b.id);
  return store.count("attendanceSessions", (s) => ids.includes(s.batchId) && s.date >= l.from && s.date <= l.to);
}

function openLeave(id) {
  const l = store.byId("leaveRequests", id);
  if (!l) return toast("That leave request couldn't be found.", { type: "warning" });
  if (isAssigned() && !leaveRows().some((r) => r.id === id)) return toast("This request is for a student outside your batches.", { type: "warning" });
  const st = userById(l.studentId);
  const file = l.fileId ? store.byId("files", l.fileId) : null;
  const canDecide = l.status === "pending" && ctx.can("leave.review");
  const sessions = affectedSessions(l);
  const stats = sel.attendanceStats(l.studentId);
  const d = drawer.open({
    title: "Leave request",
    body: html`
      <div class="cell-user section-gap">${raw(avatar({ name: st?.name, size: "md" }))}<div class="cell-user-text"><span class="cell-title">${st?.name || "—"}</span><span class="cell-sub">${st?.rollNo || ""} · ${sel.activeBatchesOf(l.studentId).map((b) => b.name).join(", ") || "No active batch"}</span></div><span class="w-100"></span>${raw(badge(l.status, titleCase(l.status)))}</div>
      <dl class="kv-list drawer-section">
        <dt>Dates</dt><dd>${l.from === l.to ? date(l.from) : `${date(l.from)} – ${date(l.to)}`} <span class="text-muted text-sm">· ${plural(diffDays(l.to, l.from) + 1, "day")}</span></dd>
        <dt>Type</dt><dd>${titleCase(l.type)}</dd>
        <dt>Requested</dt><dd>${dateTime(l.createdAt)}</dd>
        <dt>Attendance</dt><dd>${pct(stats.pct, 1)} overall</dd>
        ${l.reviewedAt ? html`<dt>Reviewed</dt><dd>${titleCase(l.status)} by ${userById(l.reviewedBy)?.name || "staff"} · ${dateTime(l.reviewedAt)}</dd>` : raw("")}
        ${l.reviewNote ? html`<dt>Note</dt><dd>${l.reviewNote}</dd>` : raw("")}
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Reason</h4>
        <p class="submission-text m-0">${l.reason || "No reason given."}</p>
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Attachment</h4>
        ${file ? html`<div class="file-tile"><span class="icon-tile icon-tile-sm tone-blue">${raw(icon("Paperclip", { size: 16 }))}</span><div class="file-tile-main"><div class="file-tile-name">${file.name}</div><div class="file-tile-meta">${fileSize(file.size)}</div></div><button type="button" class="btn btn-outline btn-sm" data-d="download">${raw(icon("Download", { size: 14 }))}Download</button></div>` : html`<p class="text-muted m-0">No document attached.</p>`}
      </div>
      ${canDecide ? html`<div class="drawer-section">
        ${sessions ? html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Approving marks ${plural(sessions, "recorded session")} in these dates as <strong>Excused</strong>. Sessions marked later are pre-filled as Excused.</div></div>` : raw("")}
        <div class="form-field">
          <label class="form-label" for="leave-note">Note to the student</label>
          <textarea id="leave-note" class="form-control" rows="3" placeholder="Required when rejecting" data-leave-note></textarea>
          <p class="field-error" data-leave-error hidden></p>
        </div>
      </div>` : raw("")}`,
    footer: canDecide
      ? html`<button type="button" class="btn btn-outline" data-d="reject">${raw(icon("X", { size: 16 }))}Reject</button><button type="button" class="btn btn-success" data-d="approve">${raw(icon("Check", { size: 16 }))}Approve</button>`
      : html`<button type="button" class="btn btn-outline" data-d="close">Close</button>`,
  });
  d.root.querySelector('[data-d="close"]')?.addEventListener("click", d.close);
  d.root.querySelector('[data-d="download"]')?.addEventListener("click", () => run(() => downloadFile(file.id), { error: "Couldn't download the attachment" }));
  const note = () => d.root.querySelector("[data-leave-note]");
  const err = d.root.querySelector("[data-leave-error]");
  d.root.querySelector('[data-d="approve"]')?.addEventListener("click", async () => {
    if (await decideLeave(id, "approved", note().value.trim())) d.close();
  });
  d.root.querySelector('[data-d="reject"]')?.addEventListener("click", async () => {
    const text = note().value.trim();
    if (!text) {
      err.hidden = false;
      err.textContent = "Tell the student why the request is rejected.";
      note().classList.add("has-error");
      note().focus();
      return;
    }
    const ok = await confirm({ title: "Reject this leave request?", message: `${st?.name || "The student"} will be notified with your note.`, confirmLabel: "Reject request", danger: true });
    if (ok && (await decideLeave(id, "rejected", text))) d.close();
  });
}

async function decideLeave(id, decision, note) {
  const l = store.byId("leaveRequests", id);
  if (!l || l.status !== "pending") {
    toast("This request has already been reviewed.", { type: "info" });
    return null;
  }
  const name = userById(l.studentId)?.name || "the student";
  return run(() => services.reviewLeave(ctx.user, id, decision, note), { success: decision === "approved" ? `Leave approved for ${name}.` : `Leave rejected — ${name} has been notified.`, error: "Couldn't update the leave request" });
}

/* =========================================================================================
   ASSIGNMENTS & GRADING
   ========================================================================================= */

function initAssignmentTable() {
  asgTable = dataTable(qs("[data-asg-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["title", "batchName", "batchCode"],
    filters: [
      { key: "batchId", label: "Batch", options: scopeBatches().map((b) => [b.id, b.code || b.name]) },
      { key: "status", label: "Status", options: [["published", "Published"], ["draft", "Draft"]] },
    ],
    columns: [
      { key: "title", label: "Assignment", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${r.batchCode} · ${r.maxMarks} marks${r.allowLate ? " · late allowed" : ""}</span></div>` },
      { key: "dueAt", label: "Due", sortable: true, render: (r) => html`${dueLabel(r.dueAt)}<div class="cell-sub ${raw(r.dueDate < today() ? "" : "text-success")}">${r.dueDate < today() ? "Closed" : dueIn(r.dueDate)}</div>` },
      { key: "subCount", label: "Submitted", sortable: true, hideBelow: "md", render: (r) => html`<div class="att-pct"><span class="tabular">${r.subCount} / ${r.rosterSize}</span>${progress(r.rosterSize ? (r.subCount / r.rosterSize) * 100 : 0, "blue")}</div>` },
      { key: "toGrade", label: "Grading", sortable: true, render: (r) => (r.subCount ? (r.toGrade ? html`<span class="badge tone-amber">${r.toGrade} to grade</span>` : html`<span class="badge tone-green">All ${r.gradedCount} graded</span>`) : html`<span class="text-muted">—</span>`) },
      { key: "status", label: "Status", render: (r) => badge(r.status, titleCase(r.status)) },
    ],
    rowActions: [
      { label: "Grade submissions", icon: "NotebookPen", perm: "assignments.grade", onClick: (r) => openGrading(r.id) },
      { label: "Edit", icon: "Pencil", perm: "assignments.manage", onClick: (r) => assignmentFlow(r.id) },
      { label: "Publish", icon: "Send", perm: "assignments.manage", hidden: (r) => r.status !== "draft", onClick: (r) => publishAssignment(r.id) },
      { label: "Delete", icon: "Trash2", perm: "assignments.manage", danger: true, onClick: (r) => deleteAssignment(r.id) },
    ],
    onRowClick: (r) => (ctx.can("assignments.grade") ? openGrading(r.id) : assignmentFlow(r.id)),
    empty: emptyState({ icon: "ClipboardList", title: "No assignments", text: ctx.can("assignments.manage") ? "Create one with “New assignment”. Drafts stay hidden from students until published." : "Assignments for your batches will appear here." }),
  });
}

async function assignmentFlow(id) {
  if (!ctx.can("assignments.manage")) return toast("You don't have permission to create or edit assignments.", { type: "warning" });
  const existing = id ? store.byId("assignments", id) : null;
  if (id && !existing) return toast("That assignment no longer exists.", { type: "warning" });
  const batches = scopeBatches().filter((b) => b.status === "active" || b.id === existing?.batchId);
  if (!batches.length) return toast("You need an active batch before creating assignments.", { type: "info" });
  const subs = existing ? store.where("submissions", (s) => s.assignmentId === id) : [];
  const topMark = Math.max(0, ...subs.filter((s) => s.marks != null).map((s) => s.marks));
  const data = await modal.form({
    title: existing ? "Edit assignment" : "New assignment",
    submitLabel: existing ? "Save changes" : "Create assignment",
    size: "lg",
    fields: [
      { name: "title", label: "Title", required: true, placeholder: "e.g. Spreadsheet formulas practice", span: 2 },
      { name: "batchId", label: "Batch", type: "select", required: true, placeholder: "Select a batch", options: batches.map((b) => [b.id, b.name]), span: 2 },
      { name: "description", label: "Instructions", type: "textarea", rows: 4, required: true, placeholder: "What should students do and submit?", span: 2 },
      { name: "dueDate", label: "Due date", type: "date", required: true },
      { name: "dueTime", label: "Due time", type: "time", required: true },
      { name: "maxMarks", label: "Maximum marks", type: "number", min: 1, max: 1000, step: 1, required: true },
      { name: "status", label: "Visibility", type: "select", required: true, options: [["published", "Publish now — notify students"], ["draft", "Save as draft"]] },
      { name: "allowLate", label: "Accept late submissions (marked as late)", type: "checkbox", span: 2 },
    ],
    values: existing
      ? { title: existing.title, batchId: existing.batchId, description: existing.description || "", dueDate: dateOf(existing.dueAt), dueTime: String(existing.dueAt).slice(11, 16) || "23:59", maxMarks: existing.maxMarks, status: existing.status, allowLate: existing.allowLate }
      : { dueDate: "", dueTime: "23:59", maxMarks: 25, status: "published", allowLate: true, batchId: batches.length === 1 ? batches[0].id : "" },
    validate: (d) => {
      const e = {};
      if (d.title.trim().length < 3) e.title = "Give the assignment a title (at least 3 characters).";
      if (!d.batchId) e.batchId = "Choose a batch.";
      else if (existing && subs.length && d.batchId !== existing.batchId) e.batchId = "Students have already submitted — the batch can't be changed.";
      if (!d.description.trim()) e.description = "Add instructions for students.";
      if (!d.dueDate) e.dueDate = "Pick a due date.";
      else if (d.dueDate < today() && (!existing || d.dueDate !== dateOf(existing.dueAt))) e.dueDate = "The due date can't be in the past.";
      if (!d.dueTime) e.dueTime = "Pick a due time.";
      const max = Number(d.maxMarks);
      if (!Number.isInteger(max) || max < 1 || max > 1000) e.maxMarks = "Enter a whole number between 1 and 1000.";
      else if (max < topMark) e.maxMarks = `A submission is already graded ${topMark} — maximum can't be lower.`;
      if (existing?.status === "published" && d.status === "draft" && subs.length) e.status = "Students have submitted work — it can't go back to draft.";
      return e;
    },
  });
  if (!data) return;
  const batch = store.byId("batches", data.batchId);
  const patch = { title: data.title.trim(), batchId: data.batchId, courseId: batch?.courseId || null, description: data.description.trim(), dueAt: `${data.dueDate}T${data.dueTime}:00`, maxMarks: Number(data.maxMarks), allowLate: !!data.allowLate, status: data.status };
  if (!existing) Object.assign(patch, { fileIds: [], createdBy: ctx.user.id });
  await run(() => services.saveAssignment(ctx.user, existing ? id : null, patch), {
    success: (a) => (a.status === "published" ? `“${a.title}” is published — ${batch?.code || "the batch"} has been notified.` : `“${a.title}” saved as a draft.`),
    error: "Couldn't save the assignment",
  });
}

async function publishAssignment(id) {
  const a = store.byId("assignments", id);
  if (!a) return;
  if (dateOf(a.dueAt) < today()) return toast("The due date has passed. Edit the assignment and set a new due date first.", { type: "warning" });
  await run(() => services.saveAssignment(ctx.user, id, { status: "published" }), { success: `“${a.title}” published and students notified.`, error: "Couldn't publish the assignment" });
}

async function deleteAssignment(id) {
  const a = store.byId("assignments", id);
  if (!a) return;
  const n = store.count("submissions", (s) => s.assignmentId === id);
  const ok = await confirm({ title: `Delete “${a.title}”?`, message: n ? `${plural(n, "student submission")} and their grades will be deleted too. This can't be undone.` : "This can't be undone.", confirmLabel: "Delete assignment", danger: true });
  if (!ok) return;
  await run(() => services.removeAssignment(ctx.user, id), { success: "Assignment deleted.", error: "Couldn't delete the assignment" });
}

function openGrading(assignmentId, startSubId) {
  const a = store.byId("assignments", assignmentId);
  if (!a) return toast("That assignment couldn't be found.", { type: "warning" });
  if (!scopeIds().has(a.batchId)) return toast("This assignment belongs to a batch outside your scope.", { type: "warning" });
  const canGrade = ctx.can("assignments.grade");
  const order = () => {
    const subs = store.where("submissions", (s) => s.assignmentId === assignmentId);
    const rank = (s) => (s.status === "submitted" ? 0 : 1);
    return subs.sort((x, y) => rank(x) - rank(y) || (x.submittedAt || "").localeCompare(y.submittedAt || ""));
  };
  let currentId = startSubId || order()[0]?.id || null;
  const d = drawer.open({ title: "Grade — " + a.title, body: "", wide: true, footer: html`<button type="button" class="btn btn-outline" data-d="close">Done</button>` });
  d.root.querySelector('[data-d="close"]').addEventListener("click", d.close);

  function paint(focusMarks) {
    const fresh = store.byId("assignments", assignmentId);
    if (!fresh) {
      d.body.innerHTML = emptyState({ icon: "ClipboardList", title: "Assignment deleted", text: "This assignment was removed." });
      return;
    }
    const list = order();
    if (!list.some((s) => s.id === currentId)) currentId = list[0]?.id || null;
    const roster = rosterOf(fresh.batchId);
    const graded = list.filter((s) => s.status === "graded").length;
    const idx = list.findIndex((s) => s.id === currentId);
    const sub = list[idx];
    const student = sub ? userById(sub.studentId) : null;
    const files = sub ? (sub.fileIds || []).map((fid) => store.byId("files", fid)).filter(Boolean) : [];
    const missing = roster.filter((s) => !list.some((x) => x.studentId === s.id));

    d.body.innerHTML = html`
      <div class="cluster section-gap">
        <span class="chip">${raw(icon("Users", { size: 13 }))}${list.length} / ${roster.length} submitted</span>
        <span class="chip tone-green">${raw(icon("CircleCheck", { size: 13 }))}${graded} graded</span>
        <span class="chip tone-amber">${raw(icon("Clock", { size: 13 }))}${list.length - graded} to grade</span>
        <span class="chip">${raw(icon("CalendarClock", { size: 13 }))}Due ${dueLabel(fresh.dueAt)}</span>
        <span class="chip">${fresh.maxMarks} marks</span>
      </div>
      ${list.length
        ? html`
        <div class="grade-layout">
          <div class="grade-list" role="list" aria-label="Submissions">
            ${raw(list.map((s) => {
              const u = userById(s.studentId);
              return html`<button type="button" class="grade-item" role="listitem" data-g-pick="${s.id}" aria-current="${String(s.id === currentId)}">${raw(avatar({ name: u?.name, size: "xs" }))}<span class="grade-item-name">${u?.name || "—"}</span>${s.late ? html`<span class="badge tone-amber">Late</span>` : raw("")}${s.status === "graded" ? html`<span class="badge tone-green tabular">${s.marks}/${fresh.maxMarks}</span>` : html`<span class="badge tone-blue">New</span>`}</button>`;
            }).join(""))}
          </div>
          <div class="grade-detail">
            <div class="cell-user section-gap">${raw(avatar({ name: student?.name, size: "md" }))}<div class="cell-user-text"><span class="cell-title">${student?.name || "—"}</span><span class="cell-sub">${student?.rollNo || ""} · submitted ${dateTime(sub.submittedAt)}</span></div><span class="w-100"></span>${sub.late ? raw(badge("late", "Late")) : raw("")}${raw(badge(sub.status, titleCase(sub.status)))}</div>
            <div class="drawer-section">
              <h4 class="drawer-section-title">Answer</h4>
              <p class="submission-text m-0">${sub.text || "No written answer — see the attached files."}</p>
            </div>
            <div class="drawer-section">
              <h4 class="drawer-section-title">Files</h4>
              ${files.length ? html`<div class="stack-sm">${raw(files.map((f) => html`<div class="file-tile"><span class="icon-tile icon-tile-sm tone-blue">${raw(icon("FileText", { size: 16 }))}</span><div class="file-tile-main"><div class="file-tile-name">${f.name}</div><div class="file-tile-meta">${fileSize(f.size)}</div></div><button type="button" class="btn btn-outline btn-sm" data-g-file="${f.id}">${raw(icon("Download", { size: 14 }))}Download</button></div>`).join(""))}</div>` : html`<p class="text-muted m-0">No files attached.</p>`}
            </div>
            <form class="drawer-section" data-g-form novalidate>
              <h4 class="drawer-section-title">Grade</h4>
              ${canGrade ? raw("") : html`<p class="text-muted">Your role can view submissions but not grade them.</p>`}
              <div class="form-grid form-grid-2">
                <div class="form-field">
                  <label class="form-label" for="g-marks">Marks (out of ${fresh.maxMarks}) <span class="req">*</span></label>
                  <input type="number" id="g-marks" class="form-control" name="marks" min="0" max="${fresh.maxMarks}" step="0.5" value="${sub.marks ?? ""}" ${raw(canGrade ? "" : "disabled")}>
                  <p class="field-error" data-error-for="marks" hidden></p>
                </div>
                <div class="form-field grade-live"><span class="form-label">Grade</span><div data-g-live class="fw-600 text-title"></div></div>
                <div class="form-field field-full">
                  <label class="form-label" for="g-feedback">Feedback</label>
                  <textarea id="g-feedback" class="form-control" name="feedback" rows="3" placeholder="What went well, what to improve" ${raw(canGrade ? "" : "disabled")}>${sub.feedback || ""}</textarea>
                </div>
              </div>
              <div class="grade-nav">
                <button type="button" class="btn btn-outline btn-sm" data-g-nav="-1" ${raw(idx <= 0 ? "disabled" : "")}>${raw(icon("ChevronLeft", { size: 15 }))}Previous</button>
                <span class="text-sm text-muted tabular">${idx + 1} of ${list.length}</span>
                <button type="button" class="btn btn-outline btn-sm" data-g-nav="1" ${raw(idx >= list.length - 1 ? "disabled" : "")}>Next${raw(icon("ChevronRight", { size: 15 }))}</button>
                ${canGrade ? html`<span class="w-100 hide-sm"></span><button type="submit" class="btn btn-outline btn-sm" data-g-save="stay">${raw(icon("Save", { size: 15 }))}Save</button><button type="submit" class="btn btn-primary btn-sm" data-g-save="next">${raw(icon("Check", { size: 15 }))}Save &amp; next</button>` : raw("")}
              </div>
            </form>
          </div>
        </div>`
        : raw(emptyState({ icon: "Inbox", title: "No submissions yet", text: `${roster.length ? plural(roster.length, "student") + " in this batch haven't" : "Nobody has"} submitted. Submissions appear here as soon as students upload them.` }))}
      ${missing.length && list.length ? html`<div class="drawer-section"><h4 class="drawer-section-title">Not submitted (${missing.length})</h4><div class="cluster">${raw(missing.map((s) => html`<span class="chip">${s.name}</span>`).join(""))}</div></div>` : raw("")}`;

    const input = d.body.querySelector("#g-marks");
    const live = () => {
      const out = d.body.querySelector("[data-g-live]");
      if (!out || !input) return;
      const v = input.value === "" ? null : Number(input.value);
      if (v == null) out.textContent = "—";
      else if (Number.isNaN(v) || v < 0 || v > fresh.maxMarks) out.innerHTML = html`<span class="text-danger">Enter 0–${fresh.maxMarks}</span>`;
      else {
        const p = (v / fresh.maxMarks) * 100;
        out.textContent = `${pct(p, 0)} · ${sel.gradeFor(p).grade}`;
      }
    };
    input?.addEventListener("input", live);
    live();
    if (focusMarks && input && !input.disabled) input.focus();
  }

  on(d.body, "click", "[data-g-pick]", (e, b) => {
    currentId = b.dataset.gPick;
    paint(true);
  });
  on(d.body, "click", "[data-g-nav]", (e, b) => {
    const list = order();
    const i = list.findIndex((s) => s.id === currentId) + Number(b.dataset.gNav);
    if (list[i]) {
      currentId = list[i].id;
      paint(true);
    }
  });
  on(d.body, "click", "[data-g-file]", (e, b) => run(() => downloadFile(b.dataset.gFile), { error: "Couldn't download the file" }));
  d.body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target.closest("[data-g-form]");
    if (!form || !canGrade) return;
    const goNext = e.submitter?.dataset.gSave !== "stay";
    const fresh = store.byId("assignments", assignmentId);
    const raw1 = form.elements.marks.value;
    const marks = Number(raw1);
    const errEl = form.querySelector('[data-error-for="marks"]');
    let msg = "";
    if (raw1 === "") msg = "Enter the marks.";
    else if (Number.isNaN(marks) || marks < 0 || marks > fresh.maxMarks) msg = `Marks must be between 0 and ${fresh.maxMarks}.`;
    else if (Math.round(marks * 2) !== marks * 2) msg = "Use whole or half marks.";
    if (msg) {
      errEl.hidden = false;
      errEl.textContent = msg;
      form.elements.marks.classList.add("has-error");
      form.elements.marks.focus();
      return;
    }
    const sub = store.byId("submissions", currentId);
    const name = userById(sub?.studentId)?.name || "Student";
    const saved = await run(() => services.gradeSubmission(ctx.user, currentId, { marks, feedback: form.elements.feedback.value.trim() }), { success: `${name} graded ${marks}/${fresh.maxMarks}.`, error: "Couldn't save the grade" });
    if (!saved) return;
    if (goNext) {
      const list = order();
      const nextUngraded = list.find((s) => s.status === "submitted");
      const i = list.findIndex((s) => s.id === currentId);
      currentId = nextUngraded?.id || list[i + 1]?.id || currentId;
      if (!nextUngraded) toast("All submissions for this assignment are graded.", { type: "success" });
    }
    paint(true);
  });
  paint(false);
}

/* =========================================================================================
   EXAMS, MARKS & RESULTS
   ========================================================================================= */

const canEnterMarks = (r) => ctx.can("marks.enter") && r.status !== "published" && r.date <= today();

function initExamTable() {
  examTable = dataTable(qs("[data-exam-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["title", "cycle", "batchName", "batchCode", "room"],
    filters: [
      { key: "batchId", label: "Batch", options: scopeBatches().map((b) => [b.id, b.code || b.name]) },
      { key: "status", label: "Status", options: Object.entries(EXAM_STATUS) },
    ],
    columns: [
      { key: "title", label: "Exam", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${r.cycle || "—"} · ${titleCase(r.type || "internal")} · ${r.maxMarks} marks</span></div>` },
      { key: "batchCode", label: "Batch", sortable: true, hideBelow: "md", render: (r) => html`<span class="fw-600">${r.batchCode}</span>` },
      { key: "date", label: "Date & time", sortable: true, render: (r) => html`${date(r.date)}<div class="cell-sub">${timeRange(r.start, r.end)}${r.date >= today() && r.status === "scheduled" ? " · " + dueIn(r.date) : ""}</div>` },
      { key: "room", label: "Room", hideBelow: "md" },
      { key: "entered", label: "Marks", sortable: true, hideBelow: "sm", render: (r) => html`<span class="tabular">${r.entered} / ${r.rosterSize}</span>` },
      { key: "status", label: "Status", render: (r) => badge(r.status, EXAM_STATUS[r.status] || titleCase(r.status)) },
    ],
    rowActions: [
      { label: "Enter marks", icon: "SquarePen", perm: "marks.enter", hidden: (r) => !canEnterMarks(r), onClick: (r) => openMarks(r.id) },
      { label: "Results summary", icon: "ChartColumn", hidden: (r) => !r.entered, onClick: (r) => openResults(r.id) },
      { label: "Publish results", icon: "Send", perm: "results.publish", hidden: (r) => r.status !== "marks-entry", onClick: (r) => openResults(r.id) },
      { label: "Edit exam", icon: "Pencil", perm: "exams.manage", hidden: (r) => r.status === "published", onClick: (r) => examFlow(r.id) },
      { label: "Delete exam", icon: "Trash2", perm: "exams.manage", danger: true, hidden: (r) => r.status === "published", onClick: (r) => deleteExam(r.id) },
    ],
    onRowClick: (r) => {
      if (r.entered || r.status === "published") return openResults(r.id);
      if (canEnterMarks(r)) return openMarks(r.id);
      if (ctx.can("exams.manage")) return examFlow(r.id);
      toast(r.date > today() ? `Marks can be entered from ${date(r.date)}, the exam date.` : "No marks have been entered yet.", { type: "info" });
    },
    empty: emptyState({ icon: "GraduationCap", title: "No exams", text: ctx.can("exams.manage") ? "Schedule one with “Schedule exam”. Students in the batch are notified." : "Exams for your batches will appear here." }),
  });
}

async function examFlow(id) {
  if (!ctx.can("exams.manage")) return toast("You don't have permission to schedule exams.", { type: "warning" });
  const existing = id ? store.byId("exams", id) : null;
  if (id && !existing) return toast("That exam no longer exists.", { type: "warning" });
  if (existing?.status === "published") return toast("Published exams can't be edited.", { type: "info" });
  const batches = scopeBatches().filter((b) => b.status === "active" || b.id === existing?.batchId);
  if (!batches.length) return toast("You need an active batch before scheduling an exam.", { type: "info" });
  const hasMarks = existing ? store.count("marks", (m) => m.examId === id) > 0 : false;
  const data = await modal.form({
    title: existing ? "Edit exam" : "Schedule exam",
    submitLabel: existing ? "Save changes" : "Schedule exam",
    size: "lg",
    fields: [
      { name: "cycle", label: "Exam cycle", type: "select", required: true, options: [...new Set([...CYCLES, existing?.cycle].filter(Boolean))] },
      { name: "type", label: "Type", type: "select", required: true, options: [["internal", "Internal assessment"], ["final", "Final exam"]] },
      { name: "batchId", label: "Batch", type: "select", required: true, placeholder: "Select a batch", options: batches.map((b) => [b.id, b.name]), span: 2 },
      { name: "title", label: "Title", placeholder: "Leave blank for “<cycle> — <course>”", span: 2 },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "room", label: "Room / venue", required: true, placeholder: "e.g. Lab 2" },
      { name: "start", label: "Starts", type: "time", required: true },
      { name: "end", label: "Ends", type: "time", required: true },
      { name: "maxMarks", label: "Maximum marks", type: "number", min: 1, max: 1000, step: 1, required: true },
      { name: "passMarks", label: "Pass marks", type: "number", min: 0, step: 1, required: true },
    ],
    values: existing
      ? { cycle: existing.cycle, type: existing.type || "internal", batchId: existing.batchId, title: existing.title, date: existing.date, room: existing.room, start: existing.start, end: existing.end, maxMarks: existing.maxMarks, passMarks: existing.passMarks ?? passMarkOf(existing) }
      : { cycle: "Unit Test", type: "internal", batchId: batches.length === 1 ? batches[0].id : "", start: "10:00", end: "12:00", maxMarks: 100, passMarks: 35, room: "" },
    validate: (d) => {
      const e = {};
      if (!d.batchId) e.batchId = "Choose a batch.";
      else if (hasMarks && d.batchId !== existing.batchId) e.batchId = "Marks are already entered — the batch can't be changed.";
      if (!d.date) e.date = "Pick the exam date.";
      else if (!existing && d.date < today()) e.date = "An exam can't be scheduled in the past.";
      if (!d.start) e.start = "Pick a start time.";
      if (!d.end) e.end = "Pick an end time.";
      else if (d.start && d.end <= d.start) e.end = "The exam must end after it starts.";
      if (!d.room.trim()) e.room = "Enter the room or venue.";
      const max = Number(d.maxMarks);
      const pass = Number(d.passMarks);
      if (!Number.isInteger(max) || max < 1 || max > 1000) e.maxMarks = "Enter a whole number between 1 and 1000.";
      else if (hasMarks) {
        const top = Math.max(0, ...store.where("marks", (m) => m.examId === id && m.marks != null).map((m) => m.marks));
        if (max < top) e.maxMarks = `A student already scored ${top} — maximum can't be lower.`;
      }
      if (d.passMarks === "" || !Number.isFinite(pass) || pass < 0) e.passMarks = "Enter the pass mark.";
      else if (Number.isFinite(max) && pass > max) e.passMarks = "Pass marks can't exceed the maximum.";
      if (!e.date && !e.end && !e.start) {
        const overlap = store.where("exams", (x) => x.id !== id && x.date === d.date && x.start < d.end && d.start < x.end);
        const roomClash = overlap.find((x) => (x.room || "").trim().toLowerCase() === d.room.trim().toLowerCase());
        const batchClash = overlap.find((x) => x.batchId === d.batchId);
        if (batchClash) e.start = `This batch already has “${batchClash.title}” at that time.`;
        else if (roomClash && !e.room) e.room = `${d.room.trim()} is booked for “${roomClash.title}” then.`;
      }
      return e;
    },
  });
  if (!data) return;
  const batch = store.byId("batches", data.batchId);
  const course = sel.courseOf(batch);
  const patch = {
    batchId: data.batchId, courseId: batch?.courseId || null, cycle: data.cycle, type: data.type,
    title: data.title.trim() || `${data.cycle} — ${course?.title || batch?.name || ""}`,
    date: data.date, start: data.start, end: data.end, room: data.room.trim(),
    maxMarks: Number(data.maxMarks), passMarks: Number(data.passMarks), weightage: data.type === "final" ? 60 : 40,
  };
  await run(() => services.saveExam(ctx.user, existing ? id : null, patch), { success: (x) => (existing ? `“${x.title}” updated.` : `“${x.title}” scheduled for ${date(x.date)} — students notified.`), error: "Couldn't save the exam" });
}

// Missing service: there is no services.removeExam, so this checks the permission itself, deletes the exam and
// its marks through store.*, and writes an activity entry the same way services.js does.
async function deleteExam(id) {
  const exam = store.byId("exams", id);
  if (!exam) return;
  if (!ctx.can("exams.manage")) return toast("You don't have permission to delete exams.", { type: "warning" });
  const n = store.count("marks", (m) => m.examId === id);
  const ok = await confirm({ title: `Delete “${exam.title}”?`, message: n ? `${plural(n, "student mark")} entered for this exam will be deleted too. This can't be undone.` : "The exam is removed from students' schedules. This can't be undone.", confirmLabel: "Delete exam", danger: true });
  if (!ok) return;
  await run(() => services.deleteExam(ctx.user, id), { success: "Exam deleted.", error: "Couldn't delete the exam" });
}

function openMarks(examId) {
  const exam = store.byId("exams", examId);
  if (!exam) return toast("That exam no longer exists.", { type: "warning" });
  if (!ctx.can("marks.enter")) return toast("You don't have permission to enter marks.", { type: "warning" });
  if (!scopeIds().has(exam.batchId)) return toast("This exam is for a batch outside your scope.", { type: "warning" });
  if (exam.status === "published") return toast("Results are published — marks are locked.", { type: "info" });
  if (exam.date > today()) return toast(`Marks can be entered from ${date(exam.date)}, the exam date.`, { type: "info" });
  const roster = examRoster(exam);
  if (!roster.length) return toast("No students are enrolled in this batch.", { type: "info" });
  const pass = passMarkOf(exam);

  const body = html`
    <div class="cluster section-gap">
      <span class="chip">${raw(icon("Calendar", { size: 13 }))}${date(exam.date)} · ${timeRange(exam.start, exam.end)}</span>
      <span class="chip">Max ${exam.maxMarks}</span>
      <span class="chip">Pass ${pass}</span>
      <span class="chip">${raw(icon("Users", { size: 13 }))}${plural(roster.length, "student")}</span>
    </div>
    <p class="text-xs text-muted marks-hint">${raw(icon("Info", { size: 13 }))}Enter or ↓ moves down a column, ↑ moves up. Tick Absent for students who didn't sit the exam.</p>
    <div class="table-scroll">
      <table class="simple-table marks-grid">
        <thead><tr><th>#</th><th>Student</th><th>Marks / ${exam.maxMarks}</th><th>Absent</th><th>Remarks</th><th>Result</th></tr></thead>
        <tbody>
          ${raw(roster.map((s, i) => {
            const m = sel.marksFor(examId, s.id);
            return html`<tr data-m-row="${s.id}">
              <td class="text-muted tabular">${i + 1}</td>
              <td><div class="cell-user-text"><span class="cell-title">${s.name}</span><span class="cell-sub">${s.rollNo || ""}</span></div></td>
              <td><input type="number" class="form-control form-control-sm marks-input" data-m-col="marks" min="0" max="${exam.maxMarks}" step="0.5" inputmode="decimal" aria-label="Marks for ${s.name}" value="${m && !m.absent && m.marks != null ? m.marks : ""}" ${raw(m?.absent ? "disabled" : "")}><p class="field-error" data-m-error hidden></p></td>
              <td><label class="check-label"><input type="checkbox" data-m-col="absent" aria-label="${s.name} absent" ${raw(m?.absent ? "checked" : "")}><span class="hide-sm">Absent</span></label></td>
              <td><input type="text" class="form-control form-control-sm marks-remarks" data-m-col="remarks" maxlength="120" aria-label="Remarks for ${s.name}" value="${m?.remarks || ""}"></td>
              <td data-m-result></td>
            </tr>`;
          }).join(""))}
        </tbody>
      </table>
    </div>`;
  const footer = html`<span class="marks-stats text-sm text-muted" data-m-stats></span><button type="button" class="btn btn-outline" data-m="cancel">Cancel</button><button type="button" class="btn btn-primary" data-m="save">${raw(icon("Save", { size: 16 }))}Save marks</button>`;
  const m = modal.open({ title: "Enter marks — " + exam.title, body, footer, size: "xl" });
  const root = m.root;
  let dirty = false;

  const rowState = (tr) => {
    const input = qs('[data-m-col="marks"]', tr);
    const absent = qs('[data-m-col="absent"]', tr).checked;
    const v = input.value.trim();
    const n = Number(v);
    let error = "";
    if (!absent) {
      if (v === "") error = "Required";
      else if (Number.isNaN(n) || n < 0 || n > exam.maxMarks) error = `0–${exam.maxMarks}`;
      else if (Math.round(n * 2) !== n * 2) error = "Whole or .5";
    }
    return { input, absent, value: v === "" ? null : n, error, empty: v === "" };
  };

  const paintRow = (tr) => {
    const s = rowState(tr);
    const out = qs("[data-m-result]", tr);
    if (s.absent) out.innerHTML = badge("absent", "Absent");
    else if (s.empty) out.innerHTML = html`<span class="text-muted">—</span>`;
    else if (s.error) out.innerHTML = html`<span class="text-danger text-sm">Out of range</span>`;
    else {
      const p = (s.value / exam.maxMarks) * 100;
      out.innerHTML = html`<span class="marks-result"><span class="fw-600 tabular">${sel.gradeFor(p).grade}</span>${s.value >= pass ? html`<span class="badge tone-green">Pass</span>` : html`<span class="badge tone-rust">Fail</span>`}</span>`;
    }
  };

  const paintStats = () => {
    const states = qsa("[data-m-row]", root).map(rowState);
    const sat = states.filter((s) => !s.absent && !s.empty && !s.error);
    const avg = sat.length ? sat.reduce((t, s) => t + s.value, 0) / sat.length : null;
    const passed = sat.filter((s) => s.value >= pass).length;
    qs("[data-m-stats]", root).textContent = `${sat.length + states.filter((s) => s.absent).length}/${states.length} entered · avg ${avg == null ? "—" : avg.toFixed(1)} · pass ${sat.length ? pct((passed / sat.length) * 100, 0) : "—"}`;
  };

  qsa("[data-m-row]", root).forEach(paintRow);
  paintStats();

  on(root, "input", "[data-m-col]", (e, el) => {
    dirty = true;
    const tr = el.closest("[data-m-row]");
    if (el.dataset.mCol === "marks") {
      el.classList.remove("has-error");
      qs("[data-m-error]", tr).hidden = true;
    }
    paintRow(tr);
    paintStats();
  });
  on(root, "change", '[data-m-col="absent"]', (e, cb) => {
    dirty = true;
    const tr = cb.closest("[data-m-row]");
    const input = qs('[data-m-col="marks"]', tr);
    input.disabled = cb.checked;
    input.classList.remove("has-error");
    qs("[data-m-error]", tr).hidden = true;
    paintRow(tr);
    paintStats();
  });
  on(root, "keydown", "[data-m-col]", (e, el) => {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    e.preventDefault();
    const rows = qsa("[data-m-row]", root);
    const tr = el.closest("[data-m-row]");
    let i = rows.indexOf(tr);
    const col = el.dataset.mCol;
    const step = e.key === "ArrowUp" ? -1 : 1;
    for (i += step; i >= 0 && i < rows.length; i += step) {
      const target = qs(`[data-m-col="${col}"]`, rows[i]);
      if (target && !target.disabled) {
        target.focus();
        target.select?.();
        return;
      }
    }
    if (step === 1) qs('[data-m="save"]', root).focus();
  });

  const close = async () => {
    if (dirty && !(await confirm({ title: "Discard unsaved marks?", message: "Marks you typed in this sheet haven't been saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true }))) return;
    m.close();
  };
  qs('[data-m="cancel"]', root).addEventListener("click", close);

  qs('[data-m="save"]', root).addEventListener("click", async () => {
    const rows = qsa("[data-m-row]", root);
    let firstBad = null;
    let bad = 0;
    const entries = rows.map((tr) => {
      const s = rowState(tr);
      const err = qs("[data-m-error]", tr);
      if (s.error) {
        bad++;
        s.input.classList.add("has-error");
        err.hidden = false;
        err.textContent = s.error === "Required" ? "Enter marks or tick Absent" : `Must be ${s.error}`;
        firstBad = firstBad || s.input;
      } else {
        s.input.classList.remove("has-error");
        err.hidden = true;
      }
      return { studentId: tr.dataset.mRow, marks: s.absent ? null : s.value, absent: s.absent, remarks: qs('[data-m-col="remarks"]', tr).value.trim() };
    });
    if (bad) {
      firstBad.focus();
      return toast(`${plural(bad, "row needs", "rows need")} attention before saving.`, { type: "warning" });
    }
    const btn = qs('[data-m="save"]', root);
    btn.disabled = true;
    const saved = await run(() => services.enterMarks(ctx.user, examId, entries), { success: `Marks saved for ${plural(entries.length, "student")}.`, error: "Couldn't save the marks" });
    btn.disabled = false;
    if (saved) {
      dirty = false;
      m.close();
      if (ctx.can("results.publish")) openResults(examId);
    }
  });
  requestAnimationFrame(() => qs('[data-m-col="marks"]:not([disabled])', root)?.focus());
}

function openResults(examId) {
  const exam = store.byId("exams", examId);
  if (!exam) return toast("That exam no longer exists.", { type: "warning" });
  if (!scopeIds().has(exam.batchId)) return toast("This exam is for a batch outside your scope.", { type: "warning" });
  const s = examStats(exam);
  const canPublish = ctx.can("results.publish") && exam.status === "marks-entry";
  const gradeScale = (settings().grading || {}).scale || [];
  const body = html`
    <div class="cell-user-text section-gap"><span class="cell-title">${exam.title}</span><span class="cell-sub">${batchName(exam.batchId)} · ${date(exam.date)} · ${raw(badge(exam.status, EXAM_STATUS[exam.status] || exam.status))}</span></div>
    ${s.entered
      ? html`
      <div class="mini-stats section-gap">
        <div class="mini-stat"><span class="mini-stat-label">Average</span><span class="mini-stat-value">${s.avg == null ? "—" : `${s.avg.toFixed(1)}`}<small>/${exam.maxMarks}</small></span></div>
        <div class="mini-stat"><span class="mini-stat-label">Pass rate</span><span class="mini-stat-value">${s.passPct == null ? "—" : pct(s.passPct, 0)}</span></div>
        <div class="mini-stat"><span class="mini-stat-label">Highest / lowest</span><span class="mini-stat-value">${s.high ?? "—"} / ${s.low ?? "—"}</span></div>
        <div class="mini-stat"><span class="mini-stat-label">Sat · absent</span><span class="mini-stat-value">${s.sat} · ${s.absent}</span></div>
      </div>
      ${s.missing ? html`<div class="alert tone-amber section-gap">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">${plural(s.missing, "student has", "students have")} no marks entered yet.</div></div>` : raw("")}
      <div class="grid grid-2">
        <div>
          <h4 class="drawer-section-title">Top performers</h4>
          ${s.top.length ? html`<ol class="list-plain results-top">${raw(s.top.map((t, i) => html`<li class="list-row"><span class="icon-tile icon-tile-sm tone-${raw(["amber", "slate", "rust"][i])}">${i + 1}</span><div class="list-row-main"><div class="list-row-title">${t.name}</div><div class="list-row-sub">${pct((t.marks / exam.maxMarks) * 100, 0)} · ${sel.gradeFor((t.marks / exam.maxMarks) * 100).grade}</div></div><span class="fw-600 tabular">${t.marks}</span></li>`).join(""))}</ol>` : html`<p class="text-muted">Nobody sat the exam.</p>`}
        </div>
        <div>
          <h4 class="drawer-section-title">Grade distribution</h4>
          <div class="stack-sm">${raw(gradeScale.map((g) => {
            const n = s.grades[g.grade] || 0;
            return html`<div class="grade-bar"><span class="grade-bar-label fw-600">${g.grade}</span>${progress(s.sat ? (n / s.sat) * 100 : 0, g.point ? "blue" : "rust")}<span class="tabular text-sm">${n}</span></div>`;
          }).join(""))}</div>
        </div>
      </div>`
      : raw(emptyState({ icon: "ChartColumn", title: "No marks yet", text: "Results appear once marks are entered for this exam." }))}`;
  const footer = html`
    <button type="button" class="btn btn-outline" data-r="close">Close</button>
    ${ctx.can("marks.enter") && exam.status !== "published" && exam.date <= today() ? html`<button type="button" class="btn btn-outline" data-r="edit">${raw(icon("SquarePen", { size: 16 }))}${s.entered ? "Edit marks" : "Enter marks"}</button>` : raw("")}
    ${canPublish ? html`<button type="button" class="btn btn-primary" data-r="publish">${raw(icon("Send", { size: 16 }))}Publish results</button>` : raw("")}`;
  const m = modal.open({ title: "Results summary", body, footer, size: "lg" });
  qs('[data-r="close"]', m.root).addEventListener("click", m.close);
  qs('[data-r="edit"]', m.root)?.addEventListener("click", () => {
    m.close();
    openMarks(examId);
  });
  qs('[data-r="publish"]', m.root)?.addEventListener("click", async () => {
    const ok = await confirm({
      title: "Publish results?",
      message: `${plural(s.entered, "student")} will be notified and can see their marks. ${s.missing ? `${plural(s.missing, "student")} without marks will not get a result. ` : ""}Published marks are locked and can't be edited.`,
      confirmLabel: "Publish results",
    });
    if (!ok) return;
    const done = await run(() => services.publishResults(ctx.user, examId), { success: `Results for “${exam.title}” published — average ${s.avg == null ? "—" : s.avg.toFixed(1)}, pass rate ${s.passPct == null ? "—" : pct(s.passPct, 0)}.`, error: "Couldn't publish the results" });
    if (done) m.close();
  });
}

/* =========================================================================================
   TRANSCRIPTS
   ========================================================================================= */

function initTranscripts() {
  on(ctx.root, "input", "[data-tr-search]", (e, input) => {
    tr.query = input.value;
    renderTrResults();
  });
  on(ctx.root, "keydown", "[data-tr-search]", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      qs("[data-tr-pick]", ctx.root)?.focus();
    }
  });
  on(ctx.root, "keydown", "[data-tr-pick]", (e, b) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = qsa("[data-tr-pick]", ctx.root);
    const i = all.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1);
    if (i < 0) qs("[data-tr-search]", ctx.root).focus();
    else all[i]?.focus();
  });
  on(ctx.root, "click", "[data-tr-pick]", (e, b) => {
    tr.studentId = b.dataset.trPick;
    renderTrResults();
    renderTrPreview();
    if (window.matchMedia("(max-width: 900px)").matches) qs("[data-tr-preview]", ctx.root)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  on(ctx.root, "click", "[data-tr-issue]", () => issueFlow(tr.studentId));
  on(ctx.root, "click", "[data-tr-print]", (e, b) => reprint(b.dataset.trPrint));

  trTable = dataTable(qs("[data-tr-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["serialNo", "studentName", "rollNo"],
    columns: [
      { key: "serialNo", label: "Serial", sortable: true, render: (r) => html`<span class="cell-title">${r.serialNo}</span>` },
      { key: "studentName", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.studentName, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.studentName}</span><span class="cell-sub">${r.rollNo}</span></div></div>` },
      { key: "issuedAt", label: "Issued", sortable: true, hideBelow: "md", render: (r) => html`${dateTime(r.issuedAt)}<div class="cell-sub">by ${r.issuer}</div>` },
      { key: "gpa", label: "GPA", sortable: true, align: "right", render: (r) => html`<span class="fw-600 tabular">${r.gpa == null ? "—" : Number(r.gpa).toFixed(2)}</span><div class="cell-sub">${plural(r.resultCount, "result")}</div>` },
    ],
    rowActions: [
      { label: "Reprint", icon: "Printer", onClick: (r) => reprint(r.id) },
      { label: "View student", icon: "Eye", onClick: (r) => pickStudent(r.studentId) },
    ],
    onRowClick: (r) => pickStudent(r.studentId),
    empty: emptyState({ icon: "FileBadge", title: "No transcripts issued", text: "Pick a student above to preview their results and issue a transcript." }),
  });
}

function pickStudent(id) {
  tr.studentId = id;
  renderTrResults();
  renderTrPreview();
  qs("[data-tr-preview]", ctx.root)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTrResults() {
  const box = qs("[data-tr-results]", ctx.root);
  if (!box) return;
  const needle = tr.query.trim().toLowerCase();
  const pool = scopedStudents();
  const list = (needle ? pool.filter((s) => [s.name, s.rollNo, s.email].some((v) => String(v || "").toLowerCase().includes(needle))) : pool.filter((s) => s.status === "active")).slice(0, 8);
  box.innerHTML = list.length
    ? html`${raw(list.map((s) => html`<button type="button" class="tr-pick" role="option" data-tr-pick="${s.id}" aria-selected="${String(s.id === tr.studentId)}">${raw(avatar({ name: s.name, size: "sm" }))}<span class="cell-user-text"><span class="cell-title">${s.name}</span><span class="cell-sub">${s.rollNo || s.email}</span></span>${s.status !== "active" ? raw(badge("inactive", "Inactive")) : raw("")}</button>`).join(""))}
      <p class="text-xs text-muted tr-count">${needle ? `${plural(list.length, "match", "matches")}${list.length === 8 ? " (first 8)" : ""}` : `Showing ${list.length} of ${pool.length} students — type to search.`}</p>`
    : raw(emptyState({ icon: "Search", title: "No students found", text: `Nothing matches “${tr.query.trim()}”.` }));
}

function publishedResults(studentId) {
  return sel.examsForStudent(studentId, { publishedOnly: true }).map((exam) => {
    const m = sel.marksFor(exam.id, studentId);
    const p = m && !m.absent && m.marks != null ? (m.marks / exam.maxMarks) * 100 : null;
    return { exam, m, p, grade: p == null ? null : sel.gradeFor(p).grade, course: sel.courseOf(store.byId("batches", exam.batchId))?.title || "—" };
  });
}

function renderTrPreview() {
  const box = qs("[data-tr-preview]", ctx.root);
  if (!box) return;
  const st = tr.studentId ? userById(tr.studentId) : null;
  if (!st) {
    box.innerHTML = emptyState({ icon: "GraduationCap", title: "Choose a student", text: "Their published results and GPA appear here before you issue a transcript." });
    return;
  }
  const results = publishedResults(st.id);
  const gpa = sel.gpaFor(st.id);
  const att = sel.attendanceStats(st.id);
  const issued = store.where("transcripts", (t) => t.studentId === st.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  box.innerHTML = html`
    <div class="cluster-between section-gap">
      <div class="cell-user">${raw(avatar({ name: st.name, size: "md" }))}<div class="cell-user-text"><span class="cell-title">${st.name}</span><span class="cell-sub">${st.rollNo || ""} · ${sel.activeBatchesOf(st.id).map((b) => b.code || b.name).join(", ") || "No active batch"}</span></div></div>
      <button type="button" class="btn btn-primary" data-tr-issue ${raw(results.length ? "" : "disabled")}>${raw(icon("FileBadge", { size: 16 }))}Issue transcript</button>
    </div>
    <div class="mini-stats section-gap">
      <div class="mini-stat"><span class="mini-stat-label">Cumulative GPA</span><span class="mini-stat-value">${gpa == null ? "—" : gpa.toFixed(2)}<small>/10</small></span></div>
      <div class="mini-stat"><span class="mini-stat-label">Published results</span><span class="mini-stat-value">${results.length}</span></div>
      <div class="mini-stat"><span class="mini-stat-label">Attendance</span><span class="mini-stat-value">${pct(att.pct, 1)}</span></div>
      <div class="mini-stat"><span class="mini-stat-label">Transcripts issued</span><span class="mini-stat-value">${issued.length}</span></div>
    </div>
    ${results.length
      ? html`<div class="table-scroll"><table class="simple-table">
          <thead><tr><th>Examination</th><th class="hide-sm">Course</th><th class="text-right">Marks</th><th class="text-right">%</th><th>Grade</th></tr></thead>
          <tbody>${raw(results.map((r) => html`<tr><td>${r.exam.title}<div class="cell-sub">${date(r.exam.date)}</div></td><td class="hide-sm">${r.course}</td><td class="text-right tabular">${r.m ? (r.m.absent ? "AB" : `${r.m.marks}/${r.exam.maxMarks}`) : "—"}</td><td class="text-right tabular">${r.p == null ? "—" : pct(r.p, 1)}</td><td>${r.grade ? raw(html`<span class="badge tone-${raw(r.grade === "F" ? "rust" : "blue")}">${r.grade}</span>`) : "—"}</td></tr>`).join(""))}</tbody>
        </table></div>`
      : html`<div class="alert tone-amber">${raw(icon("Info", { size: 18 }))}<div class="alert-body"><div class="alert-title">Nothing to put on a transcript yet</div>${st.name} has no published exam results. Publish results from the Exams &amp; marks tab first.</div></div>`}
    ${issued.length ? html`<div class="drawer-section tr-issued"><h4 class="drawer-section-title">Previously issued</h4><div class="cluster">${raw(issued.map((t) => html`<button type="button" class="chip tr-chip" data-tr-print="${t.id}" title="Reprint">${raw(icon("Printer", { size: 12 }))}${t.serialNo} · ${date(t.issuedAt)}</button>`).join(""))}</div></div>` : raw("")}`;
}

async function issueFlow(studentId) {
  const st = userById(studentId);
  if (!st) return;
  if (!ctx.can("transcripts.issue")) return toast("You don't have permission to issue transcripts.", { type: "warning" });
  const results = publishedResults(studentId);
  if (!results.length) return toast(`${st.name} has no published results to put on a transcript.`, { type: "info" });
  const gpa = sel.gpaFor(studentId);
  const ok = await confirm({ title: `Issue a transcript to ${st.name}?`, message: `A serial-numbered transcript with ${plural(results.length, "published result")} (GPA ${gpa == null ? "—" : gpa.toFixed(2)}) is recorded and the student is notified.`, confirmLabel: "Issue transcript" });
  if (!ok) return;
  const rec = await run(() => services.issueTranscript(ctx.user, studentId), { success: (t) => `Transcript ${t.serialNo} issued to ${st.name}.`, error: "Couldn't issue the transcript" });
  if (rec) printDoc("Transcript " + rec.serialNo, transcriptDoc(rec));
}

function reprint(id) {
  const t = store.byId("transcripts", id);
  if (!t) return toast("That transcript couldn't be found.", { type: "warning" });
  printDoc("Transcript " + t.serialNo, transcriptDoc(t));
}

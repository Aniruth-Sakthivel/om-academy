/*
Author       : OM Academy
Description  : Student → Exams & Results. Upcoming exams (eligibility + admit card), published results
               (marks, grade, pass/fail, GPA, marksheet) and issued transcripts.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import { html, raw, on, qs, toast, dataTable, badge, statCard, emptyState, tabs, printDoc, setSearchParam, getSearchParam } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateTime, timeRange, pct, weekdayShort, plural } from "../core/format.js";
import { admitCardDoc, marksheetDoc, transcriptDoc } from "../core/docs.js";
import { today, diffDays } from "../core/clock.js";

const TABS = ["upcoming", "results", "transcripts"];

let ctx;
let resultsTable;

boot({
  id: "student-exams",
  portal: "student",
  watch: ["exams", "marks", "transcripts", "attendanceSessions", "invoices", "payments", "enrollments", "settings", "users"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
  },
  update: () => refresh(),
  unmount() {
    resultsTable?.destroy();
  },
});

/* ---------- data ---------- */

const me = () => store.byId("users", ctx.user.id) || ctx.user;
const courseTitle = (exam) => store.byId("courses", exam.courseId)?.title || sel.courseOf(store.byId("batches", exam.batchId))?.title || "—";

function upcomingExams() {
  return sel.examsForStudent(ctx.user.id).filter((e) => e.status !== "published" && e.date >= today());
}

function resultRows() {
  return sel.examsForStudent(ctx.user.id, { publishedOnly: true })
    .map((exam) => {
      const m = sel.marksFor(exam.id, ctx.user.id);
      if (!m) return null;
      const percent = m.absent || m.marks == null ? null : (m.marks / exam.maxMarks) * 100;
      const g = percent == null ? null : sel.gradeFor(percent);
      const passed = !m.absent && m.marks != null && m.marks >= (exam.passMarks ?? 0);
      return { ...exam, course: courseTitle(exam), marks: m.marks, absent: m.absent, percent, grade: g?.grade || "—", gradeLabel: g?.label || "", result: m.absent ? "absent" : passed ? "pass" : "fail" };
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
}

const transcripts = () => store.where("transcripts", (t) => t.studentId === ctx.user.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "upcoming";
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Exams &amp; Results</li></ol>
        <h1 class="page-title">Exams &amp; Results</h1>
        <p class="page-subtitle">Your exam schedule, admit cards, results and transcripts.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="marksheet">${raw(icon("Printer", { size: 16 }))}Print marksheet</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="upcoming">${raw(icon("CalendarClock", { size: 15 }))}Upcoming <span class="tab-count" data-count="upcoming"></span></button>
        <button type="button" class="tab" role="tab" data-tab="results">${raw(icon("Award", { size: 15 }))}Results <span class="tab-count" data-count="results"></span></button>
        <button type="button" class="tab" role="tab" data-tab="transcripts">${raw(icon("FileBadge", { size: 15 }))}Transcripts <span class="tab-count" data-count="transcripts"></span></button>
      </div>
      <div data-tab-panel="upcoming"><div class="card-body" data-upcoming></div></div>
      <div data-tab-panel="results" hidden><div data-results-table></div></div>
      <div data-tab-panel="transcripts" hidden><div class="card-body" data-transcripts></div></div>
    </div>`;

  tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });

  resultsTable = dataTable(qs("[data-results-table]", ctx.root), {
    rows: [],
    searchKeys: ["title", "course", "cycle"],
    filters: [{ key: "result", label: "Result", options: [["pass", "Pass"], ["fail", "Fail"], ["absent", "Absent"]] }],
    columns: [
      { key: "title", label: "Exam", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.cycle || r.title}</span><span class="cell-sub">${r.course}</span></div>` },
      { key: "date", label: "Date", sortable: true, hideBelow: "md", render: (r) => date(r.date) },
      { key: "marks", label: "Marks", sortable: true, align: "right", render: (r) => html`<span class="tabular fw-600">${r.absent ? "AB" : r.marks}</span><span class="text-muted"> / ${r.maxMarks}</span>` },
      { key: "percent", label: "%", sortable: true, align: "right", render: (r) => (r.percent == null ? "—" : pct(r.percent, 1)) },
      { key: "grade", label: "Grade", render: (r) => html`<span class="exam-grade tone-${raw(gradeTone(r))}">${r.grade}</span>` },
      { key: "result", label: "Result", render: (r) => html`<span class="badge tone-${raw(r.result === "pass" ? "green" : r.result === "fail" ? "rust" : "slate")}">${r.result === "pass" ? "Pass" : r.result === "fail" ? "Fail" : "Absent"}</span>` },
    ],
    rowActions: [{ label: "Print marksheet", icon: "Printer", onClick: (r) => printMarksheet([r], r.title) }],
    empty: emptyState({ icon: "Award", title: "No results yet", text: "Results appear here once your instructors publish them." }),
  });
}

function gradeTone(r) {
  if (r.result !== "pass") return r.result === "fail" ? "rust" : "slate";
  if (r.percent >= 80) return "green";
  if (r.percent >= 60) return "blue";
  return "amber";
}

function refresh() {
  const upcoming = upcomingExams();
  const results = resultRows();
  const trs = transcripts();
  const gpa = sel.gpaFor(ctx.user.id);
  const scored = results.filter((r) => r.percent != null);
  const avg = scored.length ? scored.reduce((t, r) => t + r.percent, 0) / scored.length : null;
  const passed = results.filter((r) => r.result === "pass").length;

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "CalendarClock", label: "Upcoming exams", value: String(upcoming.length), tone: "blue" }),
    statCard({ icon: "Award", label: "GPA (10-point)", value: gpa == null ? "—" : gpa.toFixed(2), tone: "purple" }),
    statCard({ icon: "Target", label: "Average score", value: avg == null ? "—" : pct(avg, 1), tone: "green" }),
    statCard({ icon: "CircleCheck", label: "Exams passed", value: results.length ? `${passed}/${results.length}` : "—", tone: results.length && passed < results.length ? "amber" : "slate" }),
  ].join("");

  qs('[data-count="upcoming"]', ctx.root).textContent = upcoming.length;
  qs('[data-count="results"]', ctx.root).textContent = results.length;
  qs('[data-count="transcripts"]', ctx.root).textContent = trs.length;

  qs("[data-upcoming]", ctx.root).innerHTML = upcoming.length
    ? html`<div class="grid grid-2">${upcoming.map(examCard)}</div>`
    : emptyState({ icon: "CalendarClock", title: "No upcoming exams", text: "When an exam is scheduled for your batch it will appear here with your admit card." });

  resultsTable.update(results);

  qs("[data-transcripts]", ctx.root).innerHTML = trs.length
    ? html`<div class="stack-sm">${trs.map((t) => html`
        <div class="file-tile">
          <span class="icon-tile tone-purple">${raw(icon("FileBadge", { size: 18 }))}</span>
          <div class="file-tile-main">
            <div class="file-tile-name">Academic transcript · ${t.serialNo}</div>
            <div class="file-tile-meta">Issued ${dateTime(t.issuedAt)} · GPA ${t.snapshot?.gpa == null ? "—" : Number(t.snapshot.gpa).toFixed(2)} · ${plural((t.snapshot?.results || []).length, "result")}</div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-transcript="${t.id}">${raw(icon("Printer", { size: 15 }))}Print</button>
        </div>`)}</div>`
    : emptyState({ icon: "FileBadge", title: "No transcripts issued", text: "Transcripts are issued by the academy office. Ask the Admin office if you need one." });
}

function examCard(exam) {
  const days = diffDays(exam.date, today());
  const elig = sel.examEligible(ctx.user.id, exam);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days to go`;
  const d = new Date(exam.date + "T00:00:00");
  return html`
    <div class="card exam-card">
      <div class="card-body stack-sm">
        <div class="exam-card-top">
          <div class="exam-date tone-${raw(days <= 3 ? "amber" : "blue")}">
            <span class="exam-date-day">${String(d.getDate())}</span>
            <span class="exam-date-mon">${d.toLocaleString("en-IN", { month: "short" })}</span>
          </div>
          <div class="exam-card-main">
            <h3 class="card-title">${exam.cycle || exam.title}</h3>
            <p class="card-subtitle">${courseTitle(exam)}</p>
          </div>
          <span class="badge tone-${raw(days <= 3 ? "amber" : "blue")}">${when}</span>
        </div>
        <ul class="exam-meta">
          <li>${raw(icon("Calendar", { size: 14 }))}${weekdayShort(exam.date)}, ${date(exam.date)}</li>
          <li>${raw(icon("Clock", { size: 14 }))}${timeRange(exam.start, exam.end)}</li>
          <li>${raw(icon("MapPin", { size: 14 }))}${exam.room || "Room to be announced"}</li>
          <li>${raw(icon("Target", { size: 14 }))}Max ${exam.maxMarks} · pass ${exam.passMarks}</li>
        </ul>
        ${elig.ok
          ? html`<div class="alert tone-green">${raw(icon("BadgeCheck", { size: 18 }))}<div class="alert-body">You're eligible to sit this exam.</div></div>`
          : html`<div class="alert tone-rust">${raw(icon("Ban", { size: 18 }))}<div class="alert-body"><p class="alert-title">Not eligible yet</p>${elig.reason}</div></div>`}
      </div>
      <div class="card-footer">
        <span class="text-sm text-muted">${badge(exam.status, exam.status === "marks-entry" ? "Marks entry" : "Scheduled")}</span>
        ${elig.ok
          ? html`<button type="button" class="btn btn-primary btn-sm" data-admit="${exam.id}">${raw(icon("Download", { size: 15 }))}Download admit card</button>`
          : html`<button type="button" class="btn btn-outline btn-sm" disabled>${raw(icon("Lock", { size: 15 }))}Admit card locked</button>`}
      </div>
    </div>`;
}

/* ---------- actions ---------- */

function printMarksheet(rows, title) {
  if (!rows.length) return toast("There are no published results to print yet.", { type: "info" });
  printDoc(title ? "Marksheet — " + title : "Statement of marks", marksheetDoc(me(), rows.map((r) => ({ title: r.title, course: r.course, marks: r.marks, maxMarks: r.maxMarks, absent: r.absent }))));
}

function wire() {
  on(ctx.root, "click", '[data-act="marksheet"]', () => printMarksheet(resultRows()));
  on(ctx.root, "click", "[data-admit]", (e, btn) => {
    const exam = store.byId("exams", btn.dataset.admit);
    if (!exam) return toast("That exam couldn't be found.", { type: "warning" });
    const elig = sel.examEligible(ctx.user.id, exam);
    if (!elig.ok) return toast(elig.reason, { type: "warning" });
    printDoc("Admit card — " + exam.title, admitCardDoc(exam, me()));
  });
  on(ctx.root, "click", "[data-transcript]", (e, btn) => {
    const t = store.byId("transcripts", btn.dataset.transcript);
    if (!t || t.studentId !== ctx.user.id) return toast("That transcript couldn't be found.", { type: "warning" });
    printDoc("Transcript " + t.serialNo, transcriptDoc(t));
  });
}

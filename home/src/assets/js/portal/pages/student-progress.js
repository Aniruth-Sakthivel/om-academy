/*
Author       : OM Academy
Description  : Student → Progress Reports. GPA / overall % / attendance / batch percentile KPIs, attendance trend,
               marks by exam, per-course performance radar, assignment completion donut, strengths & areas to
               improve, results table and a printable progress report.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import { html, raw, on, qs, toast, dataTable, statCard, emptyState, printDoc } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, pct, monthYear, ordinal } from "../core/format.js";
import { today, addMonths, monthKey, dateOf } from "../core/clock.js";
import { lineChart, barChart, radarChart, donutChart, palette } from "../core/charts.js";

let ctx;
let resultsTable;
let charts = [];
let chartToken = 0;

const onTheme = () => renderCharts();

boot({
  id: "student-progress",
  portal: "student",
  watch: ["attendanceSessions", "assignments", "submissions", "exams", "marks", "enrollments", "batches", "settings"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    window.addEventListener("om-portal:theme", onTheme);
  },
  update: () => refresh(),
  unmount() {
    window.removeEventListener("om-portal:theme", onTheme);
    destroyCharts();
    resultsTable?.destroy();
  },
});

/* ---------- data ---------- */

const uid = () => ctx.user.id;
const minPct = () => (store.get("settings").attendance || {}).minPct ?? 75;
const shortCourse = (course) => String(course?.title || "Course").split(" — ")[0];
const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pctClass = (v) => "pct-" + Math.max(0, Math.min(100, Math.round((Number(v) || 0) / 5) * 5));

function examRows() {
  return sel.examsForStudent(uid(), { publishedOnly: true }).map((e) => {
    const m = sel.marksFor(e.id, uid());
    const course = store.byId("courses", e.courseId);
    const p = m && !m.absent && m.marks != null ? (m.marks / e.maxMarks) * 100 : null;
    const result = !m ? "pending" : m.absent ? "absent" : m.marks >= (e.passMarks ?? 0) ? "pass" : "fail";
    return { id: e.id, title: e.title, cycle: e.cycle, courseId: e.courseId, course: course?.title || "—", courseShort: shortCourse(course), date: e.date, marks: m && !m.absent ? m.marks : null, absent: !!m?.absent, maxMarks: e.maxMarks, pct: p, grade: p == null ? "—" : sel.gradeFor(p).grade, result };
  });
}

// Assignment completion: submitted on time / late / missing (past due, nothing submitted) / not yet due
function assignmentStats(courseId) {
  const t = today();
  const out = { onTime: 0, late: 0, missing: 0, upcoming: 0, scores: [] };
  for (const a of sel.assignmentsForStudent(uid())) {
    if (courseId && a.courseId !== courseId) continue;
    const sub = sel.submissionFor(a.id, uid());
    if (sub) {
      if (sub.late) out.late++;
      else out.onTime++;
      if (sub.status === "graded" && sub.marks != null) out.scores.push((sub.marks / a.maxMarks) * 100);
    } else if (dateOf(a.dueAt) < t) out.missing++;
    else out.upcoming++;
  }
  return out;
}

function monthlyAttendance(months = 6) {
  const out = [];
  const batches = sel.activeBatchesOf(uid());
  for (let i = months - 1; i >= 0; i--) {
    const key = monthKey(addMonths(today(), -i));
    let present = 0;
    let countable = 0;
    for (const b of batches) {
      for (const s of sel.sessionsForBatch(b.id, { from: key + "-01", to: key + "-31" })) {
        const mark = s.records[uid()];
        if (!mark || mark === "E") continue;
        countable++;
        if (mark === "P" || mark === "L") present++;
      }
    }
    out.push({ key, pct: countable ? round1((present / countable) * 100) : null });
  }
  return out;
}

const METRICS = ["Exams", "Assignments", "Attendance", "On-time work", "Syllabus covered"];

function courseMetrics() {
  const rows = examRows();
  return sel.activeBatchesOf(uid()).map((batch) => {
    const course = sel.courseOf(batch);
    const asg = assignmentStats(batch.courseId);
    const due = asg.onTime + asg.late + asg.missing;
    const exams = avg(rows.filter((r) => r.courseId === batch.courseId && r.pct != null).map((r) => r.pct));
    return {
      batch,
      course,
      name: shortCourse(course),
      values: {
        Exams: round1(exams),
        Assignments: round1(avg(asg.scores)),
        Attendance: sel.attendanceStats(uid(), batch.id).pct,
        "On-time work": due ? round1((asg.onTime / due) * 100) : null,
        "Syllabus covered": sel.courseProgress(batch),
      },
    };
  });
}

function summary() {
  const rows = examRows();
  const gpa = sel.gpaFor(uid());
  const overall = round1(avg(rows.filter((r) => r.pct != null).map((r) => r.pct)));
  const att = sel.attendanceStats(uid());
  const percentiles = sel.activeBatchesOf(uid()).map((b) => sel.batchPercentile(uid(), b.id)).filter((p) => p != null);
  const percentile = percentiles.length ? Math.max(...percentiles) : null;
  return { rows, gpa, overall, att, percentile };
}

function insights(metrics, s) {
  const strengths = [];
  const improve = [];
  for (const m of metrics) {
    for (const key of METRICS) {
      const v = m.values[key];
      if (v == null || key === "Syllabus covered") continue;
      const item = { label: key, course: m.name, value: v };
      if (v >= 75) strengths.push(item);
      else if (v < 65 || (key === "Attendance" && v < minPct())) improve.push(item);
    }
  }
  for (const r of s.rows) {
    if (r.result === "fail") improve.push({ label: "Failed: " + r.cycle, course: r.courseShort, value: r.pct ?? 0 });
    if (r.result === "absent") improve.push({ label: "Missed: " + r.cycle, course: r.courseShort, value: 0 });
  }
  strengths.sort((a, b) => b.value - a.value);
  improve.sort((a, b) => a.value - b.value);
  return { strengths: strengths.slice(0, 5), improve: improve.slice(0, 5) };
}

/* ---------- layout ---------- */

function renderLayout() {
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Progress Reports</li></ol>
        <h1 class="page-title">Progress Reports</h1>
        <p class="page-subtitle">Your grades, attendance and coursework at a glance.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-outline" href="student-exams.html">${raw(icon("GraduationCap", { size: 16 }))}Exams &amp; results</a>
        <button type="button" class="btn btn-primary" data-act="report">${raw(icon("Printer", { size: 16 }))}Download progress report</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="grid grid-2 page-section">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Attendance trend</h3><p class="card-subtitle">Monthly attendance, last 6 months</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="trend"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Marks by exam</h3><p class="card-subtitle">Percentage scored in each published exam</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="marks"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Performance by course</h3><p class="card-subtitle">Exams, assignments, attendance, punctuality and syllabus (%)</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="radar"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Assignment completion</h3><p class="card-subtitle" data-asg-sub></p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="donut"></div></div>
      </div>
    </div>
    <div class="grid grid-2 page-section">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Strengths</h3><p class="card-subtitle">Where you're scoring 75% or more</p></div><span class="icon-tile icon-tile-sm tone-green">${raw(icon("TrendingUp", { size: 16 }))}</span></div>
        <div data-strengths></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Areas to improve</h3><p class="card-subtitle">Below 65%, below the attendance minimum, or missed</p></div><span class="icon-tile icon-tile-sm tone-amber">${raw(icon("Target", { size: 16 }))}</span></div>
        <div data-improve></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Results</h3><p class="card-subtitle">All published exam results</p></div></div>
      <div data-results></div>
    </div>`;

  resultsTable = dataTable(qs("[data-results]", ctx.root), {
    rows: [],
    searchKeys: ["title", "course"],
    filters: [{ key: "result", label: "Result", options: [["pass", "Pass"], ["fail", "Fail"], ["absent", "Absent"]] }],
    columns: [
      { key: "title", label: "Exam", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.cycle || r.title}</span><span class="cell-sub">${r.course}</span></div>` },
      { key: "date", label: "Date", sortable: true, hideBelow: "md", render: (r) => date(r.date) },
      { key: "marks", label: "Marks", sortable: true, align: "right", render: (r) => html`<span class="tabular">${r.absent ? "AB" : r.marks == null ? "—" : `${r.marks} / ${r.maxMarks}`}</span>` },
      { key: "pct", label: "%", sortable: true, align: "right", render: (r) => html`<span class="tabular fw-600">${r.pct == null ? "—" : pct(r.pct, 1)}</span>` },
      { key: "grade", label: "Grade", render: (r) => html`<span class="badge tone-${raw(r.pct == null ? "slate" : r.pct >= 75 ? "green" : r.pct >= 50 ? "blue" : r.pct >= 35 ? "amber" : "rust")}">${r.grade}</span>` },
      { key: "result", label: "Result", render: (r) => resultBadge(r.result) },
    ],
    rowActions: [{ label: "View in Exams", icon: "Eye", onClick: (r) => (window.location.href = "student-exams.html?id=" + encodeURIComponent(r.id)) }],
    empty: emptyState({ icon: "GraduationCap", title: "No published results yet", text: "Results show here as soon as your exams are published." }),
  });
}

function resultBadge(result) {
  const map = { pass: ["green", "Pass"], fail: ["rust", "Fail"], absent: ["amber", "Absent"], pending: ["slate", "Pending"] };
  const [tone, label] = map[result] || map.pending;
  return html`<span class="badge tone-${raw(tone)}">${label}</span>`;
}

/* ---------- refresh ---------- */

function refresh() {
  const s = summary();
  const min = minPct();
  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "Award", label: "GPA (10-point scale)", value: s.gpa == null ? "—" : s.gpa.toFixed(2), tone: "blue" }),
    statCard({ icon: "Target", label: "Overall exam score", value: s.overall == null ? "—" : pct(s.overall, 1), tone: s.overall == null ? "slate" : s.overall >= 60 ? "green" : "amber" }),
    statCard({ icon: "CalendarCheck", label: `Attendance (min ${min}%)`, value: pct(s.att.pct, 1), tone: s.att.pct >= min ? "green" : s.att.pct >= min - 10 ? "amber" : "rust", href: "student-attendance.html" }),
    statCard({ icon: "TrendingUp", label: "Batch percentile (anonymous)", value: s.percentile == null ? "—" : ordinal(s.percentile), tone: "purple" }),
  ].join("");

  const metrics = courseMetrics();
  const ins = insights(metrics, s);
  qs("[data-strengths]", ctx.root).innerHTML = insightList(ins.strengths, "green", "TrendingUp", { icon: "Sparkles", title: "Keep going", text: "Strengths appear once you score 75% or more in an area." });
  qs("[data-improve]", ctx.root).innerHTML = insightList(ins.improve, "amber", "Target", { icon: "CircleCheck", title: "Nothing flagged", text: "No area is below 65% right now. Nice work!" });

  resultsTable.update(s.rows);
  renderCharts();
}

function insightList(items, tone, iconName, empty) {
  if (!items.length) return html`<div class="card-body">${raw(emptyState(empty))}</div>`;
  return html`<ul class="list-plain">${raw(
    items
      .map(
        (it) => html`
          <li class="list-row">
            <span class="icon-tile icon-tile-sm tone-${raw(tone)}">${raw(icon(iconName, { size: 16 }))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${it.label}</div>
              <div class="list-row-sub">${it.course}</div>
              <div class="progress progress-sm tone-${raw(tone)} prog-bar"><span class="progress-bar ${raw(pctClass(it.value))}"></span></div>
            </div>
            <span class="prog-value">${pct(it.value, 0)}</span>
          </li>`
      )
      .join("")
  )}</ul>`;
}

/* ---------- charts ---------- */

function destroyCharts() {
  charts.forEach((p) => p.then((c) => c?.destroy()).catch(() => {}));
  charts = [];
}

function chartEl(name) {
  const el = qs(`[data-chart="${name}"]`, ctx.root);
  el.innerHTML = "";
  return el;
}

function track(promise, el) {
  const token = chartToken;
  charts.push(
    promise
      .then((c) => (token === chartToken ? c : (c?.destroy(), null)))
      .catch((err) => {
        console.error(err);
        el.innerHTML = html`<p class="text-muted text-sm m-0">This chart couldn't load. Try reloading the page.</p>`;
        return null;
      })
  );
}

function renderCharts() {
  destroyCharts();
  chartToken++;
  const p = palette();
  const min = minPct();

  // Attendance trend
  const trend = monthlyAttendance(6);
  const trendEl = chartEl("trend");
  if (trend.every((m) => m.pct == null)) trendEl.innerHTML = emptyState({ icon: "CalendarCheck", title: "No attendance yet", text: "Your monthly trend appears once classes are marked." });
  else
    track(
      lineChart(trendEl, {
        series: [{ name: "Attendance", data: trend.map((m) => m.pct) }, { name: `Minimum (${min}%)`, data: trend.map(() => min) }],
        categories: trend.map((m) => monthYear(m.key + "-01")),
        colors: [p.primary, p.danger],
        yFormatter: (v) => (v == null ? "—" : Math.round(v) + "%"),
        height: 250,
      }),
      trendEl
    );

  // Marks by exam
  const rows = examRows().filter((r) => r.pct != null);
  const marksEl = chartEl("marks");
  if (!rows.length) marksEl.innerHTML = emptyState({ icon: "ChartColumn", title: "No marks yet", text: "Published exam marks will be charted here." });
  else
    track(
      barChart(marksEl, {
        series: [{ name: "Score", data: rows.map((r) => Math.round(r.pct)) }],
        categories: rows.map((r) => `${r.cycle} · ${r.courseShort}`),
        colors: [p.primary],
        yFormatter: (v) => Math.round(v) + "%",
        height: 250,
      }),
      marksEl
    );

  // Radar per course
  const metrics = courseMetrics();
  const radarEl = chartEl("radar");
  if (!metrics.length) radarEl.innerHTML = emptyState({ icon: "ChartPie", title: "No active courses", text: "Enrol in a course to see your performance profile." });
  else
    track(
      radarChart(radarEl, {
        series: metrics.map((m) => ({ name: m.name, data: METRICS.map((k) => Math.round(m.values[k] ?? 0)) })),
        categories: METRICS,
        colors: p.series,
        height: 280,
      }),
      radarEl
    );

  // Assignment completion donut
  const asg = assignmentStats();
  const total = asg.onTime + asg.late + asg.missing + asg.upcoming;
  qs("[data-asg-sub]", ctx.root).textContent = total ? `${total} assignments · ${asg.onTime + asg.late} submitted` : "No assignments yet";
  const donutEl = chartEl("donut");
  if (!total) donutEl.innerHTML = emptyState({ icon: "ClipboardList", title: "No assignments yet", text: "Your submission record appears here." });
  else
    track(
      donutChart(donutEl, {
        series: [asg.onTime, asg.late, asg.missing, asg.upcoming],
        labels: ["On time", "Late", "Missing", "Not yet due"],
        colors: [p.success, p.warning, p.danger, p.slate],
        centerLabel: "Assignments",
        height: 260,
      }),
      donutEl
    );
}

/* ---------- printable report ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="report"]', () => {
    try {
      printDoc("Progress report — " + ctx.user.name, reportDoc());
    } catch (err) {
      console.error(err);
      toast("Couldn't prepare the progress report. Please try again.", { type: "danger" });
    }
  });
}

function reportDoc() {
  const s = summary();
  const metrics = courseMetrics();
  const ins = insights(metrics, s);
  const asg = assignmentStats();
  const inst = store.get("settings").institution || { name: "OM Academy" };
  const center = sel.centerOf(ctx.user);
  const cell = (v) => (v == null ? "—" : pct(v, 0));
  return html`
    <div class="print-sheet">
      <div class="print-head">
        <div class="print-brand">
          <span class="print-mark">OM</span>
          <div>
            <div class="print-org">${inst.name}</div>
            ${inst.address ? html`<div class="print-org-sub">${inst.address}</div>` : raw("")}
            <div class="print-org-sub">${[inst.phone, inst.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="print-doc">
          <div class="print-doc-title">Progress report</div>
          <div class="print-meta">Generated ${date(today())}</div>
        </div>
      </div>
      <div class="print-grid">
        <div>
          <div class="print-label">Student</div>
          <div><strong>${ctx.user.name}</strong></div>
          ${ctx.user.rollNo ? html`<div>Roll no. ${ctx.user.rollNo}</div>` : raw("")}
          ${ctx.user.email ? html`<div>${ctx.user.email}</div>` : raw("")}
          ${center ? html`<div>${center.name}</div>` : raw("")}
        </div>
        <div>
          <div class="print-label">Summary</div>
          <div>GPA: <strong>${s.gpa == null ? "—" : s.gpa.toFixed(2)}</strong> / 10</div>
          <div>Overall exam score: <strong>${s.overall == null ? "—" : pct(s.overall, 1)}</strong></div>
          <div>Attendance: <strong>${pct(s.att.pct, 1)}</strong> (minimum ${minPct()}%)</div>
          <div>Batch percentile: <strong>${s.percentile == null ? "—" : ordinal(s.percentile)}</strong></div>
        </div>
      </div>
      <table class="print-table">
        <thead><tr><th>Course</th><th class="num">Exams</th><th class="num">Assignments</th><th class="num">Attendance</th><th class="num">On-time work</th><th class="num">Syllabus</th></tr></thead>
        <tbody>${raw(
          metrics.length
            ? metrics.map((m) => html`<tr><td>${m.course?.title || m.name}</td><td class="num">${cell(m.values.Exams)}</td><td class="num">${cell(m.values.Assignments)}</td><td class="num">${cell(m.values.Attendance)}</td><td class="num">${cell(m.values["On-time work"])}</td><td class="num">${cell(m.values["Syllabus covered"])}</td></tr>`).join("")
            : html`<tr><td colspan="6">No active courses.</td></tr>`
        )}</tbody>
      </table>
      <table class="print-table">
        <thead><tr><th>Examination</th><th>Date</th><th class="num">Marks</th><th class="num">%</th><th>Grade</th><th>Result</th></tr></thead>
        <tbody>${raw(
          s.rows.length
            ? s.rows.map((r) => html`<tr><td>${r.title}</td><td>${date(r.date)}</td><td class="num">${r.absent ? "AB" : r.marks == null ? "—" : `${r.marks} / ${r.maxMarks}`}</td><td class="num">${r.pct == null ? "—" : pct(r.pct, 1)}</td><td>${r.grade}</td><td>${r.result === "pass" ? "Pass" : r.result === "fail" ? "Fail" : r.result === "absent" ? "Absent" : "Pending"}</td></tr>`).join("")
            : html`<tr><td colspan="6">No published results yet.</td></tr>`
        )}</tbody>
      </table>
      <div class="print-grid">
        <div>
          <div class="print-label">Assignments</div>
          <div>On time: <strong>${asg.onTime}</strong> · Late: <strong>${asg.late}</strong> · Missing: <strong>${asg.missing}</strong> · Not yet due: <strong>${asg.upcoming}</strong></div>
          <div>Attendance: ${s.att.present} present (incl. ${s.att.late} late), ${s.att.absent} absent, ${s.att.excused} excused</div>
        </div>
        <div>
          <div class="print-label">Strengths</div>
          <div>${ins.strengths.length ? ins.strengths.map((i) => `${i.label} (${i.course}) ${pct(i.value, 0)}`).join("; ") : "—"}</div>
          <div class="print-label">Areas to improve</div>
          <div>${ins.improve.length ? ins.improve.map((i) => `${i.label} (${i.course}) ${pct(i.value, 0)}`).join("; ") : "None flagged"}</div>
        </div>
      </div>
      <div class="print-sign"><div>Class teacher</div><div>Center director</div></div>
      <div class="print-foot">Computer-generated progress report from the OM Academy portal. Batch percentile is anonymous and based on published results.</div>
    </div>`;
}

/*
Author       : OM Academy
Description  : Student → Dashboard. Greeting, KPIs, today's classes, upcoming deadlines, announcements,
               recent grades, attendance radial and quick links.
               Pattern: mount() renders the layout once; refresh() repaints every dynamic block (live updates).
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, modal, statCard, emptyState } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, date, dateShort, time, dueIn, relative, weekdayLong, pct, truncate } from "../core/format.js";
import { today, now, addDays, diffDays, dateOf, minutes } from "../core/clock.js";
import { radialChart, palette } from "../core/charts.js";
import { run } from "../core/errors.js";

let ctx;
let charts = [];
let chartToken = 0;
let chartKey = "";

const onTheme = () => {
  chartKey = "";
  refresh();
};

boot({
  id: "student-dashboard",
  portal: "student",
  watch: ["attendanceSessions", "assignments", "submissions", "exams", "marks", "invoices", "payments", "announcements", "notifications", "timetableSlots", "enrollments", "events", "settings"],
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
  },
});

/* ---------- helpers ---------- */

const firstName = () => String(ctx.user.name || "there").trim().split(/\s+/)[0];
const minPct = () => (store.get("settings").attendance || {}).minPct ?? 75;
const shortCourse = (course) => String(course?.title || "Course").split(" — ")[0];

function greeting() {
  const h = now().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function attendanceTone(p) {
  const min = minPct();
  return p >= min ? "green" : p >= min - 10 ? "amber" : "rust";
}

function pctTone(p) {
  return p >= 75 ? "green" : p >= 50 ? "blue" : p >= 35 ? "amber" : "rust";
}

/* ---------- layout ---------- */

function renderLayout() {
  ctx.root.innerHTML = html`
    <div data-welcome></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="grid grid-main-side page-section">
      <div class="stack">
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Today's classes</h3><p class="card-subtitle" data-today-sub></p></div><a class="btn btn-ghost btn-sm" href="student-courses.html">Full timetable</a></div>
          <div data-today></div>
        </div>
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Upcoming deadlines</h3><p class="card-subtitle">Assignments and exams in the next 14 days</p></div><a class="btn btn-ghost btn-sm" href="student-calendar.html">Calendar</a></div>
          <div data-deadlines></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Attendance</h3><p class="card-subtitle" data-att-sub></p></div><a class="btn btn-ghost btn-sm" href="student-attendance.html">Details</a></div>
          <div class="card-body">
            <div class="chart-box-sm" data-chart-att></div>
            <div data-att-stats></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Quick links</h3></div>
          <div class="card-body">
            <div class="dash-quick">
              ${raw(quickLink("student-fees.html", "Wallet", "Pay fees", "amber"))}
              ${raw(quickLink("student-assignments.html", "Upload", "Submit assignment", "purple"))}
              ${raw(quickLink("student-courses.html", "CalendarClock", "Timetable", "blue"))}
              ${raw(quickLink("student-resources.html", "FolderOpen", "Resources", "green"))}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Announcements</h3><p class="card-subtitle" data-ann-sub></p></div><a class="btn btn-ghost btn-sm" href="student-notifications.html">View all</a></div>
        <div data-announcements></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Recent grades</h3><p class="card-subtitle">Graded assignments and published exam results</p></div><a class="btn btn-ghost btn-sm" href="student-progress.html">Progress</a></div>
        <div data-grades></div>
      </div>
    </div>`;
}

function quickLink(href, iconName, label, tone) {
  return html`<a class="dash-quick-link" href="${href}"><span class="icon-tile icon-tile-sm tone-${raw(tone)}">${raw(icon(iconName, { size: 16 }))}</span><span>${label}</span></a>`;
}

/* ---------- refresh ---------- */

function refresh() {
  const d = sel.studentDashboard(ctx.user);
  renderWelcome(d);
  renderKpis(d);
  renderToday(d.todaySessions);
  renderDeadlines();
  renderAnnouncements();
  renderGrades();
  renderAttendance(d.attendance);
}

function renderWelcome(d) {
  const center = sel.centerOf(ctx.user);
  qs("[data-welcome]", ctx.root).innerHTML = html`
    <div class="welcome-card page-section">
      <div class="dash-welcome-main">
        <h2>${greeting()}, ${firstName()}</h2>
        <p>${weekdayLong(today())}, ${date(today())} · ${center?.name || "OM Academy"}</p>
        ${d.batches.length ? html`<div class="dash-welcome-chips">${raw(d.batches.map((b) => html`<span class="dash-welcome-chip">${b.name}</span>`).join(""))}</div>` : raw("")}
      </div>
      <div class="dash-welcome-actions">
        <a class="btn dash-welcome-btn" href="student-assignments.html">${raw(icon("ClipboardList", { size: 16 }))}Assignments</a>
        <a class="btn dash-welcome-btn" href="student-calendar.html">${raw(icon("CalendarDays", { size: 16 }))}Calendar</a>
      </div>
    </div>`;
}

function renderKpis(d) {
  const att = d.attendance;
  let examValue = "None";
  let examTone = "slate";
  if (d.nextExam) {
    const days = diffDays(d.nextExam.date, today());
    examValue = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
    examTone = days <= 7 ? "amber" : "blue";
  }
  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "CalendarCheck", label: `Attendance (min ${minPct()}%)`, value: pct(att.pct, 1), tone: attendanceTone(att.pct), href: "student-attendance.html" }),
    statCard({ icon: "ClipboardList", label: "Pending assignments", value: String(d.pendingAssignments), tone: d.pendingAssignments ? "purple" : "slate", href: "student-assignments.html" }),
    statCard({ icon: "GraduationCap", label: d.nextExam ? "Next exam in" : "Next exam", value: examValue, tone: examTone, href: d.nextExam ? `student-exams.html?id=${encodeURIComponent(d.nextExam.id)}` : "student-exams.html" }),
    statCard({ icon: "Wallet", label: d.fees.overdue ? "Fee balance (overdue)" : "Fee balance", value: money(d.fees.balance), tone: d.fees.overdue ? "rust" : d.fees.balance ? "amber" : "green", href: "student-fees.html" }),
  ].join("");
}

function renderToday(slots) {
  const t = today();
  const holiday = sel.eventsVisibleTo(ctx.user).find((e) => e.type === "holiday" && dateOf(e.start) <= t && dateOf(e.end || e.start) >= t);
  const sub = qs("[data-today-sub]", ctx.root);
  const box = qs("[data-today]", ctx.root);
  sub.textContent = `${weekdayLong(t)} · ${slots.length === 1 ? "1 class" : slots.length + " classes"}`;
  if (holiday) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "CalendarX", title: holiday.title, text: "The academy is closed today. Enjoy the holiday!" }))}</div>`;
    return;
  }
  if (!slots.length) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "Calendar", title: "No classes today", text: "Use the free time to revise or catch up on assignments." }))}</div>`;
    return;
  }
  const nowMin = now().getHours() * 60 + now().getMinutes();
  box.innerHTML = html`<ul class="list-plain">${raw(
    slots
      .map((s) => {
        const instructor = store.byId("users", s.instructorId);
        const state = nowMin >= minutes(s.end) ? "done" : nowMin >= minutes(s.start) ? "now" : "next";
        const stateBadge = state === "now" ? html`<span class="badge tone-green">In progress</span>` : state === "done" ? html`<span class="badge tone-slate">Done</span>` : html`<span class="badge tone-blue">Upcoming</span>`;
        return html`
          <li class="list-row ${raw(state === "now" ? "is-now" : "")}">
            <div class="dash-time"><div class="dash-time-start">${time(s.start)}</div><div class="dash-time-end">${time(s.end)}</div></div>
            <span class="icon-tile icon-tile-sm tone-${raw(s.course?.tone || "blue")}">${raw(icon("BookOpen", { size: 16 }))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${s.course?.title || "Class"}</div>
              <div class="list-row-sub">${[s.room ? "Room " + s.room : null, instructor?.name].filter(Boolean).join(" · ") || s.batch?.name || ""}</div>
            </div>
            ${stateBadge}
          </li>`;
      })
      .join("")
  )}</ul>`;
}

function deadlineItems() {
  const uid = ctx.user.id;
  const t = today();
  const end = addDays(t, 14);
  const items = [];
  for (const a of sel.assignmentsForStudent(uid)) {
    const status = sel.assignmentStatusFor(a, uid);
    if (!["pending", "overdue-allowed"].includes(status)) continue;
    if (dateOf(a.dueAt) > end) continue;
    const course = store.byId("courses", a.courseId);
    items.push({ kind: "Assignment", icon: "ClipboardList", tone: status === "overdue-allowed" ? "rust" : "purple", title: a.title, sub: `${shortCourse(course)} · due ${date(a.dueAt)}`, when: a.dueAt, overdue: status === "overdue-allowed", href: `student-assignments.html?id=${encodeURIComponent(a.id)}` });
  }
  for (const e of sel.examsForStudent(uid)) {
    if (e.date < t || e.date > end) continue;
    items.push({ kind: "Exam", icon: "GraduationCap", tone: "amber", title: e.title, sub: `${date(e.date)} · ${time(e.start)}${e.room ? " · Room " + e.room : ""}`, when: e.date, overdue: false, href: `student-exams.html?id=${encodeURIComponent(e.id)}` });
  }
  return items.sort((a, b) => dateOf(a.when).localeCompare(dateOf(b.when)));
}

function renderDeadlines() {
  const items = deadlineItems();
  const box = qs("[data-deadlines]", ctx.root);
  if (!items.length) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "CircleCheck", title: "You're all caught up", text: "No assignments or exams due in the next two weeks." }))}</div>`;
    return;
  }
  box.innerHTML = html`<ul class="list-plain">${raw(
    items
      .slice(0, 6)
      .map(
        (it) => html`
          <li><a class="list-row" href="${it.href}">
            <span class="icon-tile icon-tile-sm tone-${raw(it.tone)}">${raw(icon(it.icon, { size: 16 }))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${it.title}</div>
              <div class="list-row-sub">${it.kind} · ${it.sub}</div>
            </div>
            <span class="badge tone-${raw(it.overdue ? "rust" : diffDays(dateOf(it.when), today()) <= 2 ? "amber" : "slate")}">${dueIn(it.when)}</span>
          </a></li>`
      )
      .join("")
  )}</ul>`;
}

function announcementItems() {
  return sel.unifiedFeed(ctx.user).filter((n) => n.kind === "announcement");
}

function renderAnnouncements() {
  const items = announcementItems();
  const unread = items.filter((n) => !n.readAt).length;
  qs("[data-ann-sub]", ctx.root).textContent = unread ? `${unread} unread` : "You're up to date";
  const box = qs("[data-announcements]", ctx.root);
  if (!items.length) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "Megaphone", title: "No announcements", text: "Notices from the academy will appear here." }))}</div>`;
    return;
  }
  box.innerHTML = html`<ul class="list-plain">${raw(
    items
      .slice(0, 5)
      .map(
        (n) => html`
          <li class="list-row ${raw(n.readAt ? "" : "is-unread")}">
            <span class="icon-tile icon-tile-sm tone-${raw(n.priority === "high" || n.priority === "urgent" ? "rust" : "blue")}">${raw(icon("Megaphone", { size: 16 }))}</span>
            <button type="button" class="list-row-main dash-ann-open" data-ann-open="${n.id}">
              <span class="list-row-title">${n.title}</span>
              <span class="list-row-sub">${relative(n.createdAt)} · ${truncate(n.body, 80)}</span>
            </button>
            ${n.readAt
              ? raw("")
              : html`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-ann-read="${n.id}" aria-label="Mark as read" title="Mark as read">${raw(icon("Check", { size: 15 }))}</button>`}
          </li>`
      )
      .join("")
  )}</ul>`;
}

function gradeItems() {
  const uid = ctx.user.id;
  const items = [];
  for (const s of store.where("submissions", (x) => x.studentId === uid && x.status === "graded")) {
    const a = store.byId("assignments", s.assignmentId);
    if (!a) continue;
    items.push({ kind: "Assignment", icon: "ClipboardList", title: a.title, marks: s.marks, max: a.maxMarks, at: s.gradedAt || s.submittedAt, href: `student-assignments.html?id=${encodeURIComponent(a.id)}` });
  }
  for (const e of sel.examsForStudent(uid, { publishedOnly: true })) {
    const m = sel.marksFor(e.id, uid);
    if (!m) continue;
    items.push({ kind: "Exam", icon: "GraduationCap", title: e.title, marks: m.absent ? null : m.marks, absent: m.absent, max: e.maxMarks, at: e.publishedAt || e.date, href: `student-exams.html?id=${encodeURIComponent(e.id)}` });
  }
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function renderGrades() {
  const items = gradeItems();
  const box = qs("[data-grades]", ctx.root);
  if (!items.length) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "Award", title: "No grades yet", text: "Grades appear here once your work is marked." }))}</div>`;
    return;
  }
  box.innerHTML = html`<ul class="list-plain">${raw(
    items
      .slice(0, 6)
      .map((g) => {
        const p = g.marks == null ? null : (g.marks / g.max) * 100;
        const grade = p == null ? null : sel.gradeFor(p);
        return html`
          <li><a class="list-row" href="${g.href}">
            <span class="icon-tile icon-tile-sm tone-${raw(g.kind === "Exam" ? "amber" : "purple")}">${raw(icon(g.icon, { size: 16 }))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${g.title}</div>
              <div class="list-row-sub">${g.kind} · ${dateShort(g.at)}</div>
            </div>
            <div class="dash-row-end">
              <span class="fw-600 text-title tabular">${g.absent ? "Absent" : `${g.marks}/${g.max}`}</span>
              ${grade ? html`<span class="badge tone-${raw(pctTone(p))}">${grade.grade}</span>` : html`<span class="badge tone-slate">—</span>`}
            </div>
          </a></li>`;
      })
      .join("")
  )}</ul>`;
}

/* ---------- attendance ---------- */

function renderAttendance(att) {
  const tone = attendanceTone(att.pct);
  const min = minPct();
  const needed = sel.classesNeededFor75(ctx.user.id);
  qs("[data-att-sub]", ctx.root).textContent = `${att.total} classes marked · minimum ${min}%`;
  qs("[data-att-stats]", ctx.root).innerHTML = html`
    <div class="dash-att-stats">
      <div class="dash-att-stat"><strong>${att.present - att.late}</strong><span>Present</span></div>
      <div class="dash-att-stat"><strong>${att.late}</strong><span>Late</span></div>
      <div class="dash-att-stat"><strong>${att.absent}</strong><span>Absent</span></div>
      <div class="dash-att-stat"><strong>${att.excused}</strong><span>Excused</span></div>
    </div>
    ${att.pct < min
      ? html`<div class="alert tone-rust dash-att-alert">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">Below the ${min}% minimum.${needed ? ` Attend the next ${needed} classes to get back on track.` : ""}</div></div>`
      : raw("")}`;

  const key = `${att.pct}|${tone}`;
  if (key === chartKey) return;
  chartKey = key;
  destroyCharts();
  const token = ++chartToken;
  const el = qs("[data-chart-att]", ctx.root);
  el.innerHTML = "";
  const p = palette();
  const color = tone === "green" ? p.success : tone === "amber" ? p.warning : p.danger;
  charts.push(
    radialChart(el, { series: [att.pct], labels: ["Attendance"], colors: [color], height: 220 })
      .then((c) => (token === chartToken ? c : (c?.destroy(), null)))
      .catch((err) => {
        console.error(err);
        el.innerHTML = html`<p class="text-muted text-sm m-0">The chart couldn't load. Your attendance is ${pct(att.pct, 1)}.</p>`;
        return null;
      })
  );
}

function destroyCharts() {
  charts.forEach((p) => p.then((c) => c?.destroy()).catch(() => {}));
  charts = [];
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", "[data-ann-read]", (e, btn) => {
    run(() => services.markNotificationRead(ctx.user, btn.dataset.annRead), { success: "Marked as read", error: "Couldn't mark it as read" });
  });
  on(ctx.root, "click", "[data-ann-open]", (e, btn) => openAnnouncement(btn.dataset.annOpen));
}

function openAnnouncement(id) {
  const n = announcementItems().find((x) => x.id === id);
  if (!n) {
    toast("That announcement couldn't be found — it may have expired.", { type: "warning" });
    return;
  }
  const high = n.priority === "high" || n.priority === "urgent";
  const m = modal.open({
    title: n.title,
    size: "md",
    body: html`
      <div class="cluster section-gap">
        <span class="badge tone-${raw(high ? "rust" : "blue")}">${high ? "Important" : "Announcement"}</span>
        <span class="text-muted text-sm">${date(n.createdAt)}</span>
      </div>
      <p class="dash-ann-body m-0">${n.body || ""}</p>`,
    footer: html`<a class="btn btn-outline" href="student-notifications.html">All notifications</a><button type="button" class="btn btn-primary" data-m="close">Close</button>`,
  });
  m.root.querySelector('[data-m="close"]').addEventListener("click", m.close);
  if (!n.readAt) run(() => services.markNotificationRead(ctx.user, n.id), { error: "Couldn't mark it as read" });
}

/*
Author       : OM Academy
Description  : Staff → Dashboard. Adapts to the signed-in role:
                 - administrator: institution-wide KPIs, revenue, enrolments, attendance, activity, events, payments;
                 - teacher (scope "assigned"): own batches, today's classes, grading queue, scoped attendance;
                 - accountant: collections, dues aging, overdue invoices, recent payments.
               Every widget is permission-gated; numbers come from selectors so they match the other pages.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import { html, raw, qs, badge, statCard, emptyState, avatar } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, moneyShort, date, dateShort, relative, monthYear, pct, num, timeRange, weekdayLong, plural, truncate } from "../core/format.js";
import { today, addDays, startOfWeek, weekday, dateOf, diffDays, now } from "../core/clock.js";
import { areaChart, barChart, donutChart, lineChart, palette } from "../core/charts.js";
import { paymentMethodLabel } from "../core/docs.js";

let ctx;
const live = new Map(); // chart key → { p: Promise<ApexCharts|null>, el, empty }
let layoutSig = "";

boot({
  id: "admin-dashboard",
  portal: "admin",
  perm: ["dashboard.view"],
  watch: ["users", "enrollments", "batches", "courses", "payments", "invoices", "attendanceSessions", "submissions", "assignments", "leaveRequests", "exams", "events", "activity", "threads", "forumPosts", "timetableSlots", "settings", "roles"],
  mount(c) {
    ctx = c;
    render();
  },
  update: () => render(),
  unmount() {
    destroyCharts();
  },
});

/* ---------- helpers ---------- */

const userById = (id) => store.byId("users", id);
const pctClass = (v) => "pct-" + Math.max(0, Math.min(100, Math.round((Number(v) || 0) / 5) * 5));
function destroyCharts() {
  live.forEach((entry) => entry.p.then((c) => c?.destroy()).catch(() => {}));
  live.clear();
}

// Create a chart the first time; afterwards update its data in place (no destroy/recreate on live updates).
function upsertChart(key, el, spec) {
  const cur = live.get(key);
  if (cur && cur.el === el && !cur.empty && !spec.empty) {
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
    el.innerHTML = emptyState({ icon: "ChartColumn", title: "No data yet", text: "This chart fills in as records are added." });
    live.set(key, { p: Promise.resolve(null), el, empty: true });
    return;
  }
  el.innerHTML = "";
  live.set(key, { p: spec.create(el, spec).catch((err) => (console.error(err), null)), el, empty: false });
}

function scope() {
  const role = sel.roleOf(ctx.user);
  const assigned = role?.scope === "assigned";
  const batches = sel.batchesVisibleTo(ctx.user).filter((b) => b.status === "active");
  const batchIds = assigned ? new Set(batches.map((b) => b.id)) : null; // null = everything
  const isAdmin = ctx.can("*");
  const financeFocus = ctx.can("fees.view") && !ctx.can("courses.view");
  return { role, assigned, batches, batchIds, isAdmin, financeFocus };
}

const inScope = (s, batchId) => !s.batchIds || s.batchIds.has(batchId);

function scopedEnrollments(s) {
  return store.where("enrollments", (e) => e.status === "active" && inScope(s, e.batchId));
}

function batchAttendance(batchId) {
  let p = 0;
  let c = 0;
  for (const session of sel.sessionsForBatch(batchId)) {
    for (const m of Object.values(session.records || {})) {
      if (m === "E") continue;
      c++;
      if (m === "P" || m === "L") p++;
    }
  }
  return c ? Math.round((p / c) * 1000) / 10 : null;
}

// Weekly attendance % for the last 8 weeks (Mon-start), optionally limited to a set of batches
function attendanceTrend(s) {
  const first = addDays(startOfWeek(today()), -7 * 7);
  const agg = Array.from({ length: 8 }, () => ({ p: 0, c: 0 }));
  for (const session of store.get("attendanceSessions")) {
    if (session.date < first || session.date > today() || !inScope(s, session.batchId)) continue;
    const idx = Math.floor(diffDays(session.date, first) / 7);
    if (idx < 0 || idx > 7) continue;
    for (const m of Object.values(session.records || {})) {
      if (m === "E") continue;
      agg[idx].c++;
      if (m === "P" || m === "L") agg[idx].p++;
    }
  }
  return agg.map((a, i) => ({ label: dateShort(addDays(first, i * 7)), pct: a.c ? Math.round((a.p / a.c) * 1000) / 10 : null }));
}

function greeting() {
  const h = now().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const TASK_ICONS = { leave: "CalendarX", assignments: "ClipboardList", moderation: "Flag", invoices: "Receipt", inbox: "MessageSquare" };
const TASK_TONES = { leave: "amber", assignments: "purple", moderation: "rust", invoices: "rust", inbox: "blue" };
const taskKey = (href) => (href.match(/tab=([a-z]+)/) || [])[1] || "inbox";

/* ---------- card builders ---------- */

const cardHead = (title, subtitle, action = "") => html`
  <div class="card-header"><div><h3 class="card-title">${title}</h3>${subtitle ? html`<p class="card-subtitle">${subtitle}</p>` : raw("")}</div>${raw(action)}</div>`;

const viewAll = (href, label = "View all") => html`<a class="btn btn-ghost btn-sm" href="${href}">${label}${raw(icon("ChevronRight", { size: 14 }))}</a>`;

const chartCard = (key, title, subtitle, action = "") => html`
  <div class="card">${raw(cardHead(title, subtitle, action))}<div class="card-body"><div class="chart-box" data-chart="${key}"></div></div></div>`;

function tasksCard(tasks) {
  return html`
    <div class="card">
      ${raw(cardHead("Pending tasks", tasks.length ? `${plural(tasks.reduce((t, x) => t + x.count, 0), "item")} need attention` : "Nothing waiting on you"))}
      ${tasks.length
        ? html`<ul class="list-plain">${raw(
            tasks
              .map((t) => {
                const k = taskKey(t.href);
                return html`<li><a class="list-row" href="${t.href}"><span class="icon-tile icon-tile-sm tone-${raw(TASK_TONES[k] || "blue")}">${raw(icon(TASK_ICONS[k] || "ListChecks", { size: 16 }))}</span><div class="list-row-main"><div class="list-row-title">${t.label}</div><div class="list-row-sub">Open to review</div></div><span class="badge tone-${raw(TASK_TONES[k] || "blue")}">${t.count}</span>${raw(icon("ChevronRight", { size: 16, cls: "text-muted" }))}</a></li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "CircleCheck", title: "All caught up", text: "New leave requests, submissions and messages will appear here." }))}
    </div>`;
}

function batchesCard(s, title) {
  const list = s.batches.slice(0, 6);
  return html`
    <div class="card">
      ${raw(cardHead(title, s.assigned ? "Batches assigned to you" : `${plural(s.batches.length, "active batch", "active batches")}`, ctx.can("courses.view") ? viewAll("admin-courses.html") : ""))}
      ${list.length
        ? html`<ul class="list-plain">${raw(
            list
              .map((b) => {
                const students = store.count("enrollments", (e) => e.batchId === b.id && e.status === "active");
                const prog = sel.courseProgress(b);
                const att = batchAttendance(b.id);
                const min = (store.get("settings").attendance || {}).minPct ?? 75;
                return html`<li class="list-row dash-batch">
                  <div class="list-row-main">
                    <div class="list-row-title">${b.name}</div>
                    <div class="list-row-sub">${b.code} · ${plural(students, "student")} · ${att == null ? "no attendance yet" : "attendance " + pct(att, 1)}</div>
                    <div class="progress progress-sm tone-${raw(att != null && att < min ? "amber" : "blue")} dash-batch-progress"><span class="progress-bar ${raw(pctClass(prog))}"></span></div>
                  </div>
                  <span class="text-sm text-muted nowrap">${prog}% syllabus</span>
                </li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "Layers", title: "No active batches", text: s.assigned ? "You aren't assigned to any batch yet." : "Create a batch in Course Management." }))}
    </div>`;
}

function todayClassesCard(s) {
  const dow = weekday(today());
  const holiday = store.get("events").find((e) => e.type === "holiday" && dateOf(e.start) <= today() && dateOf(e.end || e.start) >= today());
  const slots = holiday
    ? []
    : store
        .where("timetableSlots", (x) => x.weekday === dow && inScope(s, x.batchId) && (!s.assigned || x.instructorId === ctx.user.id || s.batchIds.has(x.batchId)))
        .sort((a, b) => a.start.localeCompare(b.start));
  return html`
    <div class="card">
      ${raw(cardHead("Today's classes", weekdayLong(today()) + ", " + date(today())))}
      ${slots.length
        ? html`<ul class="list-plain">${raw(
            slots
              .map((x) => {
                const b = store.byId("batches", x.batchId);
                const marked = store.get("attendanceSessions").some((a) => a.slotId === x.id && a.date === today());
                return html`<li class="list-row"><span class="icon-tile icon-tile-sm tone-green">${raw(icon("Clock", { size: 16 }))}</span><div class="list-row-main"><div class="list-row-title">${b?.name || "Batch"}</div><div class="list-row-sub">${timeRange(x.start, x.end)} · ${x.room || "—"} · ${userById(x.instructorId)?.name || ""}</div></div>${raw(marked ? badge("present", "Marked") : ctx.can("attendance.mark") ? html`<a class="btn btn-outline btn-sm" href="admin-academics.html?tab=attendance">Mark</a>` : badge("pending", "Pending"))}</li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "CalendarCheck", title: holiday ? `Holiday — ${holiday.title}` : "No classes today", text: holiday ? "The academy is closed today." : "Enjoy the free day, or plan ahead in the timetable." }))}
    </div>`;
}

function gradingCard(s) {
  const asgIds = new Map(store.where("assignments", (a) => inScope(s, a.batchId)).map((a) => [a.id, a]));
  const subs = store
    .where("submissions", (x) => x.status === "submitted" && asgIds.has(x.assignmentId))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  return html`
    <div class="card">
      ${raw(cardHead("Grading queue", subs.length ? `${plural(subs.length, "submission")} waiting` : "Everything is graded", subs.length ? viewAll("admin-academics.html?tab=assignments", "Grade") : ""))}
      ${subs.length
        ? html`<ul class="list-plain">${raw(
            subs
              .slice(0, 6)
              .map((x) => {
                const st = userById(x.studentId);
                const a = asgIds.get(x.assignmentId);
                return html`<li><a class="list-row" href="admin-academics.html?tab=assignments">${raw(avatar({ name: st?.name, size: "sm" }))}<div class="list-row-main"><div class="list-row-title">${st?.name || "Student"}</div><div class="list-row-sub">${truncate(a?.title, 48)} · ${relative(x.submittedAt)}</div></div>${x.late ? raw(badge("late", "Late")) : raw("")}</a></li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "ClipboardList", title: "No submissions to grade", text: "New submissions from your batches will show up here." }))}
    </div>`;
}

function upcomingCard(s) {
  const end = addDays(today(), 14);
  const items = [];
  for (const e of sel.eventsVisibleTo(ctx.user)) {
    const st = dateOf(e.start);
    const en = dateOf(e.end || e.start);
    if (en >= today() && st <= end) items.push({ date: st < today() ? today() : st, title: e.title, sub: e.type === "holiday" ? "Holiday" : "Event", tone: e.type === "holiday" ? "rust" : "blue", icon: e.type === "holiday" ? "CalendarX" : "CalendarDays" });
  }
  if (ctx.can("courses.view") || ctx.can("exams.manage") || ctx.can("marks.enter")) {
    for (const ex of store.where("exams", (x) => x.date >= today() && x.date <= end && x.status !== "published" && inScope(s, x.batchId))) {
      items.push({ date: ex.date, title: ex.title, sub: `Exam · ${timeRange(ex.start, ex.end)}${ex.room ? " · " + ex.room : ""}`, tone: "amber", icon: "GraduationCap" });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return html`
    <div class="card">
      ${raw(cardHead("Upcoming", "Events, holidays and exams in the next 14 days", ctx.can("calendar.manage") ? viewAll("admin-settings.html?tab=calendar", "Calendar") : ""))}
      ${items.length
        ? html`<ul class="list-plain">${raw(
            items
              .slice(0, 7)
              .map((i) => html`<li class="list-row"><div class="dash-date tone-${raw(i.tone)}"><span class="dash-date-day">${i.date.slice(8, 10)}</span><span class="dash-date-mon">${monthYear(i.date).split(" ")[0]}</span></div><div class="list-row-main"><div class="list-row-title">${i.title}</div><div class="list-row-sub">${i.sub} · ${diffDays(i.date, today()) === 0 ? "Today" : diffDays(i.date, today()) === 1 ? "Tomorrow" : "in " + diffDays(i.date, today()) + " days"}</div></div></li>`)
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "CalendarDays", title: "Nothing scheduled", text: "No events or exams in the next two weeks." }))}
    </div>`;
}

function paymentsCard() {
  const list = store
    .where("payments", (p) => p.status === "success" && p.paidAt.slice(0, 10) <= today())
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, 6);
  return html`
    <div class="card">
      ${raw(cardHead("Recent payments", "Latest successful collections", viewAll("admin-fees.html?tab=payments")))}
      ${list.length
        ? html`<ul class="list-plain">${raw(
            list
              .map((p) => {
                const st = userById(p.studentId);
                return html`<li class="list-row">${raw(avatar({ name: st?.name, size: "sm" }))}<div class="list-row-main"><div class="list-row-title">${st?.name || "Student"}</div><div class="list-row-sub">${paymentMethodLabel(p.method)} · ${relative(p.paidAt)}</div></div><span class="money fw-600 text-success">${money(p.amount)}</span></li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "IndianRupee", title: "No payments yet", text: "Payments recorded or paid online will appear here." }))}
    </div>`;
}

function overdueCard() {
  const list = sel
    .overdueInvoices()
    .map((i) => ({ ...i, balance: Math.max(0, i.total - sel.paidAmount(i.id)) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6);
  return html`
    <div class="card">
      ${raw(cardHead("Overdue invoices", "Oldest first — send reminders from Fees", viewAll("admin-fees.html?tab=invoices")))}
      ${list.length
        ? html`<ul class="list-plain">${raw(
            list
              .map((i) => {
                const st = userById(i.studentId);
                return html`<li><a class="list-row" href="admin-fees.html?id=${i.id}">${raw(avatar({ name: st?.name, size: "sm" }))}<div class="list-row-main"><div class="list-row-title">${st?.name || "Student"}</div><div class="list-row-sub">${i.number} · ${plural(diffDays(today(), i.dueDate), "day")} overdue</div></div><span class="money fw-600 text-danger">${money(i.balance)}</span></a></li>`;
              })
              .join("")
          )}</ul>`
        : raw(emptyState({ icon: "BadgeCheck", title: "No overdue invoices", text: "Every due invoice has been paid." }))}
    </div>`;
}

const ACTION_TONES = { payment: "green", invoice: "amber", attendance: "blue", leave: "purple", assignment: "purple", announcement: "navy", settings: "slate", data: "rust", student: "blue", enrollment: "green", exam: "amber", marks: "amber", results: "green" };

function activityCard() {
  const list = sel.activityFeed(8);
  return html`
    <div class="card">
      ${raw(cardHead("Recent activity", "What staff and students did lately", ctx.can("activity.view") ? viewAll("admin-settings.html?tab=activity") : ""))}
      <div class="card-body">
        ${list.length
          ? html`<ul class="timeline">${raw(
              list
                .map((a) => {
                  const actor = userById(a.actorId);
                  const tone = ACTION_TONES[String(a.action).split(".")[0]] || "slate";
                  return html`<li class="timeline-item"><span class="timeline-dot tone-${raw(tone)}"></span><div><div class="timeline-title">${a.summary || a.action}</div><div class="timeline-meta">${actor?.name || "System"} · ${a.action} · ${relative(a.at)}</div></div></li>`;
                })
                .join("")
            )}</ul>`
          : raw(emptyState({ icon: "Activity", title: "No activity yet", text: "Actions such as payments, attendance and announcements are logged here." }))}
      </div>
    </div>`;
}

const slot = (key, markup) => ({ key, markup });

const row = (slots, cls) => {
  const list = slots.filter(Boolean);
  if (!list.length) return "";
  const gridCls = cls || (list.length === 1 ? "" : list.length === 2 ? "grid-2" : "grid-3");
  return html`<div class="grid ${raw(gridCls)} page-section">${raw(list.map((s) => html`<div class="dash-slot" data-slot="${s.key}">${raw(s.markup)}</div>`).join(""))}</div>`;
};

/* ---------- build ---------- */

function build() {
  const s = scope();
  const u = ctx.user;
  const enrolls = scopedEnrollments(s);
  const tasks = sel.adminPendingTasks(u);
  const taskTotal = tasks.reduce((t, x) => t + x.count, 0);
  const month = today().slice(0, 7);
  const canAttendance = ctx.can("attendance.view") || ctx.can("reports.attendance");
  const canFees = ctx.can("fees.view");
  const p = palette();

  /* KPIs */
  const kpis = [];
  if (ctx.can("students.view")) {
    const count = s.assigned ? new Set(enrolls.map((e) => e.studentId)).size : store.count("users", (x) => x.role === "student" && x.status === "active");
    kpis.push(statCard({ icon: "Users", label: s.assigned ? "My students" : "Active students", value: num(count), tone: "blue", href: s.assigned ? null : "admin-users.html?tab=students" }));
  }
  if (ctx.can("courses.view")) {
    const courses = new Set(s.batches.map((b) => b.courseId)).size;
    kpis.push(statCard({ icon: "Layers", label: `Active batches · ${plural(courses, "course")}`, value: num(s.batches.length), tone: "purple", href: "admin-courses.html" }));
  }
  if (canFees) {
    const revenue = store.where("payments", (x) => x.status === "success" && x.paidAt.slice(0, 7) === month).reduce((t, x) => t + x.amount, 0);
    const prev = sel.revenueByMonth(2)[0];
    const trend = prev.total ? Math.round(((revenue - prev.total) / prev.total) * 100) : null;
    kpis.push(statCard({ icon: "IndianRupee", label: "Revenue this month", value: money(revenue), tone: "green", trend: trend == null ? null : Math.abs(trend) + "% vs last month", trendDir: trend < 0 ? "down" : "up", href: "admin-fees.html?tab=payments" }));
  }
  if (s.financeFocus) {
    const overdue = sel.overdueInvoices();
    const amt = overdue.reduce((t, i) => t + Math.max(0, i.total - sel.paidAmount(i.id)), 0);
    kpis.push(statCard({ icon: "TriangleAlert", label: `Overdue · ${plural(overdue.length, "invoice")}`, value: money(amt), tone: amt ? "rust" : "slate", href: "admin-fees.html?tab=invoices" }));
  } else if (s.assigned && canAttendance) {
    const weeks = attendanceTrend(s).filter((w) => w.pct != null);
    const last = weeks[weeks.length - 1];
    kpis.push(statCard({ icon: "CalendarCheck", label: "Attendance this week", value: last ? pct(last.pct, 1) : "—", tone: "green" }));
  }
  kpis.push(statCard({ icon: "ListChecks", label: "Pending tasks", value: num(taskTotal), tone: taskTotal ? "amber" : "slate" }));

  /* Charts: created once, then updated in place */
  const specs = [];
  let mainChart = null;
  if (canFees) {
    const rev = sel.revenueByMonth(6);
    mainChart = slot("c-revenue", chartCard("revenue", "Revenue", "Successful payments, last 6 months", viewAll("admin-fees.html")));
    specs.push({ key: "revenue", empty: !rev.some((r) => r.total), series: [{ name: "Collected", data: rev.map((r) => r.total) }], categories: rev.map((r) => monthYear(r.month + "-01")), create: (el, sp) => areaChart(el, { series: sp.series, categories: sp.categories, yFormatter: moneyShort, tooltipFormatter: money, height: 260 }) });
  } else if (canAttendance) {
    mainChart = slot("c-attendance", chartCard("attendance", "Attendance trend", s.assigned ? "Your batches, last 8 weeks" : "All batches, last 8 weeks"));
  }

  const secondary = [];
  if (ctx.can("courses.view") || (ctx.can("students.view") && !s.financeFocus)) {
    secondary.push(slot("c-enrolments", chartCard("enrolments", "Enrolments by course", s.assigned ? "Active students in your batches" : "Active enrolments")));
    const byCourse = new Map();
    enrolls.forEach((e) => byCourse.set(e.courseId, (byCourse.get(e.courseId) || 0) + 1));
    const entries = [...byCourse.entries()].sort((a, b) => b[1] - a[1]);
    specs.push({ key: "enrolments", empty: !entries.length, series: entries.map((x) => x[1]), labels: entries.map(([id]) => store.byId("courses", id)?.code || "Other"), create: (el, sp) => donutChart(el, { series: sp.series, labels: sp.labels, centerLabel: "Students", height: 260 }) });
  }
  if (canAttendance && canFees) secondary.push(slot("c-attendance", chartCard("attendance", "Attendance trend", s.assigned ? "Your batches, last 8 weeks" : "All batches, last 8 weeks")));
  if (canAttendance) {
    const trend = attendanceTrend(s);
    specs.push({ key: "attendance", empty: !trend.some((w) => w.pct != null), series: [{ name: "Attendance %", data: trend.map((w) => w.pct) }], categories: trend.map((w) => w.label), create: (el, sp) => lineChart(el, { series: sp.series, categories: sp.categories, colors: [p.accent], yFormatter: (v) => (v == null ? "" : Math.round(v) + "%"), height: 260 }) });
  }
  if (s.financeFocus) {
    const aging = sel.duesAging();
    secondary.push(slot("c-aging", chartCard("aging", "Overdue by age", "Outstanding balance past due date")));
    specs.push({ key: "aging", empty: !Object.values(aging).some(Boolean), series: [{ name: "Overdue", data: Object.values(aging) }], categories: ["0–15 days", "16–30 days", "31–60 days", "60+ days"], create: (el, sp) => barChart(el, { series: sp.series, categories: sp.categories, colors: [p.gold], yFormatter: moneyShort, height: 260 }) });
  }
  secondary.push(slot("upcoming", upcomingCard(s)));

  const teaching = [];
  if (ctx.can("courses.view")) teaching.push(slot("batches", batchesCard(s, s.assigned ? "My batches" : "Active batches")));
  if (ctx.can("courses.view") || ctx.can("attendance.mark")) teaching.push(slot("today", todayClassesCard(s)));
  if (ctx.can("assignments.grade")) teaching.push(slot("grading", gradingCard(s)));

  const finance = [];
  if (canFees) {
    if (s.financeFocus || ctx.can("invoices.manage")) finance.push(slot("overdue", overdueCard()));
    finance.push(slot("payments", paymentsCard()));
  }

  const role = s.role?.name || u.role;
  const subtitle = s.assigned
    ? `${plural(s.batches.length, "batch", "batches")} · ${plural(taskTotal, "task")} pending`
    : s.financeFocus
      ? "Here is today's collections and dues picture."
      : "Here is what is happening across OM Academy today.";
  const quick = [];
  if (ctx.can("attendance.mark")) quick.push(html`<a class="btn dash-welcome-btn" href="admin-academics.html?tab=attendance">${raw(icon("CalendarCheck", { size: 16 }))}Mark attendance</a>`);
  if (ctx.can("payments.record")) quick.push(html`<a class="btn dash-welcome-btn" href="admin-fees.html?tab=invoices">${raw(icon("IndianRupee", { size: 16 }))}Record payment</a>`);
  if (ctx.can("announcements.manage")) quick.push(html`<a class="btn dash-welcome-btn" href="admin-communication.html?tab=announcements">${raw(icon("Megaphone", { size: 16 }))}Announce</a>`);
  if (ctx.can("reports.attendance") || ctx.can("reports.financial") || ctx.can("reports.performance")) quick.push(html`<a class="btn dash-welcome-btn" href="admin-reports.html">${raw(icon("ChartColumn", { size: 16 }))}Reports</a>`);

  const welcome = html`
    <div class="dash-welcome-text">
      <span class="dash-welcome-eyebrow">${raw(icon("CalendarDays", { size: 14 }))}${weekdayLong(today())}, ${date(today())} · ${role}</span>
      <h2>${greeting()}, ${u.name.split(" ")[0]}</h2>
      <p>${subtitle}</p>
    </div>
    ${quick.length ? html`<div class="cluster dash-welcome-actions">${raw(quick.join(""))}</div>` : raw("")}`;

  const tasksSlot = slot("tasks", tasksCard(tasks));
  const rows = [
    mainChart ? { slots: [mainChart, tasksSlot], cls: "grid-main-side" } : { slots: [tasksSlot] },
    { slots: secondary },
    { slots: teaching },
    { slots: finance },
    { slots: ctx.can("activity.view") || s.isAdmin ? [slot("activity", activityCard())] : [] },
  ];
  return { welcome, kpis: kpis.join(""), rows, specs };
}

/* ---------- render ---------- */

function render() {
  const b = build();
  const allSlots = b.rows.flatMap((r) => r.slots);
  const sig = allSlots.map((x) => x.key).join("|");

  if (sig !== layoutSig || !qs("[data-dash-welcome]", ctx.root)) {
    destroyCharts();
    layoutSig = sig;
    ctx.root.innerHTML = html`
      <div class="welcome-card page-section" data-dash-welcome>${raw(b.welcome)}</div>
      <div class="grid grid-kpi page-section" data-dash-kpis>${raw(b.kpis)}</div>
      ${raw(b.rows.map((r) => row(r.slots, r.cls)).join(""))}`;
  } else {
    qs("[data-dash-welcome]", ctx.root).innerHTML = b.welcome;
    qs("[data-dash-kpis]", ctx.root).innerHTML = b.kpis;
    for (const s of allSlots) {
      if (s.key.startsWith("c-")) continue; // chart cards keep their DOM; the chart itself updates in place
      const el = ctx.root.querySelector(`[data-slot="${s.key}"]`);
      if (el) el.innerHTML = s.markup;
    }
  }

  for (const spec of b.specs) {
    const el = ctx.root.querySelector(`[data-chart="${spec.key}"]`);
    if (el) upsertChart(spec.key, el, spec);
  }
}

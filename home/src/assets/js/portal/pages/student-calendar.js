/*
Author       : OM Academy
Description  : Student → Event Calendar. FullCalendar month view (list view on phones) of holidays, events,
               exams, assignment deadlines and the next 8 weeks of class sessions, with type filter chips,
               an event details modal and an agenda of the next 10 items.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import { html, raw, on, qs, qsa, toast, modal, emptyState, setSearchParam } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, time, weekdayLong, dueIn, titleCase } from "../core/format.js";
import { today, now, addDays, dateOf, weekday, parseDate } from "../core/clock.js";
import { monthCalendar, toFcEvent } from "../core/calendar.js";

const TYPES = [
  { id: "class", label: "Classes", one: "Class", tone: "green", icon: "BookOpen" },
  { id: "exam", label: "Exams", one: "Exam", tone: "amber", icon: "GraduationCap" },
  { id: "deadline", label: "Deadlines", one: "Deadline", tone: "purple", icon: "ClipboardList" },
  { id: "event", label: "Events", one: "Event", tone: "blue", icon: "Megaphone" },
  { id: "holiday", label: "Holidays", one: "Holiday", tone: "rust", icon: "CalendarX" },
];
const typeOf = (e) => (TYPES.some((t) => t.id === e.type) ? e.type : "event");
const typeMeta = (e) => TYPES.find((t) => t.id === typeOf(e));

let ctx;
let calendar = null;
let calToken = 0;
let mq;
const active = new Set(TYPES.map((t) => t.id));

const onMq = () => renderCalendar();

boot({
  id: "student-calendar",
  portal: "student",
  watch: ["events", "assignments", "submissions", "exams", "timetableSlots", "enrollments", "batches", "settings"],
  async mount(c) {
    ctx = c;
    mq = window.matchMedia("(max-width: 640px)");
    renderLayout();
    wire();
    refresh();
    await renderCalendar();
    mq.addEventListener("change", onMq);
    const id = c.params.get("id");
    if (id) openEvent(id);
  },
  update: () => {
    refresh();
    if (calendar) {
      calendar.getEventSources().forEach((s) => s.remove());
      calendar.addEventSource(filtered().map(toFcEvent));
    }
  },
  unmount() {
    mq?.removeEventListener("change", onMq);
    calToken++;
    calendar?.destroy();
    calendar = null;
  },
});

/* ---------- data ---------- */

const shortCourse = (course) => String(course?.title || "Course").split(" — ")[0];

// Weekly class sessions from timetableSlots for the next 8 weeks (skipping holidays)
function classSessions(holidays) {
  const out = [];
  const batches = sel.activeBatchesOf(ctx.user.id);
  const slots = store.where("timetableSlots", (s) => batches.some((b) => b.id === s.batchId));
  const start = today();
  for (let i = 0; i < 56; i++) {
    const d = addDays(start, i);
    if (holidays.has(d)) continue;
    const wd = weekday(d);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      const batch = batches.find((b) => b.id === s.batchId);
      const course = sel.courseOf(batch);
      out.push({ id: `cls-${s.id}-${d}`, title: shortCourse(course) + " class", type: "class", start: `${d}T${s.start}`, end: `${d}T${s.end}`, allDay: false, slotId: s.id, batchId: s.batchId });
    }
  }
  return out;
}

function allEvents() {
  const base = sel.calendarEventsFor(ctx.user);
  const holidays = new Set();
  for (const e of base) {
    if (e.type !== "holiday") continue;
    for (let d = dateOf(e.start); d <= dateOf(e.end || e.start); d = addDays(d, 1)) holidays.add(d);
  }
  return [...base, ...classSessions(holidays)];
}

const filtered = () => allEvents().filter((e) => active.has(typeOf(e)));

const startTime = (e) => parseDate(e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start) ? dateOf(e.start) : e.start).getTime();

function upcoming(list, limit = 10) {
  const t = today();
  const nowMs = now().getTime();
  return list
    .filter((e) => (e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start) ? dateOf(e.end || e.start) >= t : parseDate(e.end || e.start).getTime() >= nowMs))
    .sort((a, b) => startTime(a) - startTime(b))
    .slice(0, limit);
}

function whenText(e) {
  const isAllDay = e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  if (isAllDay) return "All day";
  return e.end ? `${time(e.start)} – ${time(e.end)}` : time(e.start);
}

/* ---------- layout ---------- */

function renderLayout() {
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Event Calendar</li></ol>
        <h1 class="page-title">Event Calendar</h1>
        <p class="page-subtitle">Classes, exams, deadlines, events and holidays in one place.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-outline" href="student-courses.html">${raw(icon("CalendarClock", { size: 16 }))}Weekly timetable</a>
      </div>
    </div>
    <div class="card page-section">
      <div class="card-body cal-toolbar">
        <div class="cal-legend" role="group" aria-label="Show event types" data-filters></div>
        <button type="button" class="btn btn-ghost btn-sm" data-act="all">Show all</button>
      </div>
    </div>
    <div class="grid grid-main-side">
      <div class="card">
        <div class="card-body"><div data-cal></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Coming up</h3><p class="card-subtitle">Next 10 items</p></div></div>
        <div data-agenda></div>
      </div>
    </div>`;
}

function refresh() {
  const all = allEvents();
  qs("[data-filters]", ctx.root).innerHTML = TYPES.map(
    (t) => html`<button type="button" class="chip cal-legend-item cal-filter" data-type="${t.id}" aria-pressed="${active.has(t.id) ? "true" : "false"}"><span class="dot tone-${raw(t.tone)}"></span>${t.label}<span class="cal-filter-count">${all.filter((e) => typeOf(e) === t.id).length}</span></button>`
  ).join("");
  renderAgenda(all.filter((e) => active.has(typeOf(e))));
}

function renderAgenda(list) {
  const items = upcoming(list);
  const box = qs("[data-agenda]", ctx.root);
  if (!items.length) {
    box.innerHTML = html`<div class="card-body">${raw(emptyState({ icon: "CalendarDays", title: "Nothing coming up", text: active.size < TYPES.length ? "Try showing more event types." : "No upcoming items on your calendar." }))}</div>`;
    return;
  }
  box.innerHTML = html`<ul class="list-plain">${raw(
    items
      .map((e) => {
        const meta = typeMeta(e);
        const d = parseDate(dateOf(e.start));
        return html`
          <li><button type="button" class="list-row cal-agenda-row" data-open="${e.id}">
            <span class="cal-agenda-date tone-${raw(meta.tone)}"><strong>${d.getDate()}</strong><span>${d.toLocaleString("en-IN", { month: "short" })}</span></span>
            <span class="list-row-main">
              <span class="list-row-title">${e.title}</span>
              <span class="list-row-sub">${meta.one} · ${weekdayLong(dateOf(e.start)).slice(0, 3)} · ${whenText(e)}</span>
            </span>
            ${raw(icon("ChevronRight", { size: 16, cls: "text-muted" }))}
          </button></li>`;
      })
      .join("")
  )}</ul>`;
}

async function renderCalendar() {
  const token = ++calToken;
  calendar?.destroy();
  calendar = null;
  const el = qs("[data-cal]", ctx.root);
  el.innerHTML = "";
  try {
    const c = await monthCalendar(el, { events: filtered(), onEventClick: (ev) => openEvent(ev.id), mobile: mq.matches });
    if (token !== calToken) {
      c.destroy();
      return;
    }
    calendar = c;
  } catch (err) {
    console.error(err);
    el.innerHTML = emptyState({ icon: "CalendarX", title: "The calendar couldn't load", text: "Check your connection and reload the page. The agenda still lists what's coming up." });
  }
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", ".cal-filter", (e, btn) => {
    const type = btn.dataset.type;
    if (active.has(type)) active.delete(type);
    else active.add(type);
    applyFilters();
  });
  on(ctx.root, "click", '[data-act="all"]', () => {
    TYPES.forEach((t) => active.add(t.id));
    applyFilters();
  });
  on(ctx.root, "click", "[data-open]", (e, btn) => openEvent(btn.dataset.open));
}

function applyFilters() {
  qsa(".cal-filter", ctx.root).forEach((b) => b.setAttribute("aria-pressed", String(active.has(b.dataset.type))));
  renderAgenda(filtered());
  if (calendar) {
    calendar.getEventSources().forEach((s) => s.remove());
    calendar.addEventSource(filtered().map(toFcEvent));
  }
}

function openEvent(id) {
  const e = allEvents().find((x) => x.id === id);
  if (!e) {
    toast("That calendar item couldn't be found — it may have been removed.", { type: "warning" });
    setSearchParam("id", null);
    return;
  }
  setSearchParam("id", id);
  const meta = typeMeta(e);
  const rows = [];
  let link = null;
  let description = e.description || "";

  if (e.type === "exam") {
    const exam = store.byId("exams", id.replace(/^ex-/, ""));
    const course = store.byId("courses", exam?.courseId);
    rows.push(["Course", course?.title || "—"], ["Room", exam?.room || "—"], ["Max marks", exam ? String(exam.maxMarks) : "—"], ["Status", exam ? titleCase(exam.status) : "—"]);
    if (exam) link = { href: `student-exams.html?id=${encodeURIComponent(exam.id)}`, label: "Open in Exams" };
    description = description || "Report 30 minutes early with your admit card and photo ID.";
  } else if (e.type === "deadline") {
    const a = store.byId("assignments", id.replace(/^dl-/, ""));
    const course = store.byId("courses", a?.courseId);
    const status = a ? sel.assignmentStatusFor(a, ctx.user.id) : null;
    const labels = { graded: "Graded", submitted: "Submitted", pending: "Not submitted", overdue: "Overdue (closed)", "overdue-allowed": "Overdue — late submission allowed" };
    rows.push(["Course", course?.title || "—"], ["Due", a ? `${date(a.dueAt)} · ${dueIn(a.dueAt)}` : "—"], ["Max marks", a ? String(a.maxMarks) : "—"], ["Your status", labels[status] || "—"]);
    if (a) link = { href: `student-assignments.html?id=${encodeURIComponent(a.id)}`, label: status === "pending" || status === "overdue-allowed" ? "Submit assignment" : "Open assignment" };
    description = description || a?.description || "";
  } else if (e.type === "class") {
    const slot = store.byId("timetableSlots", e.slotId);
    const batch = store.byId("batches", e.batchId);
    const instructor = store.byId("users", slot?.instructorId);
    rows.push(["Course", sel.courseOf(batch)?.title || "—"], ["Batch", batch?.name || "—"], ["Room", slot?.room || "—"], ["Instructor", instructor?.name || "—"]);
    link = { href: "student-courses.html", label: "Courses & schedule" };
  } else {
    const center = e.centerId ? store.byId("centers", e.centerId) : null;
    rows.push(["Where", center?.name || "All centers"]);
    if (e.end && dateOf(e.end) !== dateOf(e.start)) rows.push(["Until", date(e.end)]);
  }

  const m = modal.open({
    title: e.title,
    size: "md",
    body: html`
      <div class="cluster section-gap">
        <span class="badge tone-${raw(meta.tone)}">${meta.one}</span>
        <span class="text-muted text-sm">${dueIn(e.start)}</span>
      </div>
      <dl class="kv-list">
        <dt>Date</dt><dd>${weekdayLong(dateOf(e.start))}, ${date(e.start)}</dd>
        <dt>Time</dt><dd>${whenText(e)}</dd>
        ${raw(rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`).join(""))}
      </dl>
      ${description ? html`<p class="text-muted cal-modal-desc">${description}</p>` : raw("")}`,
    footer: html`
      <button type="button" class="btn btn-outline" data-m="close">Close</button>
      ${link ? html`<a class="btn btn-primary" href="${link.href}">${link.label}${raw(icon("ArrowRight", { size: 16 }))}</a>` : raw("")}`,
  });
  m.root.querySelector('[data-m="close"]').addEventListener("click", () => {
    m.close();
    setSearchParam("id", null);
  });
}

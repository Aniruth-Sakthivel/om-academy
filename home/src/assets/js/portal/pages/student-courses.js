/*
Author       : OM Academy
Description  : Student → Courses & Schedule. Enrolled course cards with syllabus progress, a course detail drawer
               (syllabus, instructor contact, quick links) and a weekly timetable with an iCalendar export.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, modal, drawer, badge, avatar, statCard, emptyState, tabs, setSearchParam, getSearchParam, downloadBlob } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, timeRange, plural } from "../core/format.js";
import { today, startOfWeek, addDays, weekday } from "../core/clock.js";
import { weekTimetable, toFcEvent } from "../core/calendar.js";
import { run } from "../core/errors.js";

const TABS = ["courses", "timetable"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

let ctx;
let calendar = null;
let calendarPromise = null;
let destroyed = false;

boot({
  id: "student-courses",
  portal: "student",
  watch: ["enrollments", "batches", "courses", "timetableSlots", "users", "centers"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openCourse(id);
  },
  update: () => refresh(),
  unmount() {
    destroyed = true;
    calendar?.destroy();
    calendar = null;
  },
});

/* ---------- data ---------- */

const pctClass = (n) => "pct-" + Math.min(100, Math.max(0, Math.round((Number(n) || 0) / 5) * 5));

// One entry per active enrolment: batch, course, center, instructors and weekly slots.
function myCourses() {
  return sel
    .studentEnrollments(ctx.user.id, { activeOnly: true })
    .map((enr) => {
      const batch = store.byId("batches", enr.batchId);
      if (!batch) return null;
      const course = store.byId("courses", batch.courseId) || { title: "Course", tone: "blue", syllabus: [] };
      const slots = store.where("timetableSlots", (s) => s.batchId === batch.id).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start.localeCompare(b.start));
      return {
        enr,
        batch,
        course,
        center: store.byId("centers", batch.centerId),
        instructors: (batch.instructorIds || []).map((id) => store.byId("users", id)).filter(Boolean),
        slots,
        progress: sel.courseProgress(batch),
      };
    })
    .filter(Boolean);
}

function scheduleText(slots) {
  if (!slots.length) return "Schedule to be announced";
  const days = [...new Set(slots.map((s) => DAY_SHORT[s.weekday]))].join(", ");
  const times = [...new Set(slots.map((s) => timeRange(s.start, s.end)))].join(" / ");
  return `${days} · ${times}`;
}

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "courses";
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Courses &amp; Schedule</li></ol>
        <h1 class="page-title">Courses &amp; Schedule</h1>
        <p class="page-subtitle">Your enrolled courses, syllabus progress and weekly classes.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="ics">${raw(icon("CalendarClock", { size: 16 }))}Download .ics</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="courses">${raw(icon("BookOpen", { size: 15 }))}My courses <span class="tab-count" data-count="courses"></span></button>
        <button type="button" class="tab" role="tab" data-tab="timetable">${raw(icon("CalendarDays", { size: 15 }))}Weekly timetable</button>
      </div>
      <div data-tab-panel="courses"><div class="card-body" data-courses></div></div>
      <div data-tab-panel="timetable" hidden>
        <div class="card-body stack">
          <div class="cluster-between">
            <p class="text-sm text-muted m-0" data-week-label></p>
            <div class="cal-legend" data-legend></div>
          </div>
          <div class="tt-week" data-week></div>
          <div class="tt-daylist" data-daylist></div>
        </div>
      </div>
    </div>`;

  tabs(ctx.root, {
    active,
    onChange: (id) => {
      setSearchParam("tab", id);
      if (id === "timetable") requestAnimationFrame(() => calendar?.updateSize());
    },
  });
}

function refresh() {
  const list = myCourses();
  const slotCount = list.reduce((t, c) => t + c.slots.length, 0);
  const avg = list.length ? Math.round(list.reduce((t, c) => t + c.progress, 0) / list.length) : 0;
  const todayCount = sel.todaySchedule(ctx.user.id).length;

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "BookOpen", label: "Active courses", value: String(list.length), tone: "blue" }),
    statCard({ icon: "ListChecks", label: "Average syllabus progress", value: avg + "%", tone: "green" }),
    statCard({ icon: "CalendarClock", label: "Classes per week", value: String(slotCount), tone: "purple" }),
    statCard({ icon: "Clock", label: "Classes today", value: String(todayCount), tone: todayCount ? "amber" : "slate" }),
  ].join("");
  qs('[data-count="courses"]', ctx.root).textContent = list.length;

  qs("[data-courses]", ctx.root).innerHTML = list.length
    ? html`<div class="grid grid-2">${list.map(courseCardHtml)}</div>`
    : emptyState({ icon: "BookOpen", title: "No active courses", text: "Courses appear here once the front office enrols you in a batch." });

  qs("[data-legend]", ctx.root).innerHTML = html`${list.map((c) => html`<span class="cal-legend-item"><span class="dot tone-${raw(c.course.tone || "blue")} course-dot"></span>${c.course.code || c.course.title}</span>`)}`;
  const weekStart = startOfWeek(today());
  qs("[data-week-label]", ctx.root).textContent = `Week of ${date(weekStart)} – ${date(addDays(weekStart, 6))}`;
  qs("[data-daylist]", ctx.root).innerHTML = dayListHtml(list);
  renderCalendar(list);
}

function courseCardHtml(c) {
  const { batch, course, center, instructors, slots, progress } = c;
  const tone = course.tone || "blue";
  const total = (batch.moduleIds || []).length;
  const done = (batch.completedModuleIds || []).length;
  return html`
    <article class="card course-card">
      <div class="card-header">
        <div class="cluster course-card-head">
          <span class="icon-tile tone-${raw(tone)}">${raw(icon("BookOpen", { size: 20 }))}</span>
          <div class="course-card-titles">
            <h3 class="card-title">${course.title}</h3>
            <p class="card-subtitle">${batch.name} · ${batch.code}</p>
          </div>
        </div>
        <span class="badge tone-${raw(tone)}">${course.body || "Course"}</span>
      </div>
      <div class="card-body stack">
        <dl class="kv-list">
          <dt>Center</dt><dd>${center?.name || "—"}</dd>
          <dt>Instructor</dt><dd>${instructors.map((u) => u.name).join(", ") || "To be assigned"}</dd>
          <dt>Schedule</dt><dd>${scheduleText(slots)}</dd>
          <dt>Room</dt><dd>${batch.room || slots[0]?.room || "—"}</dd>
          <dt>Duration</dt><dd>${date(batch.startDate)} – ${date(batch.endDate)}</dd>
        </dl>
        <div class="stack-sm">
          <div class="cluster-between"><span class="text-sm fw-600 text-title">Syllabus progress</span><span class="text-sm fw-700 text-title">${progress}%</span></div>
          <div class="progress tone-${raw(tone)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="Syllabus progress"><span class="progress-bar ${raw(pctClass(progress))}"></span></div>
          <span class="text-xs text-muted">${done} of ${plural(total, "module")} completed</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="cluster">
          <a class="btn btn-ghost btn-sm" href="student-resources.html?course=${course.id}">${raw(icon("FolderOpen", { size: 15 }))}Resources</a>
          <a class="btn btn-ghost btn-sm" href="student-assignments.html?course=${course.id}">${raw(icon("ClipboardList", { size: 15 }))}Assignments</a>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-open="${batch.id}">View details${raw(icon("ChevronRight", { size: 15 }))}</button>
      </div>
    </article>`;
}

function dayListHtml(list) {
  const entries = list.flatMap((c) => c.slots.map((s) => ({ ...s, c })));
  if (!entries.length) return emptyState({ icon: "CalendarDays", title: "No classes scheduled", text: "Your weekly classes appear here once your batch timetable is published." });
  const todayDow = weekday(today());
  return html`<div class="stack">${WEEK_ORDER.map((dow) => {
    const items = entries.filter((e) => e.weekday === dow).sort((a, b) => a.start.localeCompare(b.start));
    return html`
      <section class="tt-day ${raw(dow === todayDow ? "is-today" : "")}">
        <h4 class="drawer-section-title">${DAY_NAMES[dow]}${dow === todayDow ? html` <span class="badge tone-blue">Today</span>` : raw("")}</h4>
        ${items.length
          ? html`<ul class="list-plain tt-day-list">${items.map(
              (e) => html`<li class="list-row tt-slot" data-open="${e.batchId}">
                <span class="icon-tile icon-tile-sm tone-${raw(e.c.course.tone || "blue")}">${raw(icon("Clock", { size: 15 }))}</span>
                <div class="list-row-main"><div class="list-row-title">${e.c.course.title}</div><div class="list-row-sub">${timeRange(e.start, e.end)} · ${e.room || e.c.batch.room || "—"}</div></div>
                ${raw(icon("ChevronRight", { size: 16 }))}
              </li>`
            )}</ul>`
          : html`<p class="text-sm text-muted m-0">No classes</p>`}
      </section>`;
  })}</div>`;
}

function weekEvents(list) {
  const weekStart = startOfWeek(today());
  return list.flatMap((c) =>
    c.slots.map((s) => {
      const day = addDays(weekStart, (s.weekday + 6) % 7);
      return {
        id: "cls-" + s.id,
        title: `${c.course.code || c.course.title} · ${s.room || c.batch.room || ""}`,
        type: "class",
        start: `${day}T${s.start}`,
        end: `${day}T${s.end}`,
        description: c.course.title,
        batchId: c.batch.id,
      };
    })
  );
}

function renderCalendar(list) {
  const events = weekEvents(list);
  const el = qs("[data-week]", ctx.root);
  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(events.map(toFcEvent));
    return;
  }
  if (calendarPromise) return;
  if (!events.length) {
    el.innerHTML = emptyState({ icon: "CalendarDays", title: "No classes scheduled", text: "Your weekly classes appear here once your batch timetable is published." });
    return;
  }
  const minStart = events.reduce((m, e) => (e.start.slice(11) < m ? e.start.slice(11) : m), "23:59");
  const maxEnd = events.reduce((m, e) => (e.end.slice(11) > m ? e.end.slice(11) : m), "00:00");
  calendarPromise = weekTimetable(el, {
    events,
    slotMin: String(Math.max(6, Number(minStart.slice(0, 2)) - 1)).padStart(2, "0") + ":00:00",
    slotMax: String(Math.min(23, Number(maxEnd.slice(0, 2)) + 2)).padStart(2, "0") + ":00:00",
    businessHours: { daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: "09:00", endTime: "18:00" },
    onEventClick: (ev) => openCourse(ev.extendedProps.raw?.batchId),
  })
    .then((cal) => {
      if (destroyed) return cal.destroy();
      calendar = cal;
    })
    .catch((err) => {
      console.error(err);
      el.innerHTML = emptyState({ icon: "TriangleAlert", title: "The timetable couldn't load", text: "Reload the page to try again. The day-by-day list below still shows your classes." });
    });
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", "[data-open]", (e, el) => openCourse(el.dataset.open));
  on(ctx.root, "click", '[data-act="ics"]', () => downloadIcs());
}

// Accepts a batch id or a course id (deep links from other pages may use either).
function openCourse(id) {
  const list = myCourses();
  const c = list.find((x) => x.batch.id === id) || list.find((x) => x.course.id === id);
  if (!c) {
    toast("That course couldn't be found among your enrolments.", { type: "warning" });
    return;
  }
  setSearchParam("id", c.batch.id);
  const { batch, course, center, instructors, slots, progress } = c;
  const tone = course.tone || "blue";
  const completed = new Set(batch.completedModuleIds || []);
  const modules = (course.syllabus || []).filter((m) => !(batch.moduleIds || []).length || batch.moduleIds.includes(m.id));

  const d = drawer.open({
    title: "Course details",
    wide: true,
    body: html`
      <div class="cluster section-gap">
        <span class="icon-tile tone-${raw(tone)}">${raw(icon("BookOpen", { size: 20 }))}</span>
        <div class="course-card-titles">
          <div class="fw-700 text-lg text-title">${course.title}</div>
          <div class="text-sm text-muted">${batch.name}</div>
        </div>
      </div>
      <div class="cluster section-gap"><span class="badge tone-${raw(tone)}">${course.body || "Course"}</span>${course.category ? html`<span class="chip">${course.category}</span>` : raw("")}${raw(badge(batch.status || "active", batch.status === "active" ? "In progress" : batch.status))}</div>
      ${course.description ? html`<p class="text-muted section-gap">${course.description}</p>` : raw("")}
      <dl class="kv-list drawer-section">
        <dt>Batch code</dt><dd>${batch.code}</dd>
        <dt>Center</dt><dd>${center?.name || "—"}${center?.address ? html`<div class="text-xs text-muted">${center.address}</div>` : raw("")}</dd>
        <dt>Schedule</dt><dd>${scheduleText(slots)}</dd>
        <dt>Room</dt><dd>${batch.room || "—"}</dd>
        <dt>Starts</dt><dd>${date(batch.startDate)}</dd>
        <dt>Ends</dt><dd>${date(batch.endDate)}</dd>
      </dl>
      <div class="drawer-section">
        <div class="cluster-between"><h4 class="drawer-section-title">Syllabus</h4><span class="text-sm fw-700 text-title">${progress}% complete</span></div>
        <div class="progress tone-${raw(tone)} section-gap"><span class="progress-bar ${raw(pctClass(progress))}"></span></div>
        ${modules.length
          ? html`<ol class="list-plain syllabus-list">${modules.map((m, i) => {
              const done = completed.has(m.id);
              return html`<li class="syllabus-item ${raw(done ? "is-done" : "")}">
                <span class="icon-tile icon-tile-sm tone-${raw(done ? "green" : "slate")}">${raw(icon(done ? "Check" : "Clock", { size: 15 }))}</span>
                <div class="list-row-main"><div class="fw-600 text-title">Module ${i + 1}: ${m.title}</div><div class="text-xs text-muted">${done ? "Completed" : "Upcoming"}</div></div>
              </li>`;
            })}</ol>`
          : html`<p class="text-muted m-0">The syllabus hasn't been published yet.</p>`}
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Instructor</h4>
        ${instructors.length
          ? html`<div class="stack-sm">${instructors.map(
              (u) => html`<div class="file-tile">
                ${avatar({ name: u.name, size: "md" })}
                <div class="file-tile-main"><div class="file-tile-name">${u.name}</div><div class="file-tile-meta">${u.designation || "Faculty"}${u.email ? " · " + u.email : ""}</div></div>
                <button type="button" class="btn btn-outline btn-sm" data-message="${u.id}">${raw(icon("MessageSquare", { size: 15 }))}Message</button>
              </div>`
            )}</div>`
          : html`<p class="text-muted m-0">An instructor will be assigned soon.</p>`}
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Quick links</h4>
        <div class="grid grid-3 course-links">
          <a class="file-tile" href="student-resources.html?course=${course.id}"><span class="icon-tile icon-tile-sm tone-blue">${raw(icon("FolderOpen", { size: 16 }))}</span><span class="file-tile-name">Resources</span></a>
          <a class="file-tile" href="student-forum.html?course=${course.id}"><span class="icon-tile icon-tile-sm tone-purple">${raw(icon("MessagesSquare", { size: 16 }))}</span><span class="file-tile-name">Forum</span></a>
          <a class="file-tile" href="student-assignments.html?course=${course.id}"><span class="icon-tile icon-tile-sm tone-amber">${raw(icon("ClipboardList", { size: 16 }))}</span><span class="file-tile-name">Assignments</span></a>
        </div>
      </div>`,
    footer: html`<button type="button" class="btn btn-outline" data-d="close">Close</button>`,
  });
  const close = () => {
    setSearchParam("id", null);
    d.close();
  };
  d.root.querySelector('[data-d="close"]').addEventListener("click", close);
  d.root.querySelector("[data-drawer-close]")?.addEventListener("click", () => setSearchParam("id", null));
  on(d.root, "click", "[data-message]", (e, btn) => messageInstructor(btn.dataset.message, course));
}

async function messageInstructor(instructorId, course) {
  const teacher = store.byId("users", instructorId);
  if (!teacher) return toast("That instructor couldn't be found.", { type: "warning" });
  const data = await modal.form({
    title: "Message " + teacher.name,
    submitLabel: "Send message",
    columns: 1,
    fields: [
      { name: "subject", label: "Subject", required: true, placeholder: "e.g. Doubt about module 3" },
      { name: "body", label: "Message", type: "textarea", rows: 5, required: true, placeholder: "Write your question…" },
    ],
    values: { subject: course.title + " — question" },
    validate: (v) => {
      const errors = {};
      if (!v.subject.trim()) errors.subject = "Enter a subject.";
      else if (v.subject.trim().length > 120) errors.subject = "Keep the subject under 120 characters.";
      if (v.body.trim().length < 5) errors.body = "Write a message of at least 5 characters.";
      return errors;
    },
  });
  if (!data) return;
  await run(() => services.startThread(ctx.user, { subject: data.subject.trim(), category: "academic", participants: [{ type: "user", id: instructorId }], body: data.body.trim() }), {
    success: `Message sent to ${teacher.name}. Replies appear under Notifications → Messages.`,
    error: "Couldn't send the message",
  });
}

/* ---------- iCalendar export ---------- */

const icsEscape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsDate = (iso) => iso.replace(/-/g, "");
const icsTime = (hhmm) => hhmm.replace(":", "") + "00";

// Fold lines longer than 75 octets (RFC 5545 §3.1)
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}

function downloadIcs() {
  const list = myCourses().filter((c) => c.slots.length);
  if (!list.length) return toast("There are no scheduled classes to export yet.", { type: "info" });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OM Academy//Student Portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:OM Academy classes", "X-WR-TIMEZONE:Asia/Kolkata",
    "BEGIN:VTIMEZONE", "TZID:Asia/Kolkata", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0530", "TZOFFSETTO:+0530", "TZNAME:IST", "END:STANDARD", "END:VTIMEZONE"];
  for (const c of list) {
    for (const s of c.slots) {
      // First occurrence on or after the batch start date
      let first = c.batch.startDate;
      while (weekday(first) !== s.weekday) first = addDays(first, 1);
      if (first > c.batch.endDate) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${s.id}-${c.batch.id}@omacademy.in`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Kolkata:${icsDate(first)}T${icsTime(s.start)}`,
        `DTEND;TZID=Asia/Kolkata:${icsDate(first)}T${icsTime(s.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${["SU", "MO", "TU", "WE", "TH", "FR", "SA"][s.weekday]};UNTIL=${icsDate(c.batch.endDate)}T235959`,
        `SUMMARY:${icsEscape(c.course.title)}`,
        `LOCATION:${icsEscape([s.room || c.batch.room, c.center?.name].filter(Boolean).join(", "))}`,
        `DESCRIPTION:${icsEscape(`${c.batch.name}\nInstructor: ${c.instructors.map((u) => u.name).join(", ") || "TBA"}`)}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  const text = lines.map(fold).join("\r\n") + "\r\n";
  downloadBlob("om-academy-timetable.ics", new Blob([text], { type: "text/calendar;charset=utf-8" }));
  toast("Timetable downloaded — open it to add your classes to your calendar.", { type: "success" });
}

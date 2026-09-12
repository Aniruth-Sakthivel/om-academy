/*
Author       : OM Academy
Description  : Staff → Settings. Tabs (each gated by its own permission):
                 Institution, Centers (CRUD), Academic calendar (FullCalendar + event list),
                 Rules (attendance, exams, grading scale editor, fees), System (forum posting, uploads, session,
                 demo date override), Activity log, Data (usage, export/import JSON, reset demo data).
               Every write goes through services via errors.run(); destructive actions ask first.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, dataTable, badge, emptyState, tabs, setSearchParam, getSearchParam, confirm, avatar, fieldsHtml, serialize, showErrors, fill, downloadBlob, downloadCsv } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateTime, relative, fileSize, num, plural, titleCase } from "../core/format.js";
import { today, getOverride } from "../core/clock.js";
import { monthCalendar, toFcEvent } from "../core/calendar.js";
import { run } from "../core/errors.js";

const TABS = [
  { id: "institution", label: "Institution", icon: "School", perm: "settings.manage" },
  { id: "centers", label: "Centers", icon: "Building2", perm: "centers.manage" },
  { id: "calendar", label: "Academic calendar", icon: "CalendarDays", perm: "calendar.manage" },
  { id: "rules", label: "Rules", icon: "SlidersHorizontal", perm: "settings.manage" },
  { id: "system", label: "System", icon: "Settings", perm: "settings.manage" },
  { id: "activity", label: "Activity log", icon: "Activity", perm: "activity.view" },
  { id: "data", label: "Data", icon: "Database", perm: "data.manage" },
];

const EVENT_TYPES = { holiday: "Holiday", event: "Event", exam: "Exam" };
const EVENT_TONES = { holiday: "rust", event: "blue", exam: "amber" };
const QUOTA = 5 * 1024 * 1024; // typical localStorage budget per site

let ctx;
let visible = [];
let activeTab;
let centerTable;
let eventTable;
let activityTable;
let calendar = null;
let calendarPending = null;

boot({
  id: "admin-settings",
  portal: "admin",
  perm: ["settings.manage", "calendar.manage", "centers.manage", "data.manage", "activity.view"],
  watch: ["settings", "centers", "batches", "users", "events", "activity", "enrollments", "invoices", "payments", "notifications", "attendanceSessions", "files"],
  mount(c) {
    ctx = c;
    visible = TABS.filter((t) => ctx.can(t.perm));
    renderLayout();
    wire();
    refresh();
  },
  update: () => refresh(),
  unmount() {
    centerTable?.destroy();
    eventTable?.destroy();
    activityTable?.destroy();
    calendar?.destroy();
  },
});

/* ---------- helpers ---------- */

const settings = () => store.get("settings");
const userById = (id) => store.byId("users", id);
const has = (id) => visible.some((t) => t.id === id);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s-]{8,16}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const pctClass = (v) => "pct-" + Math.max(0, Math.min(100, Math.round((Number(v) || 0) / 5) * 5));
const section = (title, sub, body, action = "") => html`
  <div class="set-section">
    <div class="cluster-between set-section-head"><div><h4 class="set-section-title">${title}</h4>${sub ? html`<p class="text-sm text-muted m-0">${sub}</p>` : raw("")}</div>${raw(action)}</div>
    ${raw(body)}
  </div>`;

function demoBanner() {
  const o = getOverride();
  return o
    ? html`<div class="alert tone-amber page-section">${raw(icon("CalendarClock", { size: 18 }))}<div class="alert-body"><p class="alert-title">Demo date is set to ${date(o)}</p>Every screen in this browser behaves as if today is ${date(o)} — due dates, attendance and "overdue" all follow it. Clear it under System when you're done.</div>${ctx.can("settings.manage") ? html`<div class="alert-actions"><button type="button" class="btn btn-outline btn-sm" data-act="clear-date">Clear</button></div>` : raw("")}</div>`
    : "";
}

/* ---------- layout ---------- */

function renderLayout() {
  const requested = getSearchParam("tab");
  activeTab = has(requested) ? requested : visible[0]?.id;
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Settings</li></ol>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Institution details, centers, calendar, academic rules and demo data.</p>
      </div>
    </div>
    <div data-banner></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${raw(visible.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.id}">${raw(icon(t.icon, { size: 15 }))}${t.label}</button>`).join(""))}
      </div>
      ${has("institution") ? html`<div data-tab-panel="institution" hidden><div class="card-body">${raw(institutionHtml())}</div></div>` : raw("")}
      ${has("centers") ? html`<div data-tab-panel="centers" hidden>
        <div class="card-header card-header-plain"><p class="text-sm text-muted m-0">Every batch and user belongs to a center. A center with batches can't be deleted.</p><button type="button" class="btn btn-primary btn-sm" data-act="new-center">${raw(icon("Plus", { size: 15 }))}Add center</button></div>
        <div data-center-table></div></div>` : raw("")}
      ${has("calendar") ? html`<div data-tab-panel="calendar" hidden>
        <div class="card-body">
          <div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Holidays close the academy: no classes are expected and attendance isn't marked on those days, so they don't count against anyone's percentage. Click a date to add an event.</div></div>
          <div class="cluster-between section-gap">
            <div class="cal-legend">${raw(Object.entries(EVENT_TYPES).map(([k, l]) => html`<span class="cal-legend-item"><span class="dot tone-${raw(EVENT_TONES[k])}"></span>${l}</span>`).join(""))}</div>
            <button type="button" class="btn btn-primary btn-sm" data-act="new-event">${raw(icon("Plus", { size: 15 }))}Add event</button>
          </div>
          <div class="set-calendar" data-calendar></div>
        </div>
        <div class="card-body set-divider"><h4 class="set-section-title m-0">All events &amp; holidays</h4></div>
        <div data-event-table></div></div>` : raw("")}
      ${has("rules") ? html`<div data-tab-panel="rules" hidden><div class="card-body">${raw(rulesHtml())}</div></div>` : raw("")}
      ${has("system") ? html`<div data-tab-panel="system" hidden><div class="card-body">${raw(systemHtml())}</div></div>` : raw("")}
      ${has("activity") ? html`<div data-tab-panel="activity" hidden>
        <div class="card-header card-header-plain"><p class="text-sm text-muted m-0">Every change made through the portal, newest first.</p>${ctx.can("data.manage") || ctx.can("reports.export") ? html`<button type="button" class="btn btn-outline btn-sm" data-act="export-activity">${raw(icon("FileSpreadsheet", { size: 15 }))}Export CSV</button>` : raw("")}</div>
        <div data-activity-table></div></div>` : raw("")}
      ${has("data") ? html`<div data-tab-panel="data" hidden><div class="card-body" data-data-panel></div></div>` : raw("")}
    </div>`;

  if (!visible.length) return;

  tabs(ctx.root, {
    active: activeTab,
    onChange: (id) => {
      activeTab = id;
      setSearchParam("tab", id);
      if (id === "calendar") ensureCalendar();
    },
  });

  if (has("institution")) fill(qs("[data-inst-form]", ctx.root), instValues());
  if (has("rules")) {
    fill(qs("[data-rules-form]", ctx.root), rulesValues());
    paintScale((settings().grading || {}).scale || []);
  }
  if (has("system")) fill(qs("[data-system-form]", ctx.root), systemValues());
  if (has("data")) qs("[data-data-panel]", ctx.root).innerHTML = dataHtml();

  if (has("centers")) {
    centerTable = dataTable(qs("[data-center-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["name", "code", "city"],
      columns: [
        { key: "name", label: "Center", sortable: true, render: (r) => html`<div class="cell-user"><span class="icon-tile icon-tile-sm tone-blue">${raw(icon("Building2", { size: 16 }))}</span><div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.code} · ${r.city || "—"}</span></div></div>` },
        { key: "address", label: "Address", hideBelow: "md", render: (r) => html`<span class="text-sm">${r.address || "—"}</span>` },
        { key: "phone", label: "Phone", hideBelow: "md" },
        { key: "batches", label: "Batches", sortable: true, align: "right" },
        { key: "students", label: "Students", sortable: true, align: "right" },
      ],
      rowActions: [
        { label: "Edit", icon: "Pencil", onClick: (r) => centerFlow(r.id) },
        { label: "Delete", icon: "Trash2", danger: true, onClick: (r) => deleteCenter(r) },
      ],
      onRowClick: (r) => centerFlow(r.id),
      empty: emptyState({ icon: "Building2", title: "No centers", text: "Add your first center.", actionLabel: "Add center", actionAttrs: 'data-act="new-center"' }),
    });
  }

  if (has("calendar")) {
    eventTable = dataTable(qs("[data-event-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["title", "description"],
      filters: [
        { key: "type", label: "Type", options: Object.entries(EVENT_TYPES) },
        { key: "when", label: "When", options: [["upcoming", "Upcoming"], ["past", "Past"]] },
      ],
      columns: [
        { key: "title", label: "Title", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${r.description || ""}</span></div>` },
        { key: "type", label: "Type", render: (r) => html`<span class="badge tone-${raw(EVENT_TONES[r.type] || "slate")}">${EVENT_TYPES[r.type] || titleCase(r.type)}</span>` },
        { key: "start", label: "Date", sortable: true, render: (r) => (r.end && r.end !== r.start ? `${date(r.start)} – ${date(r.end)}` : date(r.start)) },
        { key: "centerName", label: "Center", hideBelow: "md" },
      ],
      rowActions: [
        { label: "Edit", icon: "Pencil", onClick: (r) => eventFlow(r.id) },
        { label: "Delete", icon: "Trash2", danger: true, onClick: (r) => deleteEvent(r) },
      ],
      onRowClick: (r) => eventFlow(r.id),
      empty: emptyState({ icon: "CalendarDays", title: "No events", text: "Add holidays and academy events." }),
    });
    if (activeTab === "calendar") ensureCalendar();
  }

  if (has("activity")) {
    const roles = store.get("roles");
    activityTable = dataTable(qs("[data-activity-table]", ctx.root), {
      rows: [],
      searchKeys: ["summary", "action", "actorName", "entity"],
      pageSize: 25,
      filters: [
        { key: "actorRole", label: "Role", options: [...roles.map((r) => [r.id, r.name]), ["system", "System"]] },
        { key: "module", label: "Area", options: [] },
      ],
      columns: [
        { key: "at", label: "When", sortable: true, render: (r) => html`${relative(r.at)}<div class="cell-sub">${dateTime(r.at)}</div>` },
        { key: "actorName", label: "Actor", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.actorName, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.actorName}</span><span class="cell-sub">${r.roleName}</span></div></div>` },
        { key: "action", label: "Action", render: (r) => html`<span class="chip">${r.action}</span>` },
        { key: "entity", label: "Entity", hideBelow: "md", render: (r) => html`${r.entity || "—"}${r.entityId ? html`<div class="cell-sub">${r.entityId}</div>` : raw("")}` },
        { key: "summary", label: "Details", hideBelow: "sm" },
      ],
      empty: emptyState({ icon: "Activity", title: "No activity recorded", text: "Actions like payments, attendance and settings changes are logged here." }),
    });
  }
}

/* ---------- refresh ---------- */

function refresh() {
  qs("[data-banner]", ctx.root).innerHTML = demoBanner();
  if (!visible.length) {
    qs(".card", ctx.root).innerHTML = emptyState({ icon: "Settings", title: "No settings available", text: "Your role has no settings permissions." });
    return;
  }
  centerTable?.update(
    store.get("centers").map((c) => {
      const batchIds = store.where("batches", (b) => b.centerId === c.id).map((b) => b.id);
      return { ...c, batches: batchIds.length, students: store.count("users", (u) => u.role === "student" && u.status === "active" && u.centerId === c.id) };
    })
  );
  if (eventTable) {
    eventTable.update(
      store
        .get("events")
        .map((e) => ({ ...e, centerName: e.centerId ? store.byId("centers", e.centerId)?.name || "—" : "All centers", when: (e.end || e.start).slice(0, 10) >= today() ? "upcoming" : "past" }))
        .sort((a, b) => a.start.localeCompare(b.start))
    );
    if (calendar) {
      calendar.removeAllEvents();
      calendar.addEventSource(store.get("events").map(toFcEvent));
    }
  }
  if (activityTable) {
    const rows = store
      .get("activity")
      .slice()
      .reverse()
      .map((a) => ({ ...a, actorName: userById(a.actorId)?.name || (a.actorId === "system" ? "System" : "Unknown user"), roleName: store.byId("roles", a.actorRole)?.name || titleCase(a.actorRole || "system"), module: String(a.action || "").split(".")[0] }));
    activityTable.update(rows);
    const areaSel = qs('[data-activity-table] [data-dt-filter="module"]', ctx.root);
    if (areaSel && areaSel.options.length <= 1) {
      const mods = [...new Set(rows.map((r) => r.module))].sort();
      mods.forEach((m) => areaSel.add(new Option(titleCase(m), m)));
    }
  }
  if (has("data")) paintUsage();
}

/* ---------- institution ---------- */

function institutionHtml() {
  return html`
    <div class="grid grid-main-side">
      <form data-inst-form novalidate>
        ${raw(
          fieldsHtml([
            { name: "i_name", label: "Institution name", required: true, span: 2 },
            { name: "i_tagline", label: "Tagline", span: 2 },
            { name: "i_address", label: "Address", type: "textarea", rows: 2, span: 2 },
            { name: "i_phone", label: "Phone", type: "tel", placeholder: "+91 99928 87708" },
            { name: "i_email", label: "Email", type: "email" },
            { name: "i_gstin", label: "GSTIN", placeholder: "15 characters, e.g. 06AAAAA0000A1Z5", help: "Printed on invoices and receipts." },
            { name: "i_affiliations", label: "Affiliations", placeholder: "NIELIT, HKCL", help: "Comma separated." },
          ])
        )}
        <div class="form-actions set-actions"><button type="submit" class="btn btn-primary">${raw(icon("Save", { size: 16 }))}Save institution</button></div>
      </form>
      <div class="card set-preview">
        <div class="card-header"><div><h3 class="card-title">Where this appears</h3><p class="card-subtitle">Invoices, receipts, admit cards, transcripts and printed reports</p></div></div>
        <div class="card-body" data-inst-preview></div>
      </div>
    </div>`;
}

function instValues() {
  const i = settings().institution || {};
  return { i_name: i.name || "", i_tagline: i.tagline || "", i_address: i.address || "", i_phone: i.phone || "", i_email: i.email || "", i_gstin: i.gstin || "", i_affiliations: (i.affiliations || []).join(", ") };
}

function paintInstPreview() {
  const el = qs("[data-inst-preview]", ctx.root);
  if (!el) return;
  const i = settings().institution || {};
  el.innerHTML = html`<div class="set-doc-head"><span class="print-mark">OM</span><div><div class="fw-700 text-title">${i.name || "—"}</div><div class="text-sm text-muted">${i.address || ""}</div><div class="text-sm text-muted">${[i.phone, i.email].filter(Boolean).join(" · ")}${i.gstin ? " · GSTIN " + i.gstin : ""}</div></div></div>
    ${(i.affiliations || []).length ? html`<div class="cluster section-gap">${raw(i.affiliations.map((a) => html`<span class="chip">${a}</span>`).join(""))}</div>` : raw("")}`;
}

async function saveInstitution(form) {
  const d = serialize(form);
  const e = {};
  if (!d.i_name.trim()) e.i_name = "Enter the institution name.";
  if (d.i_email.trim() && !EMAIL_RE.test(d.i_email.trim())) e.i_email = "Enter a valid email address.";
  if (d.i_phone.trim() && !PHONE_RE.test(d.i_phone.trim())) e.i_phone = "Enter a valid phone number.";
  if (d.i_gstin.trim() && !GSTIN_RE.test(d.i_gstin.trim().toUpperCase())) e.i_gstin = "A GSTIN has 15 characters, like 06AAAAA0000A1Z5.";
  if (!showErrors(form, e)) return;
  const institution = {
    ...(settings().institution || {}),
    name: d.i_name.trim(),
    tagline: d.i_tagline.trim(),
    address: d.i_address.trim(),
    phone: d.i_phone.trim(),
    email: d.i_email.trim(),
    gstin: d.i_gstin.trim().toUpperCase(),
    affiliations: d.i_affiliations.split(",").map((s) => s.trim()).filter(Boolean),
  };
  await run(() => services.updateSettings(ctx.user, { institution }), { success: "Institution details saved.", error: "Couldn't save the institution details" });
}

/* ---------- centers ---------- */

async function centerFlow(id) {
  const c = id ? store.byId("centers", id) : null;
  if (id && !c) return toast("That center no longer exists.", { type: "warning" });
  const data = await modal.form({
    title: c ? `Edit ${c.name}` : "Add center",
    submitLabel: c ? "Save center" : "Add center",
    fields: [
      { name: "c_name", label: "Center name", required: true, span: 2, placeholder: "e.g. Hisar Center" },
      { name: "c_code", label: "Code", required: true, placeholder: "HSR" },
      { name: "c_city", label: "City", required: true },
      { name: "c_address", label: "Address", type: "textarea", rows: 2, span: 2 },
      { name: "c_phone", label: "Phone", type: "tel", span: 2 },
    ],
    values: { c_name: c?.name || "", c_code: c?.code || "", c_city: c?.city || "", c_address: c?.address || "", c_phone: c?.phone || "" },
    validate: (d) => {
      const e = {};
      const code = d.c_code.trim().toUpperCase();
      if (!d.c_name.trim()) e.c_name = "Enter a name.";
      if (!/^[A-Z0-9]{2,6}$/.test(code)) e.c_code = "2–6 letters or digits.";
      else if (store.get("centers").some((x) => x.code === code && x.id !== id)) e.c_code = "Another center already uses this code.";
      if (!d.c_city.trim()) e.c_city = "Enter the city.";
      if (d.c_phone.trim() && !PHONE_RE.test(d.c_phone.trim())) e.c_phone = "Enter a valid phone number.";
      return e;
    },
  });
  if (!data) return;
  const patch = { name: data.c_name.trim(), code: data.c_code.trim().toUpperCase(), city: data.c_city.trim(), address: data.c_address.trim(), phone: data.c_phone.trim() };
  await run(() => services.saveCenter(ctx.user, id || null, patch), { success: c ? "Center saved." : `${patch.name} added.`, error: "Couldn't save the center" });
}

async function deleteCenter(r) {
  if (r.batches) {
    toast(`${r.name} still has ${plural(r.batches, "batch", "batches")}. Move or close them in Course Management first.`, { type: "warning", duration: 6000 });
    return;
  }
  const ok = await confirm({ title: `Delete ${r.name}?`, message: "The center is removed from every list. This can't be undone.", confirmLabel: "Delete center", danger: true });
  if (!ok) return;
  await run(() => services.removeCenter(ctx.user, r.id), { success: `${r.name} deleted.`, error: "Couldn't delete the center" });
}

/* ---------- calendar ---------- */

function ensureCalendar() {
  if (calendar || calendarPending) return;
  const el = qs("[data-calendar]", ctx.root);
  if (!el) return;
  el.innerHTML = html`<div class="empty-state">${raw(icon("LoaderCircle", { size: 22 }))}<p class="empty-text">Loading calendar…</p></div>`;
  calendarPending = monthCalendar(el, {
    events: [],
    initialDate: today(),
    mobile: window.matchMedia("(max-width: 640px)").matches,
    onEventClick: (ev) => eventFlow(ev.id),
    onDateClick: (info) => eventFlow(null, info.dateStr),
  })
    .then((cal) => {
      el.querySelector(".empty-state")?.remove();
      calendar = cal;
      calendar.addEventSource(store.get("events").map(toFcEvent));
    })
    .catch((err) => {
      console.error(err);
      el.innerHTML = emptyState({ icon: "CalendarX", title: "The calendar couldn't load", text: "The list below still works. Reload the page to try again." });
    })
    .finally(() => (calendarPending = null));
}

async function eventFlow(id, onDate) {
  const ev = id ? store.byId("events", id) : null;
  if (id && !ev) return toast("That event no longer exists.", { type: "warning" });
  const data = await modal.form({
    title: ev ? "Edit event" : "Add event",
    submitLabel: ev ? "Save event" : "Add event",
    fields: [
      { name: "e_title", label: "Title", required: true, span: 2 },
      { name: "e_type", label: "Type", type: "select", required: true, options: Object.entries(EVENT_TYPES) },
      { name: "e_center", label: "Center", type: "select", options: [["", "All centers"], ...store.get("centers").map((c) => [c.id, c.name])] },
      { name: "e_start", label: "Starts", type: "date", required: true },
      { name: "e_end", label: "Ends", type: "date", required: true },
      { name: "e_desc", label: "Description", type: "textarea", rows: 2, span: 2 },
    ],
    values: { e_title: ev?.title || "", e_type: ev?.type || "event", e_center: ev?.centerId || "", e_start: (ev?.start || onDate || today()).slice(0, 10), e_end: (ev?.end || ev?.start || onDate || today()).slice(0, 10), e_desc: ev?.description || "" },
    validate: (d) => {
      const e = {};
      if (!d.e_title.trim()) e.e_title = "Enter a title.";
      if (!d.e_start) e.e_start = "Pick a start date.";
      if (!d.e_end) e.e_end = "Pick an end date.";
      else if (d.e_start && d.e_end < d.e_start) e.e_end = "Must be on or after the start date.";
      return e;
    },
  });
  if (!data) return;
  const patch = { title: data.e_title.trim(), type: data.e_type, start: data.e_start, end: data.e_end, allDay: true, centerId: data.e_center || null, audience: ev?.audience || { type: "all" }, description: data.e_desc.trim() };
  if (patch.type === "holiday") {
    const marked = store.count("attendanceSessions", (s) => s.date >= patch.start && s.date <= patch.end);
    if (marked) {
      const ok = await confirm({ title: "Attendance already marked", message: `${plural(marked, "class")} on these dates already have attendance. Those records stay as they are; only future marking is skipped. Save the holiday anyway?`, confirmLabel: "Save holiday" });
      if (!ok) return;
    }
  }
  await run(() => services.saveEvent(ctx.user, id || null, patch), { success: ev ? "Event saved." : `${EVENT_TYPES[patch.type]} added to the calendar.`, error: "Couldn't save the event" });
}

async function deleteEvent(r) {
  const ok = await confirm({ title: `Delete "${r.title}"?`, message: "It will be removed from every calendar. This can't be undone.", confirmLabel: "Delete", danger: true });
  if (!ok) return;
  await run(() => services.removeEvent(ctx.user, r.id), { success: "Event deleted.", error: "Couldn't delete the event" });
}

/* ---------- rules ---------- */

function rulesHtml() {
  return html`
    <form data-rules-form novalidate>
      ${raw(section("Attendance", "Used for attendance %, warnings and exam eligibility.", fieldsHtml([
        { name: "a_min", label: "Minimum attendance %", type: "number", min: 1, max: 100, step: 1, required: true },
        { name: "a_leave", label: "Approved leave", type: "select", options: [["excluded", "Excluded from the percentage"], ["present", "Counts as present"], ["absent", "Counts as absent"]] },
        { name: "a_window", label: "Edit window (days)", type: "number", min: 0, max: 30, step: 1, help: "How long teachers can change marked attendance." },
      ], 3)))}
      ${raw(section("Exams", "Checked before a student can sit an exam.", fieldsHtml([
        { name: "x_min", label: "Minimum attendance to sit exams %", type: "number", min: 0, max: 100, step: 1 },
        { name: "x_fees", label: "Require fees to be cleared before exams", type: "checkbox" },
      ], 2)))}
      ${raw(section("Grading scale", "Highest grade first. Each row applies from its minimum % up to the row above.", html`
        ${raw(fieldsHtml([{ name: "g_pass", label: "Pass mark %", type: "number", min: 0, max: 100, step: 1 }], 3))}
        <div class="table-scroll set-scale-wrap">
          <table class="simple-table set-scale">
            <thead><tr><th>Grade</th><th>Minimum %</th><th>Grade points</th><th>Label</th><th><span class="sr-only">Remove</span></th></tr></thead>
            <tbody data-scale-body></tbody>
          </table>
        </div>
        <p class="field-error" data-error-for="scale" hidden></p>`, html`<button type="button" class="btn btn-outline btn-sm" data-scale-add>${raw(icon("Plus", { size: 14 }))}Add grade</button>`))}
      ${raw(section("Fees", "Defaults for new invoices and reminders.", fieldsHtml([
        { name: "f_gst", label: "Default GST %", type: "number", min: 0, max: 28, step: 1 },
        { name: "f_reminders", label: "Reminder days before due", placeholder: "7, 3, 1", help: "Comma separated, e.g. 7, 3, 1" },
        { name: "f_partial", label: "Allow partial payments", type: "checkbox" },
      ], 3)))}
      <div class="form-actions set-actions"><button type="submit" class="btn btn-primary">${raw(icon("Save", { size: 16 }))}Save rules</button></div>
    </form>`;
}

function rulesValues() {
  const s = settings();
  return {
    a_min: s.attendance?.minPct ?? 75,
    a_leave: s.attendance?.leaveCounts || "excluded",
    a_window: s.attendance?.editWindowDays ?? 3,
    x_min: s.exams?.minAttendancePct ?? 0,
    x_fees: !!s.exams?.requireFeesCleared,
    g_pass: s.grading?.passPct ?? 35,
    f_gst: s.fees?.gstPct ?? 0,
    f_reminders: (s.fees?.reminderDaysBefore || []).join(", "),
    f_partial: s.fees?.allowPartial !== false,
  };
}

function paintScale(scale) {
  const body = qs("[data-scale-body]", ctx.root);
  if (!body) return;
  body.innerHTML = scale.length
    ? scale
        .map(
          (g) => html`<tr data-scale-row>
          <td><input class="form-control form-control-sm set-in-xs" name="g_grade" value="${g.grade}" aria-label="Grade" maxlength="3"></td>
          <td><input type="number" class="form-control form-control-sm set-in-sm" name="g_min" value="${g.min}" min="0" max="100" step="1" aria-label="Minimum percent"></td>
          <td><input type="number" class="form-control form-control-sm set-in-sm" name="g_point" value="${g.point}" min="0" max="10" step="0.5" aria-label="Grade points"></td>
          <td><input class="form-control form-control-sm" name="g_label" value="${g.label || ""}" aria-label="Label"></td>
          <td class="text-right"><button type="button" class="btn btn-icon btn-ghost btn-sm" data-scale-remove aria-label="Remove grade">${raw(icon("Trash2", { size: 15 }))}</button></td>
        </tr>`
        )
        .join("")
    : html`<tr><td colspan="5" class="text-muted">No grades — add at least two.</td></tr>`;
}

function readScale() {
  return qsa("[data-scale-row]", ctx.root).map((tr) => ({
    grade: tr.querySelector('[name="g_grade"]').value.trim(),
    min: tr.querySelector('[name="g_min"]').value === "" ? NaN : Number(tr.querySelector('[name="g_min"]').value),
    point: tr.querySelector('[name="g_point"]').value === "" ? NaN : Number(tr.querySelector('[name="g_point"]').value),
    label: tr.querySelector('[name="g_label"]').value.trim(),
  }));
}

function validateScale(scale) {
  if (scale.length < 2) return "Add at least two grades.";
  const seen = new Set();
  for (let i = 0; i < scale.length; i++) {
    const g = scale[i];
    if (!g.grade) return `Row ${i + 1}: enter a grade.`;
    if (seen.has(g.grade.toUpperCase())) return `Grade "${g.grade}" appears twice.`;
    seen.add(g.grade.toUpperCase());
    if (!Number.isFinite(g.min) || g.min < 0 || g.min > 100) return `${g.grade}: minimum must be between 0 and 100.`;
    if (!Number.isFinite(g.point) || g.point < 0 || g.point > 10) return `${g.grade}: grade points must be between 0 and 10.`;
    if (i > 0 && !(g.min < scale[i - 1].min)) return `${g.grade}: minimums must go down from top to bottom, with no repeats (${scale[i - 1].grade} is ${scale[i - 1].min}%).`;
    if (i > 0 && g.point > scale[i - 1].point) return `${g.grade}: grade points can't be higher than the grade above.`;
  }
  if (scale[scale.length - 1].min !== 0) return "The last grade must start at 0% so every score gets a grade.";
  return null;
}

async function saveRules(form) {
  const d = serialize(form);
  const e = {};
  const num0 = (v) => (v === "" ? NaN : Number(v));
  if (!(num0(d.a_min) >= 1 && num0(d.a_min) <= 100)) e.a_min = "Between 1 and 100.";
  if (!(num0(d.a_window) >= 0 && num0(d.a_window) <= 30)) e.a_window = "Between 0 and 30 days.";
  if (d.x_min !== "" && !(num0(d.x_min) >= 0 && num0(d.x_min) <= 100)) e.x_min = "Between 0 and 100.";
  if (!(num0(d.g_pass) >= 0 && num0(d.g_pass) <= 100)) e.g_pass = "Between 0 and 100.";
  if (d.f_gst !== "" && !(num0(d.f_gst) >= 0 && num0(d.f_gst) <= 28)) e.f_gst = "Between 0 and 28.";
  const reminders = d.f_reminders.split(",").map((s) => s.trim()).filter(Boolean);
  if (reminders.some((r) => !/^\d{1,2}$/.test(r))) e.f_reminders = "Use whole days separated by commas, e.g. 7, 3, 1.";
  const scale = readScale();
  const scaleErr = validateScale(scale);
  if (scaleErr) e.scale = scaleErr;
  if (!showErrors(form, e)) return;
  const s = settings();
  await run(
    () =>
      services.updateSettings(ctx.user, {
        attendance: { ...(s.attendance || {}), minPct: Number(d.a_min), leaveCounts: d.a_leave, editWindowDays: Number(d.a_window) },
        exams: { ...(s.exams || {}), minAttendancePct: d.x_min === "" ? 0 : Number(d.x_min), requireFeesCleared: !!d.x_fees },
        grading: { ...(s.grading || {}), passPct: Number(d.g_pass), scale: scale.map((g) => ({ grade: g.grade, min: g.min, point: g.point, label: g.label })) },
        fees: { ...(s.fees || {}), gstPct: d.f_gst === "" ? 0 : Number(d.f_gst), allowPartial: !!d.f_partial, reminderDaysBefore: [...new Set(reminders.map(Number))].sort((a, b) => b - a) },
      }),
    { success: "Rules saved. Attendance %, grades and eligibility now use them everywhere.", error: "Couldn't save the rules" }
  );
}

/* ---------- system ---------- */

function systemHtml() {
  const o = getOverride();
  return html`
    <div class="grid grid-2">
      <form data-system-form novalidate>
        ${raw(section("Portal behaviour", "", html`
          <label class="list-row set-toggle-row">
            <div class="list-row-main"><div class="list-row-title">Students can start forum threads</div><div class="list-row-sub">When off, students can still reply to existing threads.</div></div>
            <input type="checkbox" class="toggle" name="s_forum">
          </label>
          ${raw(fieldsHtml([
            { name: "s_upload", label: "Max upload size (KB)", type: "number", min: 100, max: 10240, step: 1, help: "Applies to assignments, leave documents and resources." },
            { name: "s_timeout", label: "Session timeout (minutes)", type: "number", min: 5, max: 480, step: 5 },
            { name: "s_banner", label: "Maintenance banner", span: 2, placeholder: "Leave empty to hide", help: "Shown at the top of both portals." },
          ]))}`))}
        <div class="form-actions set-actions"><button type="submit" class="btn btn-primary">${raw(icon("Save", { size: 16 }))}Save system settings</button></div>
      </form>
      <div class="card set-demo-card">
        <div class="card-header"><div><h3 class="card-title">Demo date</h3><p class="card-subtitle">Pretend today is another day</p></div>${raw(o ? html`<span class="badge tone-amber">Active</span>` : html`<span class="badge tone-slate">Off</span>`)}</div>
        <div class="card-body">
          <div class="alert tone-${raw(o ? "amber" : "blue")} section-gap">${raw(icon(o ? "CalendarClock" : "Info", { size: 18 }))}<div class="alert-body">${o ? html`The portal currently thinks today is <strong>${date(o)}</strong> (real date: ${date(new Date().toISOString())}).` : html`Set a date to see how the portal looks on a different day — invoices become overdue, deadlines pass and exams move closer.`} It only affects this browser and is not saved in exports. Clear it when you're done.</div></div>
          <form class="cluster" data-demo-form novalidate>
            <input type="date" class="form-control set-demo-input" name="demoDate" value="${o || today()}" aria-label="Demo date">
            <button type="submit" class="btn btn-primary">${raw(icon("CalendarClock", { size: 16 }))}Apply</button>
            ${o ? html`<button type="button" class="btn btn-outline" data-act="clear-date">Clear</button>` : raw("")}
          </form>
        </div>
      </div>
    </div>`;
}

function systemValues() {
  const s = settings().system || {};
  return { s_forum: s.studentForumPosting !== false, s_upload: s.maxUploadKB ?? 2048, s_timeout: s.sessionTimeoutMin ?? 60, s_banner: s.maintenanceBanner || "" };
}

async function saveSystem(form) {
  const d = serialize(form);
  const e = {};
  if (!(Number(d.s_upload) >= 100 && Number(d.s_upload) <= 10240)) e.s_upload = "Between 100 and 10240 KB.";
  if (!(Number(d.s_timeout) >= 5 && Number(d.s_timeout) <= 480)) e.s_timeout = "Between 5 and 480 minutes.";
  if (d.s_banner.length > 160) e.s_banner = "Keep it under 160 characters.";
  if (!showErrors(form, e)) return;
  await run(() => services.updateSettings(ctx.user, { system: { ...(settings().system || {}), studentForumPosting: !!d.s_forum, maxUploadKB: Number(d.s_upload), sessionTimeoutMin: Number(d.s_timeout), maintenanceBanner: d.s_banner.trim() } }), { success: "System settings saved.", error: "Couldn't save the system settings" });
}

async function applyDemoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return toast("Pick a valid date.", { type: "warning" });
  const ok = await confirm({ title: `Use ${date(value)} as today?`, message: "The page reloads and every date-based screen (dues, deadlines, attendance) follows the new date in this browser.", confirmLabel: "Set demo date" });
  if (!ok) return;
  const res = await run(() => services.setDemoDate(ctx.user, value).then(() => true), { success: `Demo date set to ${date(value)}. Reloading…`, error: "Couldn't set the demo date" });
  if (res) setTimeout(() => location.reload(), 700);
}

async function clearDemoDate() {
  const res = await run(() => services.setDemoDate(ctx.user, null).then(() => true), { success: "Demo date cleared. Reloading…", error: "Couldn't clear the demo date" });
  if (res) setTimeout(() => location.reload(), 700);
}

/* ---------- activity ---------- */

function exportActivity() {
  const rows = store.get("activity").slice().reverse();
  if (!rows.length) return toast("There is no activity to export.", { type: "info" });
  downloadCsv(`om-academy-activity-${today()}.csv`, rows, [
    { label: "When", value: (r) => dateTime(r.at) },
    { label: "Actor", value: (r) => userById(r.actorId)?.name || r.actorId },
    { key: "actorRole", label: "Role" },
    { key: "action", label: "Action" },
    { key: "entity", label: "Entity" },
    { key: "entityId", label: "Entity id" },
    { key: "summary", label: "Details" },
  ]);
  toast(`Exported ${plural(rows.length, "entry", "entries")}.`, { type: "success" });
}

/* ---------- data ---------- */

function dataHtml() {
  return html`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Storage</h3><p class="card-subtitle">Demo data lives in this browser's local storage</p></div></div>
        <div class="card-body" data-usage></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Export</h3><p class="card-subtitle">Download everything as one JSON file</p></div></div>
        <div class="card-body stack-sm">
          <p class="text-sm m-0">Use an export as a backup, or to move this demo to another browser. Sessions and the demo date are not included.</p>
          <label class="check-label"><input type="checkbox" data-include-files><span>Include uploaded files (larger file)</span></label>
          <div><button type="button" class="btn btn-primary" data-act="export-data">${raw(icon("FileDown", { size: 16 }))}Export JSON</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Import</h3><p class="card-subtitle">Replace all demo data with an export</p></div></div>
        <div class="card-body stack-sm">
          <div class="form-field">
            <label class="form-label" for="set-import-file">Export file (.json)</label>
            <input type="file" id="set-import-file" class="form-control" accept="application/json,.json" data-import-file>
            <p class="field-error" data-import-error hidden></p>
          </div>
          <div data-import-summary></div>
          <div><button type="button" class="btn btn-outline" data-act="import-data">${raw(icon("FileUp", { size: 16 }))}Import…</button></div>
        </div>
      </div>
      <div class="card set-danger-card">
        <div class="card-header"><div><h3 class="card-title">Reset demo data</h3><p class="card-subtitle">Start again from the original sample data</p></div></div>
        <div class="card-body stack-sm">
          <div class="alert tone-rust">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">Every change — payments, attendance, messages, uploads, settings — is erased for everyone using this browser, in every open tab. Export first if you want to keep anything.</div></div>
          <div><button type="button" class="btn btn-danger" data-act="reset-data">${raw(icon("RotateCcw", { size: 16 }))}Reset demo data…</button></div>
        </div>
      </div>
    </div>`;
}

const COUNT_KEYS = ["users", "batches", "enrollments", "attendanceSessions", "invoices", "payments", "notifications", "messages", "activity", "files"];

function paintUsage() {
  const el = qs("[data-usage]", ctx.root);
  if (!el) return;
  const bytes = store.usageBytes();
  const share = (bytes / QUOTA) * 100;
  el.innerHTML = html`
    <div class="cluster-between"><span class="fw-700 text-title text-lg">${fileSize(bytes)}</span><span class="text-sm text-muted">of about ${fileSize(QUOTA)}</span></div>
    <div class="progress tone-${raw(share > 80 ? "rust" : share > 60 ? "amber" : "green")} set-usage-bar"><span class="progress-bar ${raw(pctClass(Math.max(share, 2)))}"></span></div>
    ${!store.isPersistent ? html`<div class="alert tone-amber section-gap">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">Storage is unavailable — changes are kept in memory only until this tab closes.</div></div>` : raw("")}
    <dl class="kv-list">${raw(COUNT_KEYS.map((k) => html`<dt>${titleCase(k.replace(/([A-Z])/g, " $1"))}</dt><dd>${num(store.count(k))}</dd>`).join(""))}</dl>`;
}

async function exportFlow() {
  const includeFiles = !!qs("[data-include-files]", ctx.root)?.checked;
  const payload = await run(() => services.exportData(ctx.user, { includeFiles }), { error: "Couldn't export the data" });
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  downloadBlob(`om-academy-portal-${today()}.json`, blob);
  toast(`Export ready (${fileSize(blob.size)}).`, { type: "success" });
}

let pendingImport = null;

async function readImportFile() {
  const input = qs("[data-import-file]", ctx.root);
  const errEl = qs("[data-import-error]", ctx.root);
  const summary = qs("[data-import-summary]", ctx.root);
  const fail = (msg) => {
    pendingImport = null;
    errEl.hidden = false;
    errEl.textContent = msg;
    input.classList.add("has-error");
    summary.innerHTML = "";
    return null;
  };
  errEl.hidden = true;
  input.classList.remove("has-error");
  const file = input.files?.[0];
  if (!file) return fail("Choose an export file first.");
  if (!/\.json$/i.test(file.name) && file.type !== "application/json") return fail("That isn't a .json file.");
  if (file.size > 25 * 1024 * 1024) return fail("That file is too large (over 25 MB).");
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return fail("The file couldn't be read as JSON. Is it an OM Academy export?");
  }
  if (!payload || payload.app !== store.APP || typeof payload.collections !== "object" || !payload.collections) return fail("This file is not an OM Academy portal export.");
  if (Number(payload.schemaVersion) > store.SCHEMA_VERSION) return fail("This export was made by a newer version of the portal.");
  const users = payload.collections.users;
  if (!Array.isArray(users) || !users.some((u) => u.role === "admin")) return fail("The export has no administrator account, so nobody could sign in to manage it.");
  pendingImport = payload;
  const counts = ["users", "batches", "invoices", "payments"].map((k) => `${num((payload.collections[k] || []).length)} ${titleCase(k)}`).join(" · ");
  summary.innerHTML = html`<div class="alert tone-blue">${raw(icon("FileText", { size: 18 }))}<div class="alert-body"><p class="alert-title">${file.name} · ${fileSize(file.size)}</p>Exported ${payload.exportedAt ? dateTime(payload.exportedAt) : "on an unknown date"} · ${counts}${payload.files_blobs ? " · includes files" : ""}</div></div>`;
  return payload;
}

async function importFlow() {
  const payload = pendingImport || (await readImportFile());
  if (!payload) return;
  const ok = await confirm({ title: "Replace all demo data?", message: "Everything in this browser is overwritten by the file, in every open tab. You may be signed out if your account isn't in the file. This can't be undone.", confirmLabel: "Import and replace", danger: true });
  if (!ok) return;
  const res = await run(() => services.importData(ctx.user, payload).then(() => true), { success: "Data imported. Reloading…", error: "Couldn't import the file" });
  if (res) setTimeout(() => location.reload(), 800);
}

async function resetFlow() {
  const ok = await confirm({ title: "Reset all demo data?", message: "All changes are erased and the original sample data is restored for every tab in this browser. This can't be undone.", confirmLabel: "Continue", danger: true });
  if (!ok) return;
  const typed = await modal.form({
    title: "Confirm reset",
    submitLabel: "Reset demo data",
    size: "sm",
    columns: 1,
    extraBodyHtml: html`<p class="text-sm section-gap">Type <strong>RESET</strong> to confirm.</p>`,
    fields: [{ name: "confirmText", label: "Confirmation", required: true, placeholder: "RESET", autocomplete: "off" }],
    validate: (d) => (d.confirmText.trim() === "RESET" ? {} : { confirmText: "Type RESET in capital letters." }),
  });
  if (!typed) return;
  const res = await run(() => services.resetDemoData(ctx.user).then(() => true), { success: "Demo data reset. Reloading…", error: "Couldn't reset the demo data" });
  if (res) setTimeout(() => location.reload(), 800);
}

/* ---------- wiring ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="new-center"]', () => centerFlow(null));
  on(ctx.root, "click", '[data-act="new-event"]', () => eventFlow(null));
  on(ctx.root, "click", '[data-act="clear-date"]', () => clearDemoDate());
  on(ctx.root, "click", '[data-act="export-activity"]', () => exportActivity());
  on(ctx.root, "click", '[data-act="export-data"]', () => exportFlow());
  on(ctx.root, "click", '[data-act="import-data"]', () => importFlow());
  on(ctx.root, "click", '[data-act="reset-data"]', () => resetFlow());
  on(ctx.root, "change", "[data-import-file]", () => {
    pendingImport = null;
    readImportFile();
  });
  on(ctx.root, "submit", "[data-inst-form]", (e, form) => {
    e.preventDefault();
    saveInstitution(form);
  });
  on(ctx.root, "submit", "[data-rules-form]", (e, form) => {
    e.preventDefault();
    saveRules(form);
  });
  on(ctx.root, "submit", "[data-system-form]", (e, form) => {
    e.preventDefault();
    saveSystem(form);
  });
  on(ctx.root, "submit", "[data-demo-form]", (e, form) => {
    e.preventDefault();
    applyDemoDate(form.elements.namedItem("demoDate").value);
  });
  on(ctx.root, "click", "[data-scale-add]", () => {
    const scale = readScale();
    const last = scale[scale.length - 1];
    if (last && last.min === 0) scale.splice(scale.length - 1, 0, { grade: "", min: "", point: "", label: "" });
    else scale.push({ grade: "", min: scale.length ? "" : 0, point: "", label: "" });
    paintScale(scale.map((g) => ({ ...g, min: Number.isFinite(g.min) ? g.min : "", point: Number.isFinite(g.point) ? g.point : "" })));
  });
  on(ctx.root, "click", "[data-scale-remove]", (e, btn) => {
    btn.closest("tr").remove();
    if (!qsa("[data-scale-row]", ctx.root).length) paintScale([]);
  });
  const inst = qs("[data-inst-form]", ctx.root);
  if (inst) paintInstPreview();
}

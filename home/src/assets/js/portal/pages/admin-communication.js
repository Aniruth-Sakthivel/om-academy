/*
Author       : OM Academy
Description  : Staff → Communication. Tabs (each gated by its own permission):
                 Announcements (audience builder, priority, pin, schedule, channels, read counts),
                 Direct notification (students / batch / role), Inbox (chat threads, reply, read, close),
                 Moderation (reported forum posts, thread pin/lock/hide), Delivery log (simulated email/SMS).
               Every write goes through services via errors.run().
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, dataTable, badge, emptyState, tabs, setSearchParam, getSearchParam, confirm, avatar, fieldsHtml, serialize, showErrors } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateTime, relative, plural, truncate, titleCase } from "../core/format.js";
import { today, addDays } from "../core/clock.js";
import { run } from "../core/errors.js";

const TABS = [
  { id: "announcements", label: "Announcements", icon: "Megaphone", perm: ["announcements.manage"] },
  { id: "direct", label: "Direct notification", icon: "Send", perm: ["notifications.send"] },
  { id: "inbox", label: "Inbox", icon: "Inbox", perm: ["messages.reply"] },
  { id: "moderation", label: "Moderation", icon: "Flag", perm: ["forum.moderate"] },
  { id: "log", label: "Delivery log", icon: "History", perm: ["announcements.manage", "notifications.send", "fees.remind"] },
];

const AUDIENCE_TYPES = { all: "Everyone", role: "By role", center: "By center", course: "By course", batch: "By batch" };
const PRIORITY = { low: ["slate", "Low"], normal: ["blue", "Normal"], high: ["rust", "High"] };

let ctx;
let visible = [];
let annTable;
let threadTable;
let logTable;
let selectedThread = null;
let inboxFilter = "open";
let draft = "";

boot({
  id: "admin-communication",
  portal: "admin",
  perm: ["announcements.manage", "notifications.send", "messages.reply", "forum.moderate"],
  watch: ["announcements", "notifications", "threads", "messages", "forumThreads", "forumPosts", "deliveries", "users", "activity", "enrollments", "batches"],
  mount(c) {
    ctx = c;
    visible = TABS.filter((t) => t.perm.some((p) => ctx.can(p)));
    const id = c.params.get("id");
    if (id && store.byId("threads", id)) selectedThread = id;
    renderLayout();
    wire();
    refresh();
    if (id && store.byId("announcements", id) && ctx.can("announcements.manage")) announcementFlow(id);
  },
  update: () => refresh(),
  unmount() {
    annTable?.destroy();
    threadTable?.destroy();
    logTable?.destroy();
  },
});

/* ---------- helpers ---------- */

const userById = (id) => store.byId("users", id);
const isAssigned = () => sel.roleOf(ctx.user)?.scope === "assigned";
const pctClass = (v) => "pct-" + Math.max(0, Math.min(100, Math.round((Number(v) || 0) / 5) * 5));
const scopeBatches = () => sel.batchesVisibleTo(ctx.user).filter((b) => b.status === "active");
const allowedBatches = () => (isAssigned() ? scopeBatches() : store.where("batches", (b) => b.status === "active"));
const allowedCourses = () => {
  const ids = new Set(allowedBatches().map((b) => b.courseId));
  return isAssigned() ? store.where("courses", (c) => ids.has(c.id)) : store.get("courses");
};

// Students this user may address (teachers: only their batches)
function allowedStudents() {
  const list = store.where("users", (u) => u.role === "student" && u.status === "active");
  if (!isAssigned()) return list.sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(store.where("enrollments", (e) => e.status === "active" && scopeBatches().some((b) => b.id === e.batchId)).map((e) => e.studentId));
  return list.filter((u) => ids.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
}

// Users an announcement audience reaches (mirrors selectors.announcementMatches)
function audienceUsers(aud) {
  const users = store.where("users", (u) => u.status === "active");
  const type = aud?.type || "all";
  const ids = aud?.ids || [];
  if (type === "all") return users;
  if (type === "role") return users.filter((u) => ids.includes(u.role));
  if (type === "center") return users.filter((u) => ids.includes(u.centerId));
  const set = new Set(store.where("enrollments", (e) => e.status === "active" && (type === "batch" ? ids.includes(e.batchId) : ids.includes(e.courseId))).map((e) => e.studentId));
  return users.filter((u) => set.has(u.id));
}

function audienceLabel(aud) {
  const type = aud?.type || "all";
  if (type === "all") return "Everyone";
  const names = (aud.ids || []).map((id) => {
    if (type === "role") return store.byId("roles", id)?.name || id;
    if (type === "center") return store.byId("centers", id)?.name || id;
    if (type === "course") return store.byId("courses", id)?.code || id;
    return store.byId("batches", id)?.code || id;
  });
  return `${AUDIENCE_TYPES[type].replace("By ", "")}: ${names.join(", ") || "—"}`;
}

function annState(a) {
  if (a.publishAt > today()) return ["scheduled", "Scheduled"];
  if (a.expiresAt && a.expiresAt < today()) return ["closed", "Expired"];
  return ["active", "Live"];
}

const canEditAnn = (a) => !isAssigned() || a.createdBy === ctx.user.id;

function participantLabel(p) {
  if (p.type === "user") return userById(p.id)?.name || "Unknown user";
  return (store.byId("roles", p.id)?.name || titleCase(p.id)) + " team";
}

function otherParticipant(t) {
  return t.participants.find((p) => !(p.type === "user" && p.id === ctx.user.id) && !(p.type === "role" && p.id === ctx.user.role)) || t.participants[0];
}

const isUnread = (t) => {
  const r = t.readAt?.[ctx.user.id];
  return !r || r < t.lastMessageAt;
};

/* ---------- layout ---------- */

function renderLayout() {
  const requested = getSearchParam("tab");
  const active = visible.some((t) => t.id === requested) ? requested : visible[0]?.id;
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Communication</li></ol>
        <h1 class="page-title">Communication</h1>
        <p class="page-subtitle">Announcements, direct notifications, student messages and forum moderation.</p>
      </div>
      <div class="page-actions">
        ${ctx.can("messages.reply") ? html`<button type="button" class="btn btn-outline" data-act="new-thread">${raw(icon("MessageSquare", { size: 16 }))}New message</button>` : raw("")}
        ${ctx.can("announcements.manage") ? html`<button type="button" class="btn btn-primary" data-act="new-ann">${raw(icon("Plus", { size: 16 }))}New announcement</button>` : raw("")}
      </div>
    </div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${raw(visible.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t.id}">${raw(icon(t.icon, { size: 15 }))}${t.label} <span class="tab-count" data-count="${t.id}"></span></button>`).join(""))}
      </div>
      ${visible.some((t) => t.id === "announcements") ? html`<div data-tab-panel="announcements" hidden><div data-ann-table></div></div>` : raw("")}
      ${visible.some((t) => t.id === "direct") ? html`<div data-tab-panel="direct" hidden><div class="card-body">${raw(directHtml())}</div></div>` : raw("")}
      ${visible.some((t) => t.id === "inbox") ? html`<div data-tab-panel="inbox" hidden>
        <div class="card-header card-header-plain">
          <div class="segmented" data-inbox-filter>
            <button type="button" data-filter="open">Open</button><button type="button" data-filter="closed">Closed</button><button type="button" data-filter="all">All</button>
          </div>
          <span class="text-sm text-muted" data-inbox-summary></span>
        </div>
        <div class="chat-layout comm-chat"><div class="chat-list" data-thread-list></div><div class="chat-pane" data-thread-pane></div></div>
      </div>` : raw("")}
      ${visible.some((t) => t.id === "moderation") ? html`<div data-tab-panel="moderation" hidden>
        <div class="card-body"><h4 class="drawer-section-title">Reported posts</h4><div data-reported></div></div>
        <div class="card-body comm-section-head"><h4 class="drawer-section-title m-0">Forum threads</h4><p class="text-sm text-muted m-0">Pin important threads, lock finished discussions or hide off-topic ones.</p></div>
        <div data-thread-table></div>
      </div>` : raw("")}
      ${visible.some((t) => t.id === "log") ? html`<div data-tab-panel="log" hidden>
        <div class="card-body"><div class="alert tone-blue">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Email and SMS are simulated in this demo. Every message the portal would have sent is recorded here.</div></div></div>
        <div data-log-table></div>
      </div>` : raw("")}
    </div>`;

  if (!visible.length) {
    ctx.root.querySelector(".card").innerHTML = emptyState({ icon: "Megaphone", title: "Nothing to show", text: "Your role has no communication permissions." });
    return;
  }

  tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });

  if (qs("[data-ann-table]", ctx.root)) {
    annTable = dataTable(qs("[data-ann-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["title", "body", "audienceText"],
      filters: [
        { key: "stateKey", label: "Status", options: [["active", "Live"], ["scheduled", "Scheduled"], ["closed", "Expired"]] },
        { key: "priority", label: "Priority", options: Object.entries(PRIORITY).map(([k, v]) => [k, v[1]]) },
      ],
      columns: [
        { key: "title", label: "Announcement", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.pinned ? raw(icon("Pin", { size: 13, cls: "comm-pin" })) : raw("")}${r.title}</span><span class="cell-sub">${truncate(r.body, 80)}</span></div>` },
        { key: "audienceText", label: "Audience", hideBelow: "md", render: (r) => html`<span class="chip">${raw(icon(r.audience?.type === "all" ? "Globe" : "Users", { size: 12 }))}${r.audienceText}</span>` },
        { key: "priority", label: "Priority", render: (r) => html`<span class="badge tone-${raw((PRIORITY[r.priority] || PRIORITY.normal)[0])}">${(PRIORITY[r.priority] || PRIORITY.normal)[1]}</span>` },
        { key: "publishAt", label: "Window", sortable: true, hideBelow: "md", render: (r) => html`${date(r.publishAt)}<div class="cell-sub">${r.expiresAt ? "until " + date(r.expiresAt) : "no expiry"}</div>` },
        { key: "readPct", label: "Read", sortable: true, render: (r) => html`<div class="comm-read"><span class="text-sm">${r.readCount} / ${r.audienceSize}</span><div class="progress progress-sm tone-green"><span class="progress-bar ${raw(pctClass(r.readPct))}"></span></div></div>` },
        { key: "stateKey", label: "Status", render: (r) => badge(r.stateKey, r.stateLabel) },
      ],
      rowActions: [
        { label: "Edit", icon: "Pencil", hidden: (r) => !canEditAnn(r), onClick: (r) => announcementFlow(r.id) },
        { label: "Pin to top", icon: "Pin", hidden: (r) => r.pinned || !canEditAnn(r), onClick: (r) => pinAnn(r, true) },
        { label: "Unpin", icon: "Pin", hidden: (r) => !r.pinned || !canEditAnn(r), onClick: (r) => pinAnn(r, false) },
        { label: "Delete", icon: "Trash2", danger: true, hidden: (r) => !canEditAnn(r), onClick: (r) => deleteAnn(r) },
      ],
      onRowClick: (r) => (canEditAnn(r) ? announcementFlow(r.id) : null),
      empty: emptyState({ icon: "Megaphone", title: "No announcements", text: "Post one to reach students and staff on their dashboards.", actionLabel: "New announcement", actionAttrs: 'data-act="new-ann"' }),
    });
  }

  if (qs("[data-thread-table]", ctx.root)) {
    threadTable = dataTable(qs("[data-thread-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["title", "authorName", "scopeLabel"],
      filters: [{ key: "flag", label: "State", options: [["normal", "Normal"], ["pinned", "Pinned"], ["locked", "Locked"], ["hidden", "Hidden"]] }],
      columns: [
        { key: "title", label: "Thread", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${r.scopeLabel} · ${plural(r.posts, "reply", "replies")} · ${r.views || 0} views</span></div>` },
        { key: "authorName", label: "Started by", hideBelow: "md" },
        { key: "lastPostAt", label: "Last activity", sortable: true, hideBelow: "md", render: (r) => relative(r.lastPostAt) },
        { key: "flag", label: "State", render: (r) => html`<div class="cluster">${r.pinned ? raw(html`<span class="badge tone-blue">Pinned</span>`) : raw("")}${r.locked ? raw(badge("locked", "Locked")) : raw("")}${r.hidden ? raw(badge("hidden", "Hidden")) : raw("")}${!r.pinned && !r.locked && !r.hidden ? raw(badge("active", "Visible")) : raw("")}</div>` },
      ],
      rowActions: [
        { label: "Pin", icon: "Pin", hidden: (r) => r.pinned, onClick: (r) => modThread(r, { pinned: true }, "Thread pinned.") },
        { label: "Unpin", icon: "Pin", hidden: (r) => !r.pinned, onClick: (r) => modThread(r, { pinned: false }, "Thread unpinned.") },
        { label: "Lock", icon: "Lock", hidden: (r) => r.locked, onClick: (r) => modThread(r, { locked: true }, "Thread locked — no new replies.") },
        { label: "Unlock", icon: "Lock", hidden: (r) => !r.locked, onClick: (r) => modThread(r, { locked: false }, "Thread unlocked.") },
        { label: "Hide", icon: "Eye", danger: true, hidden: (r) => r.hidden, onClick: (r) => modThread(r, { hidden: true }, "Thread hidden from students.") },
        { label: "Unhide", icon: "Eye", hidden: (r) => !r.hidden, onClick: (r) => modThread(r, { hidden: false }, "Thread visible again.") },
      ],
      empty: emptyState({ icon: "MessagesSquare", title: "No forum threads", text: "Threads students start in the discussion forum appear here." }),
    });
  }

  if (qs("[data-log-table]", ctx.root)) {
    logTable = dataTable(qs("[data-log-table]", ctx.root), {
      rows: [],
      searchKeys: ["to", "subject"],
      filters: [
        { key: "channel", label: "Channel", options: [["email", "Email"], ["sms", "SMS"]] },
        { key: "status", label: "Status", options: [["sent", "Sent"], ["failed", "Failed"]] },
      ],
      columns: [
        { key: "channel", label: "Channel", render: (r) => html`<span class="chip">${raw(icon(r.channel === "sms" ? "Smartphone" : "Mail", { size: 12 }))}${r.channel === "sms" ? "SMS" : "Email"}</span>` },
        { key: "to", label: "Recipient", sortable: true },
        { key: "subject", label: "Subject", render: (r) => truncate(r.subject, 70) },
        { key: "at", label: "Sent", sortable: true, render: (r) => dateTime(r.at) },
        { key: "status", label: "Status", render: (r) => badge(r.status === "sent" ? "success" : "failed", r.status === "sent" ? "Sent" : "Failed") },
      ],
      empty: emptyState({ icon: "Mail", title: "Nothing delivered yet", text: "Fee reminders and email/SMS announcements are logged here." }),
    });
  }

  wireDirect();
}

/* ---------- refresh ---------- */

function annRows() {
  return store
    .get("announcements")
    .map((a) => {
      const size = audienceUsers(a.audience).length;
      const readCount = (a.readBy || []).length;
      const [stateKey, stateLabel] = annState(a);
      return { ...a, audienceText: audienceLabel(a.audience), audienceSize: size, readCount, readPct: size ? (readCount / size) * 100 : 0, stateKey, stateLabel };
    })
    .sort((a, b) => (b.pinned - a.pinned) || b.publishAt.localeCompare(a.publishAt));
}

function forumRows() {
  return store
    .get("forumThreads")
    .map((t) => ({
      ...t,
      authorName: userById(t.authorId)?.name || "—",
      scopeLabel: t.scope?.type === "course" ? store.byId("courses", t.scope.id)?.code || "Course" : t.scope?.type === "batch" ? store.byId("batches", t.scope.id)?.code || "Batch" : "General",
      posts: store.count("forumPosts", (p) => p.threadId === t.id && !p.hidden),
      flag: t.hidden ? "hidden" : t.locked ? "locked" : t.pinned ? "pinned" : "normal",
    }))
    .sort((a, b) => b.lastPostAt.localeCompare(a.lastPostAt));
}

function setCount(id, n) {
  const el = qs(`[data-count="${id}"]`, ctx.root);
  if (el) el.textContent = n || "";
}

function refresh() {
  if (!visible.length) return;
  if (annTable) {
    const rows = annRows();
    annTable.update(rows);
    setCount("announcements", rows.filter((r) => r.stateKey === "active").length);
  }
  if (qs("[data-direct-form]", ctx.root)) {
    updateReach();
    renderSentList();
  }
  if (qs("[data-thread-list]", ctx.root)) {
    setCount("inbox", sel.unreadThreadCount(ctx.user));
    renderInbox();
  }
  if (threadTable) {
    threadTable.update(forumRows());
    setCount("moderation", sel.forumModerationQueue().length);
    renderReported();
  }
  if (logTable) {
    const rows = store.get("deliveries").slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    logTable.update(rows);
    setCount("log", rows.length);
  }
}

/* ---------- announcements ---------- */

async function announcementFlow(id) {
  const existing = id ? store.byId("announcements", id) : null;
  if (id && !existing) return toast("That announcement no longer exists.", { type: "warning" });
  if (existing && !canEditAnn(existing)) return toast("You can only edit announcements you posted.", { type: "info" });
  const assigned = isAssigned();
  const typeOptions = Object.entries(AUDIENCE_TYPES).filter(([k]) => !assigned || k === "course" || k === "batch");
  const aud = existing?.audience || { type: assigned ? "batch" : "all", ids: [] };
  const channels = existing?.channels || ["in-app"];

  const promise = modal.form({
    title: existing ? "Edit announcement" : "New announcement",
    submitLabel: existing ? "Save changes" : "Publish",
    size: "lg",
    extraBodyHtml: html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Announcements appear in the notification feed of everyone in the audience from the publish date until they expire. <span data-ann-reach></span></div></div>`,
    fields: [
      { name: "title", label: "Title", required: true, span: 2, placeholder: "e.g. Holiday on Friday" },
      { name: "body", label: "Message", type: "textarea", rows: 4, required: true, span: 2 },
      { name: "audienceType", label: "Audience", type: "select", required: true, options: typeOptions },
      { name: "priority", label: "Priority", type: "select", options: Object.entries(PRIORITY).map(([k, v]) => [k, v[1]]) },
      { name: "roleIds", label: "Roles", type: "select", multiple: true, span: 2, options: store.get("roles").map((r) => [r.id, r.name]) },
      { name: "centerIds", label: "Centers", type: "select", multiple: true, span: 2, options: store.get("centers").map((c) => [c.id, c.name]) },
      { name: "courseIds", label: "Courses", type: "select", multiple: true, span: 2, options: allowedCourses().map((c) => [c.id, `${c.code} — ${c.title}`]) },
      { name: "batchIds", label: "Batches", type: "select", multiple: true, span: 2, options: allowedBatches().map((b) => [b.id, `${b.code} — ${b.name}`]) },
      { name: "publishAt", label: "Publish on", type: "date", required: true },
      { name: "expiresAt", label: "Expires on", type: "date", help: "Leave empty to keep it visible." },
      { name: "pinned", label: "Pin to the top of feeds", type: "checkbox", span: 2 },
      { name: "chEmail", label: "Also send by email (simulated)", type: "checkbox" },
      { name: "chSms", label: "Also send by SMS (simulated)", type: "checkbox" },
    ],
    values: {
      title: existing?.title || "",
      body: existing?.body || "",
      audienceType: aud.type,
      priority: existing?.priority || "normal",
      publishAt: existing?.publishAt || today(),
      expiresAt: existing?.expiresAt || (existing ? "" : addDays(today(), 14)),
      pinned: !!existing?.pinned,
      chEmail: channels.includes("email"),
      chSms: channels.includes("sms"),
    },
    validate: (d) => {
      const e = {};
      if (!d.title.trim()) e.title = "Enter a title.";
      else if (d.title.trim().length > 120) e.title = "Keep the title under 120 characters.";
      if (!d.body.trim()) e.body = "Write the message.";
      if (d.audienceType !== "all" && !(d[d.audienceType + "Ids"] || []).length) e[d.audienceType + "Ids"] = "Choose at least one.";
      if (!d.publishAt) e.publishAt = "Pick a publish date.";
      if (d.expiresAt && d.publishAt && d.expiresAt < d.publishAt) e.expiresAt = "Must be on or after the publish date.";
      return e;
    },
  });

  // modal.form renders synchronously: wire the audience builder on the newest modal
  const overlays = qsa(".modal-overlay");
  const root = overlays[overlays.length - 1];
  const form = root?.querySelector("form");
  if (form) {
    for (const t of ["role", "center", "course", "batch"]) {
      const selEl = form.elements.namedItem(t + "Ids");
      selEl.size = Math.min(6, Math.max(3, selEl.options.length));
      if (aud.type === t) Array.from(selEl.options).forEach((o) => (o.selected = (aud.ids || []).includes(o.value)));
    }
    const sync = () => {
      const type = form.elements.namedItem("audienceType").value;
      for (const t of ["role", "center", "course", "batch"]) form.elements.namedItem(t + "Ids").closest(".form-field").hidden = type !== t;
      const d = serialize(form);
      const n = audienceUsers({ type, ids: d[type + "Ids"] || [] }).length;
      const reach = root.querySelector("[data-ann-reach]");
      if (reach) reach.textContent = `Current audience: ${plural(n, "person", "people")}.`;
    };
    form.addEventListener("change", sync);
    sync();
  }

  const data = await promise;
  if (!data) return;
  const type = data.audienceType;
  const payload = {
    title: data.title.trim(),
    body: data.body.trim(),
    audience: type === "all" ? { type: "all" } : { type, ids: data[type + "Ids"] },
    priority: data.priority || "normal",
    pinned: !!data.pinned,
    publishAt: data.publishAt,
    expiresAt: data.expiresAt || null,
    channels: ["in-app", ...(data.chEmail ? ["email"] : []), ...(data.chSms ? ["sms"] : [])],
  };
  if (existing) await run(() => services.updateAnnouncement(ctx.user, existing.id, payload), { success: "Announcement updated.", error: "Couldn't update the announcement" });
  else await run(() => services.createAnnouncement(ctx.user, payload), { success: payload.publishAt > today() ? `Scheduled for ${date(payload.publishAt)}.` : "Announcement published.", error: "Couldn't publish the announcement" });
}

function pinAnn(a, pinned) {
  return run(() => services.updateAnnouncement(ctx.user, a.id, { pinned }), { success: pinned ? "Pinned to the top of feeds." : "Unpinned.", error: "Couldn't update the announcement" });
}

async function deleteAnn(a) {
  const ok = await confirm({ title: "Delete this announcement?", message: `"${a.title}" will disappear from every feed. This can't be undone.`, confirmLabel: "Delete", danger: true });
  if (!ok) return;
  await run(() => services.removeAnnouncement(ctx.user, a.id), { success: "Announcement deleted.", error: "Couldn't delete the announcement" });
}

/* ---------- direct notification ---------- */

const PAGE_LINKS = [
  ["", "No link"],
  ["student-dashboard.html", "Student dashboard"],
  ["student-fees.html", "Fees & payments"],
  ["student-attendance.html", "Attendance"],
  ["student-assignments.html", "Assignments"],
  ["student-exams.html", "Exams & results"],
  ["student-calendar.html", "Event calendar"],
  ["student-resources.html", "Resources"],
  ["admin-dashboard.html", "Staff dashboard"],
];

function directHtml() {
  const roles = store.where("roles", (r) => r.id !== "student" || true);
  return html`
    <div class="grid grid-main-side">
      <form data-direct-form novalidate>
        ${raw(
          fieldsHtml([
            { name: "recipientType", label: "Send to", type: "select", required: true, options: [["students", "Individual students"], ["batch", "Everyone in a batch"], ["role", "Everyone with a role"]] },
            { name: "batchId", label: "Batch", type: "select", placeholder: "Select a batch", options: allowedBatches().map((b) => [b.id, `${b.code} — ${b.name}`]) },
            { name: "roleId", label: "Role", type: "select", placeholder: "Select a role", options: roles.map((r) => [r.id, r.name]) },
            { name: "studentIds", label: "Students", type: "select", multiple: true, span: 2, options: allowedStudents().map((s) => [s.id, `${s.name} — ${s.rollNo || ""}`]) },
            { name: "title", label: "Title", required: true, span: 2, placeholder: "e.g. Please visit the office" },
            { name: "body", label: "Message", type: "textarea", rows: 4, span: 2 },
            { name: "link", label: "Open this page when tapped", type: "select", options: PAGE_LINKS, span: 2 },
          ])
        )}
        <div class="cluster-between section-gap comm-direct-foot">
          <span class="text-sm text-muted" data-reach></span>
          <button type="submit" class="btn btn-primary">${raw(icon("Send", { size: 16 }))}Send notification</button>
        </div>
      </form>
      <div class="card comm-sent">
        <div class="card-header"><div><h3 class="card-title">Recently sent</h3><p class="card-subtitle">From the activity log</p></div></div>
        <div class="card-body" data-sent-list></div>
      </div>
    </div>`;
}

function directRecipients(d) {
  if (d.recipientType === "students") return d.studentIds || [];
  if (d.recipientType === "batch") return d.batchId ? store.where("enrollments", (e) => e.batchId === d.batchId && e.status === "active").map((e) => e.studentId) : [];
  if (d.recipientType === "role") return d.roleId ? store.where("users", (u) => u.role === d.roleId && u.status === "active").map((u) => u.id) : [];
  return [];
}

function updateReach() {
  const form = qs("[data-direct-form]", ctx.root);
  if (!form) return;
  const d = serialize(form);
  const type = d.recipientType;
  form.elements.namedItem("studentIds").closest(".form-field").hidden = type !== "students";
  form.elements.namedItem("batchId").closest(".form-field").hidden = type !== "batch";
  form.elements.namedItem("roleId").closest(".form-field").hidden = type !== "role";
  const n = new Set(directRecipients(d)).size;
  qs("[data-reach]", form).textContent = n ? `Will reach ${plural(n, "person", "people")}.` : "No recipients selected yet.";
}

function renderSentList() {
  const box = qs("[data-sent-list]", ctx.root);
  if (!box) return;
  const list = store
    .where("activity", (a) => a.action === "notification.send")
    .slice(-6)
    .reverse();
  box.innerHTML = list.length
    ? html`<ul class="timeline">${raw(list.map((a) => html`<li class="timeline-item"><span class="timeline-dot tone-blue"></span><div><div class="timeline-title">${a.summary}</div><div class="timeline-meta">${userById(a.actorId)?.name || "Staff"} · ${relative(a.at)}</div></div></li>`).join(""))}</ul>`
    : emptyState({ icon: "Send", title: "Nothing sent yet", text: "Direct notifications you send will be listed here." });
}

function wireDirect() {
  const form = qs("[data-direct-form]", ctx.root);
  if (!form) return;
  const stu = form.elements.namedItem("studentIds");
  stu.size = 8;
  form.addEventListener("change", updateReach);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = serialize(form);
    const ids = [...new Set(directRecipients(d))];
    const errors = {};
    if (d.recipientType === "students" && !ids.length) errors.studentIds = "Choose at least one student.";
    if (d.recipientType === "batch" && !d.batchId) errors.batchId = "Choose a batch.";
    else if (d.recipientType === "batch" && !ids.length) errors.batchId = "This batch has no active students.";
    if (d.recipientType === "role" && !d.roleId) errors.roleId = "Choose a role.";
    else if (d.recipientType === "role" && !ids.length) errors.roleId = "No active users have this role.";
    if (!d.title.trim()) errors.title = "Enter a title.";
    if (!showErrors(form, errors)) return;
    const res = await run(() => services.sendNotification(ctx.user, { userIds: ids, title: d.title.trim(), body: d.body.trim(), link: d.link || null }), { success: (list) => `Notification sent to ${plural(list.length, "person", "people")}.`, error: "Couldn't send the notification" });
    if (res) {
      form.reset();
      updateReach();
    }
  });
  updateReach();
}

/* ---------- inbox ---------- */

function inboxThreads() {
  const all = sel.threadsFor(ctx.user);
  return inboxFilter === "all" ? all : all.filter((t) => (inboxFilter === "open" ? t.status !== "closed" : t.status === "closed"));
}

function renderInbox() {
  const list = qs("[data-thread-list]", ctx.root);
  const pane = qs("[data-thread-pane]", ctx.root);
  qsa("[data-inbox-filter] [data-filter]", ctx.root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.filter === inboxFilter)));
  const threads = inboxThreads();
  const all = sel.threadsFor(ctx.user);
  qs("[data-inbox-summary]", ctx.root).textContent = `${plural(all.length, "conversation")} · ${sel.unreadThreadCount(ctx.user)} unread`;
  if (selectedThread && !store.byId("threads", selectedThread)) selectedThread = null;

  list.innerHTML = threads.length
    ? threads
        .map((t) => {
          const other = otherParticipant(t);
          const last = store.where("messages", (m) => m.threadId === t.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
          return html`<button type="button" class="chat-thread-item ${raw(t.id === selectedThread ? "is-active" : "")} ${raw(isUnread(t) ? "is-unread" : "")}" data-thread="${t.id}">
            ${raw(avatar({ name: participantLabel(other), size: "sm" }))}
            <div class="chat-thread-main">
              <div class="cluster-between"><div class="chat-thread-subject">${t.subject}</div><span class="text-xs text-muted nowrap">${relative(t.lastMessageAt)}</span></div>
              <div class="chat-thread-preview">${participantLabel(other)}${last ? " · " + last.body : ""}</div>
            </div>
          </button>`;
        })
        .join("")
    : emptyState({ icon: "Inbox", title: inboxFilter === "closed" ? "No closed conversations" : "No conversations", text: "Messages from students to you or your team appear here." });

  const t = selectedThread ? store.byId("threads", selectedThread) : null;
  if (!t) {
    pane.innerHTML = emptyState({ icon: "MessageSquare", title: "Select a conversation", text: all.length ? "Choose a thread on the left to read and reply." : "Start one with “New message”.", actionLabel: ctx.can("messages.reply") ? "New message" : "", actionAttrs: 'data-act="new-thread"' });
    return;
  }
  const msgs = store.where("messages", (m) => m.threadId === t.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const closed = t.status === "closed";
  pane.innerHTML = html`
    <div class="chat-pane-head">
      <div class="cell-user-text">
        <span class="cell-title">${t.subject}</span>
        <span class="cell-sub">${t.participants.map(participantLabel).join(", ")} · ${titleCase(t.category || "general")}</span>
      </div>
      <div class="cluster">
        ${raw(badge(closed ? "closed" : "open", closed ? "Closed" : "Open"))}
        ${isUnread(t) ? html`<button type="button" class="btn btn-outline btn-sm" data-act="mark-read">${raw(icon("CheckCheck", { size: 14 }))}Mark read</button>` : raw("")}
        ${!closed && ctx.can("messages.reply") ? html`<button type="button" class="btn btn-outline btn-sm" data-act="close-thread">${raw(icon("CircleCheck", { size: 14 }))}Close</button>` : raw("")}
      </div>
    </div>
    <div class="chat-messages" data-msgs>
      ${msgs.length
        ? raw(
            msgs
              .map((m) => {
                const mine = m.senderId === ctx.user.id;
                const sender = userById(m.senderId);
                return html`<div class="msg ${raw(mine ? "is-mine" : "")}">${raw(avatar({ name: sender?.name, size: "sm" }))}<div><div class="msg-bubble">${m.body}</div><div class="msg-meta">${mine ? "You" : sender?.name || "Unknown"} · ${dateTime(m.sentAt)}</div></div></div>`;
              })
              .join("")
          )
        : raw(emptyState({ icon: "MessageSquare", title: "No messages yet" }))}
    </div>
    ${closed
      ? html`<div class="chat-compose"><p class="text-sm text-muted m-0">This conversation is closed. The student can start a new one if they need more help.</p></div>`
      : html`<form class="chat-compose" data-compose novalidate>
          <textarea class="form-control" name="body" rows="1" placeholder="Write a reply…" aria-label="Reply">${draft}</textarea>
          <button type="submit" class="btn btn-primary" aria-label="Send reply">${raw(icon("Send", { size: 16 }))}<span class="hide-sm">Send</span></button>
        </form>`}`;
  const box = qs("[data-msgs]", pane);
  if (box) box.scrollTop = box.scrollHeight;
}

function openThread(id) {
  selectedThread = id;
  draft = "";
  setSearchParam("id", id);
  renderInbox();
  const t = store.byId("threads", id);
  if (t && isUnread(t)) run(() => services.markThreadRead(ctx.user, id), { error: "Couldn't mark the conversation as read" });
  qs("[data-compose] textarea", ctx.root)?.focus();
}

async function sendReply(form) {
  const body = form.elements.namedItem("body").value.trim();
  if (!body) {
    toast("Write a message first.", { type: "info" });
    return;
  }
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  const res = await run(() => services.replyThread(ctx.user, selectedThread, { body }), { error: "Couldn't send the reply" });
  btn.disabled = false;
  if (res) {
    draft = "";
    renderInbox();
  }
}

async function closeThreadFlow() {
  const t = store.byId("threads", selectedThread);
  if (!t) return;
  const ok = await confirm({ title: "Close this conversation?", message: "It moves to Closed and replies are turned off.", confirmLabel: "Close conversation" });
  if (!ok) return;
  await run(() => services.closeThread(ctx.user, t.id), { success: "Conversation closed.", error: "Couldn't close the conversation" });
}

async function newThreadFlow() {
  const students = allowedStudents();
  if (!students.length) return toast("There are no students you can message.", { type: "info" });
  const data = await modal.form({
    title: "New message",
    submitLabel: "Send",
    columns: 1,
    fields: [
      { name: "studentId", label: "To", type: "select", required: true, placeholder: "Select a student", options: students.map((s) => [s.id, `${s.name} — ${s.rollNo || ""}`]) },
      { name: "subject", label: "Subject", required: true },
      { name: "body", label: "Message", type: "textarea", rows: 4, required: true },
    ],
    validate: (d) => {
      const e = {};
      if (!d.studentId) e.studentId = "Choose a student.";
      if (!d.subject.trim()) e.subject = "Enter a subject.";
      if (!d.body.trim()) e.body = "Write a message.";
      return e;
    },
  });
  if (!data) return;
  const thread = await run(() => services.startThread(ctx.user, { subject: data.subject.trim(), category: "general", participants: [{ type: "user", id: data.studentId }], body: data.body.trim() }), { success: "Message sent.", error: "Couldn't send the message" });
  if (thread) {
    inboxFilter = "open";
    qs('[data-tab="inbox"]', ctx.root)?.click();
    openThread(thread.id);
  }
}

/* ---------- moderation ---------- */

function renderReported() {
  const box = qs("[data-reported]", ctx.root);
  if (!box) return;
  const posts = sel.forumModerationQueue();
  box.innerHTML = posts.length
    ? html`<div class="stack-sm">${raw(
        posts
          .map((p) => {
            const author = userById(p.authorId);
            const thread = store.byId("forumThreads", p.threadId);
            return html`<div class="alert tone-amber comm-report">
              ${raw(icon("Flag", { size: 18 }))}
              <div class="alert-body">
                <p class="alert-title">${thread?.title || "Forum post"}</p>
                <p class="comm-report-body">${p.body}</p>
                <div class="cluster text-sm">
                  <span class="text-muted">by ${author?.name || "Unknown"} · ${plural(p.reports.length, "report")}</span>
                  ${raw(p.reports.map((r) => html`<span class="chip">${r.reason || "No reason"} — ${userById(r.by)?.name || "user"}</span>`).join(""))}
                </div>
              </div>
              <div class="alert-actions">
                <button type="button" class="btn btn-outline btn-sm" data-mod="approve" data-post="${p.id}">${raw(icon("Check", { size: 14 }))}Keep</button>
                <button type="button" class="btn btn-danger btn-sm" data-mod="hide" data-post="${p.id}">${raw(icon("Ban", { size: 14 }))}Hide post</button>
              </div>
            </div>`;
          })
          .join("")
      )}</div>`
    : emptyState({ icon: "ShieldCheck", title: "No reported posts", text: "When a student reports a post it will wait here for review." });
}

function modThread(r, patch, msg) {
  return run(() => services.moderateForumThread(ctx.user, r.id, patch), { success: msg, error: "Couldn't update the thread" });
}

/* ---------- wiring ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="new-ann"]', () => announcementFlow(null));
  on(ctx.root, "click", '[data-act="new-thread"]', () => newThreadFlow());
  on(ctx.root, "click", "[data-thread]", (e, btn) => openThread(btn.dataset.thread));
  on(ctx.root, "click", "[data-inbox-filter] [data-filter]", (e, btn) => {
    inboxFilter = btn.dataset.filter;
    renderInbox();
  });
  on(ctx.root, "click", '[data-act="mark-read"]', () => run(() => services.markThreadRead(ctx.user, selectedThread), { success: "Marked as read.", error: "Couldn't mark as read" }));
  on(ctx.root, "click", '[data-act="close-thread"]', () => closeThreadFlow());
  on(ctx.root, "submit", "[data-compose]", (e, form) => {
    e.preventDefault();
    sendReply(form);
  });
  on(ctx.root, "input", "[data-compose] textarea", (e, ta) => (draft = ta.value));
  on(ctx.root, "keydown", "[data-compose] textarea", (e, ta) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendReply(ta.form);
    }
  });
  on(ctx.root, "click", "[data-mod]", (e, btn) => {
    const action = btn.dataset.mod;
    run(() => services.moderateForumPost(ctx.user, btn.dataset.post, action), { success: action === "hide" ? "Post hidden from the forum." : "Reports cleared — the post stays visible.", error: "Couldn't moderate the post" });
  });
}

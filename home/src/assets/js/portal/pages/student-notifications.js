/*
Author       : OM Academy
Description  : Student → Notifications & Messages. Unified notification feed (direct notifications + announcements)
               with filters and read state, and a chat inbox with the student's instructors and the academy offices.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, avatar, emptyState, tabs, setSearchParam, getSearchParam, showErrors } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { relative, dateTime, time, date, fileSize, truncate, titleCase } from "../core/format.js";
import { run } from "../core/errors.js";
import * as files from "../core/files.js";

const TABS = ["notifications", "messages"];

// Notification type → icon + tone
const TYPE_META = {
  announcement: { icon: "Megaphone", tone: "purple", label: "Announcements" },
  assignment: { icon: "ClipboardList", tone: "blue", label: "Assignments" },
  grade: { icon: "Award", tone: "green", label: "Grades" },
  exam: { icon: "GraduationCap", tone: "navy", label: "Exams" },
  result: { icon: "Award", tone: "green", label: "Results" },
  transcript: { icon: "FileBadge", tone: "purple", label: "Transcripts" },
  fee: { icon: "Wallet", tone: "amber", label: "Fees" },
  leave: { icon: "CalendarX", tone: "rust", label: "Leave" },
  message: { icon: "MessageSquare", tone: "blue", label: "Messages" },
  forum: { icon: "MessagesSquare", tone: "navy", label: "Forum" },
  resource: { icon: "FolderOpen", tone: "green", label: "Resources" },
  enrollment: { icon: "BookOpen", tone: "blue", label: "Enrolment" },
  direct: { icon: "Bell", tone: "slate", label: "From the office" },
};
const metaFor = (type) => TYPE_META[type] || { icon: "Bell", tone: "slate", label: titleCase(type || "Other") };

let ctx;
let filter = { read: "all", type: "" };
let activeThreadId = null;

boot({
  id: "student-notifications",
  portal: "student",
  watch: ["notifications", "announcements", "threads", "messages", "users", "files"],
  mount(c) {
    ctx = c;
    const tab = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "notifications";
    activeThreadId = tab === "messages" ? c.params.get("id") : null;
    renderLayout(tab);
    wire();
    refresh();
    if (activeThreadId) openThread(activeThreadId);
  },
  update: () => refresh(),
});

/* ---------- data ---------- */

const feed = () => sel.unifiedFeed(ctx.user).map((n) => ({ ...n, type: n.kind === "announcement" ? "announcement" : n.type || "direct" }));
const userName = (id) => store.byId("users", id)?.name || "Unknown user";
const ROLE_NAMES = { accountant: "Accounts office", admin: "Admin office", teacher: "Instructors" };

function isThreadUnread(t) {
  const r = t.readAt?.[ctx.user.id];
  return !r || r < t.lastMessageAt;
}

function threadTitle(t) {
  const others = t.participants.filter((p) => !(p.type === "user" && p.id === ctx.user.id));
  return others.map((p) => (p.type === "role" ? ROLE_NAMES[p.id] || titleCase(p.id) : userName(p.id))).join(", ") || "Just you";
}

const messagesFor = (threadId) => store.where("messages", (m) => m.threadId === threadId).sort((a, b) => a.sentAt.localeCompare(b.sentAt));

// People the student may start a conversation with: their batch instructors + the two offices
function recipientOptions() {
  const ids = new Set(sel.activeBatchesOf(ctx.user.id).flatMap((b) => b.instructorIds || []));
  const teachers = [...ids].map((id) => store.byId("users", id)).filter(Boolean).map((u) => [`user:${u.id}`, `${u.name} — Instructor`]);
  return [...teachers, ["role:accountant", "Accounts office (fees, scholarships)"], ["role:admin", "Admin office (certificates, transcripts, general)"]];
}

/* ---------- layout ---------- */

function renderLayout(active) {
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Notifications</li></ol>
        <h1 class="page-title">Notifications &amp; Messages</h1>
        <p class="page-subtitle">Updates from the academy and conversations with your instructors and offices.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="mark-all">${raw(icon("CheckCheck", { size: 16 }))}Mark all read</button>
        <button type="button" class="btn btn-primary" data-act="new-message">${raw(icon("SquarePen", { size: 16 }))}New message</button>
      </div>
    </div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="notifications">${raw(icon("Bell", { size: 15 }))}Notifications <span class="tab-count" data-count="notifications"></span></button>
        <button type="button" class="tab" role="tab" data-tab="messages">${raw(icon("MessageSquare", { size: 15 }))}Messages <span class="tab-count" data-count="messages"></span></button>
      </div>
      <div data-tab-panel="notifications">
        <div class="notif-toolbar">
          <div class="segmented" role="group" aria-label="Filter by read state" data-read-filter>
            <button type="button" data-read="all" aria-pressed="true">All</button>
            <button type="button" data-read="unread" aria-pressed="false">Unread</button>
          </div>
          <select class="form-control form-control-sm notif-type-select" data-type-filter aria-label="Filter by type"></select>
        </div>
        <ul class="list-plain" data-feed></ul>
      </div>
      <div data-tab-panel="messages" hidden>
        <div class="chat-layout">
          <div class="chat-list" data-thread-list></div>
          <div class="chat-pane">
            <div data-chat-body></div>
            <form class="chat-compose" data-compose hidden novalidate>
              <label class="btn btn-ghost btn-icon chat-attach" aria-label="Attach a file">${raw(icon("Paperclip", { size: 17 }))}<input type="file" name="file" class="visually-hidden-input" data-attach></label>
              <div class="chat-compose-main">
                <textarea class="form-control" name="body" rows="1" placeholder="Write a reply…" aria-label="Reply"></textarea>
                <div class="chat-attach-chip" data-attach-chip hidden></div>
                <p class="field-error" data-error-for="body" hidden></p>
              </div>
              <button type="submit" class="btn btn-primary btn-icon" aria-label="Send">${raw(icon("Send", { size: 17 }))}</button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

  tabs(ctx.root, {
    active,
    onChange: (id) => {
      setSearchParam("tab", id);
      if (id !== "messages") setSearchParam("id", null);
      else if (activeThreadId) setSearchParam("id", activeThreadId);
    },
  });
}

function refresh() {
  const items = feed();
  const unread = items.filter((n) => !n.readAt).length;
  const threads = sel.threadsFor(ctx.user);
  qs('[data-count="notifications"]', ctx.root).textContent = unread ? unread + " new" : items.length;
  qs('[data-count="messages"]', ctx.root).textContent = sel.unreadThreadCount(ctx.user) || threads.length;
  qs('[data-act="mark-all"]', ctx.root).disabled = !unread;

  // Type filter options reflect the types actually present
  const typeSelect = qs("[data-type-filter]", ctx.root);
  const types = [...new Set(items.map((n) => n.type))].sort();
  if (filter.type && !types.includes(filter.type)) filter.type = "";
  typeSelect.innerHTML = html`<option value="">All types</option>${types.map((t) => html`<option value="${t}" ${raw(t === filter.type ? "selected" : "")}>${metaFor(t).label}</option>`)}`;
  qsa("[data-read]", ctx.root).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.read === filter.read)));

  const shown = items.filter((n) => (filter.read === "unread" ? !n.readAt : true) && (!filter.type || n.type === filter.type));
  qs("[data-feed]", ctx.root).innerHTML = shown.length
    ? html`${shown.map(feedRow)}`
    : html`<li>${emptyState(
        items.length
          ? { icon: "Inbox", title: filter.read === "unread" ? "You're all caught up" : "Nothing matches this filter", text: "Try a different filter to see older notifications." }
          : { icon: "Bell", title: "No notifications yet", text: "Updates about assignments, fees, exams and announcements will appear here." }
      )}</li>`;

  renderThreads(threads);
  renderConversation();
}

function feedRow(n) {
  const m = metaFor(n.type);
  const target = n.link;
  return html`
    <li class="list-row notif-row ${raw(n.readAt ? "" : "is-unread")}">
      <span class="icon-tile icon-tile-sm tone-${raw(n.priority === "high" ? "rust" : m.tone)}">${raw(icon(m.icon, { size: 16 }))}</span>
      <div class="list-row-main">
        <div class="notif-row-title">${n.title}${n.priority === "high" ? html` <span class="badge tone-rust">Important</span>` : raw("")}</div>
        ${n.body ? html`<div class="list-row-sub notif-row-body">${truncate(n.body, 220)}</div>` : raw("")}
        <div class="notif-row-meta">${m.label} · <time datetime="${n.createdAt}" title="${dateTime(n.createdAt)}">${relative(n.createdAt)}</time></div>
      </div>
      <div class="notif-row-actions">
        ${target ? html`<a class="btn btn-soft btn-sm" href="${target}" data-open="${n.id}">Open${raw(icon("ArrowRight", { size: 14 }))}</a>` : raw("")}
        ${n.readAt
          ? raw("")
          : html`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-read-one="${n.id}" aria-label="Mark as read" title="Mark as read">${raw(icon("Check", { size: 16 }))}</button>`}
      </div>
    </li>`;
}

function renderThreads(threads) {
  const list = qs("[data-thread-list]", ctx.root);
  list.innerHTML = threads.length
    ? html`${threads.map((t) => {
        const last = messagesFor(t.id).at(-1);
        const unread = isThreadUnread(t);
        const title = threadTitle(t);
        return html`
          <button type="button" class="chat-thread-item ${raw(t.id === activeThreadId ? "is-active" : "")} ${raw(unread ? "is-unread" : "")}" data-thread="${t.id}">
            ${avatar({ name: title, size: "md" })}
            <span class="chat-thread-main">
              <span class="chat-thread-top"><span class="chat-thread-subject">${t.subject || "Conversation"}</span><span class="chat-thread-time">${relative(t.lastMessageAt)}</span></span>
              <span class="chat-thread-preview">${title}${last ? " · " + (last.senderId === ctx.user.id ? "You: " : "") + truncate(last.body, 60) : ""}</span>
            </span>
            ${unread ? html`<span class="dot tone-blue" aria-label="Unread"></span>` : raw("")}
          </button>`;
      })}`
    : emptyState({ icon: "MessageSquare", title: "No conversations", text: "Message your instructor or the academy office.", actionLabel: "New message", actionAttrs: 'data-act="new-message"' });
}

function renderConversation() {
  const body = qs("[data-chat-body]", ctx.root);
  const compose = qs("[data-compose]", ctx.root);
  const t = activeThreadId ? store.byId("threads", activeThreadId) : null;
  const mine = t && sel.threadsFor(ctx.user).some((x) => x.id === t.id);
  if (!t || !mine) {
    compose.hidden = true;
    body.innerHTML = html`<div class="chat-empty">${emptyState({ icon: "MessagesSquare", title: "Select a conversation", text: "Pick a conversation on the left, or start a new one." })}</div>`;
    return;
  }
  const msgs = messagesFor(t.id);
  const closed = t.status === "closed";
  compose.hidden = closed;
  body.innerHTML = html`
    <div class="chat-pane-head">
      <div class="cell-user">
        <button type="button" class="btn btn-ghost btn-icon btn-sm chat-back" data-act="back" aria-label="Back to conversations">${raw(icon("ArrowLeft", { size: 16 }))}</button>
        ${avatar({ name: threadTitle(t), size: "md" })}
        <div class="cell-user-text"><span class="cell-title">${t.subject || "Conversation"}</span><span class="cell-sub">${threadTitle(t)}</span></div>
      </div>
      ${badge2(t)}
    </div>
    <div class="chat-messages" data-chat-messages>
      ${msgs.length ? msgs.map(messageHtml) : html`<p class="text-muted text-center m-0">No messages yet.</p>`}
      ${closed ? html`<div class="alert tone-slate">${raw(icon("Lock", { size: 16 }))}<div class="alert-body">This conversation was closed by the office. Start a new message if you need more help.</div></div>` : raw("")}
    </div>`;
  const box = qs("[data-chat-messages]", body);
  box.scrollTop = box.scrollHeight;
  files.hydrateImages(body);
}

const badge2 = (t) => html`<span class="badge tone-${raw(t.status === "closed" ? "slate" : "green")}">${t.status === "closed" ? "Closed" : "Open"}</span>`;

function messageHtml(m) {
  const mine = m.senderId === ctx.user.id;
  const sender = store.byId("users", m.senderId);
  const attachments = (m.fileIds || []).map((id) => store.byId("files", id)).filter(Boolean);
  return html`
    <div class="msg ${raw(mine ? "is-mine" : "")}">
      ${avatar({ name: sender?.name || "?", size: "sm" })}
      <div class="msg-col">
        ${mine ? raw("") : html`<div class="msg-sender">${sender?.name || "Academy staff"}</div>`}
        <div class="msg-bubble">${m.body}</div>
        ${attachments.map((f) => html`<button type="button" class="msg-file" data-file="${f.id}">${raw(icon(/^image\//.test(f.mime) ? "FileImage" : "FileText", { size: 15 }))}<span class="truncate">${f.name}</span><span class="text-xs text-muted">${fileSize(f.size)}</span></button>`)}
        <div class="msg-meta" title="${dateTime(m.sentAt)}">${date(m.sentAt)} · ${time(m.sentAt)}</div>
      </div>
    </div>`;
}

/* ---------- actions ---------- */

function openThread(id) {
  const t = store.byId("threads", id);
  if (!t || !sel.threadsFor(ctx.user).some((x) => x.id === id)) {
    toast("That conversation couldn't be found.", { type: "warning" });
    activeThreadId = null;
    setSearchParam("id", null);
    renderConversation();
    return;
  }
  activeThreadId = id;
  setSearchParam("id", id);
  qs(".chat-layout", ctx.root).classList.add("has-active");
  qsa("[data-thread]", ctx.root).forEach((b) => b.classList.toggle("is-active", b.dataset.thread === id));
  renderConversation();
  if (isThreadUnread(t)) run(() => services.markThreadRead(ctx.user, id), { error: "Couldn't mark the conversation as read" });
}

function wire() {
  on(ctx.root, "click", "[data-read]", (e, btn) => {
    filter.read = btn.dataset.read;
    refresh();
  });
  on(ctx.root, "change", "[data-type-filter]", (e, s) => {
    filter.type = s.value;
    refresh();
  });
  on(ctx.root, "click", "[data-read-one]", (e, btn) => run(() => services.markNotificationRead(ctx.user, btn.dataset.readOne), { error: "Couldn't mark as read" }));
  on(ctx.root, "click", "[data-open]", (e, a) => {
    const n = feed().find((x) => x.id === a.dataset.open);
    if (n && !n.readAt) {
      e.preventDefault();
      services.markNotificationRead(ctx.user, n.id).catch(() => {}).finally(() => (window.location.href = a.getAttribute("href")));
    }
  });
  on(ctx.root, "click", '[data-act="mark-all"]', () => run(() => services.markAllRead(ctx.user), { success: "All notifications marked as read.", error: "Couldn't mark all as read" }));
  on(ctx.root, "click", '[data-act="new-message"]', newMessage);
  on(ctx.root, "click", "[data-thread]", (e, btn) => openThread(btn.dataset.thread));
  on(ctx.root, "click", '[data-act="back"]', () => {
    qs(".chat-layout", ctx.root).classList.remove("has-active");
  });
  on(ctx.root, "click", "[data-file]", (e, btn) => run(() => files.downloadFile(btn.dataset.file), { error: "Couldn't download the attachment" }));

  const form = qs("[data-compose]", ctx.root);
  const chip = qs("[data-attach-chip]", form);
  const fileInput = qs("[data-attach]", form);
  const textarea = form.elements.namedItem("body");
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    chip.hidden = !f;
    chip.innerHTML = f ? html`${raw(icon("Paperclip", { size: 13 }))}<span class="truncate">${f.name}</span><span class="text-muted">${fileSize(f.size)}</span><button type="button" class="link-btn" data-clear-attach aria-label="Remove attachment">${raw(icon("X", { size: 13 }))}</button>` : "";
  });
  on(form, "click", "[data-clear-attach]", () => {
    fileInput.value = "";
    chip.hidden = true;
    chip.innerHTML = "";
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = textarea.value.trim();
    const fileList = fileInput.files;
    if (!body) return showErrors(form, { body: "Write a message before sending." });
    showErrors(form, {});
    if (!activeThreadId) return toast("Choose a conversation first.", { type: "warning" });
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const ok = await run(() => services.replyThread(ctx.user, activeThreadId, { body, fileList: fileList.length ? fileList : null }), { error: "Couldn't send your message" });
    btn.disabled = false;
    if (ok) {
      textarea.value = "";
      fileInput.value = "";
      chip.hidden = true;
      chip.innerHTML = "";
      textarea.focus();
    }
  });
}

async function newMessage() {
  const options = recipientOptions();
  const data = await modal.form({
    title: "New message",
    submitLabel: "Send message",
    columns: 1,
    fields: [
      { name: "to", label: "To", type: "select", required: true, placeholder: "Choose a recipient", options },
      { name: "subject", label: "Subject", required: true, placeholder: "e.g. Doubt about Module 3" },
      { name: "body", label: "Message", type: "textarea", rows: 5, required: true, placeholder: "Write your message…" },
      { name: "file", label: "Attachment (optional)", type: "file", help: "Max 2 MB." },
    ],
    validate: (d) => {
      const errors = {};
      if (!d.to || !options.some(([v]) => v === d.to)) errors.to = "Choose who should receive this message.";
      if (!d.subject.trim()) errors.subject = "Add a short subject.";
      else if (d.subject.trim().length > 120) errors.subject = "Keep the subject under 120 characters.";
      if (!d.body.trim()) errors.body = "Write your message.";
      const limitKB = (store.get("settings").system || {}).maxUploadKB || 2048;
      if (d.file && d.file.size > limitKB * 1024) errors.file = `The attachment must be ${Math.round(limitKB / 1024)} MB or smaller.`;
      return errors;
    },
  });
  if (!data) return;
  const [type, id] = data.to.split(":");
  const category = type === "role" ? (id === "accountant" ? "fees" : "general") : "academic";
  const thread = await run(
    () => services.startThread(ctx.user, { subject: data.subject.trim(), category, participants: [{ type, id }], body: data.body.trim(), fileList: data.file ? [data.file] : null }),
    { success: "Message sent.", error: "Couldn't send your message" }
  );
  if (!thread) return;
  qs('[data-tab="messages"]', ctx.root).click();
  openThread(thread.id);
}

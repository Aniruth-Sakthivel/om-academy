/*
Author       : OM Academy
Description  : Student → Discussion Forum. General + course scopes, search, thread list (pinned first), thread view
               in a drawer with replies, likes, reporting, "mark solved" for the thread author, and new threads.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, modal, drawer, avatar, emptyState, setSearchParam, getSearchParam, debounce, showErrors } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { relative, dateTime, truncate, plural, num } from "../core/format.js";
import { run } from "../core/errors.js";
import { nowISO } from "../core/clock.js";

const REPORT_REASONS = [["spam", "Spam or advertising"], ["abuse", "Abusive or disrespectful"], ["off-topic", "Off-topic"], ["cheating", "Sharing exam answers / cheating"], ["other", "Something else"]];

let ctx;
let scope = "general"; // "general" | courseId
let search = "";
let current = null; // { id, d } the open thread drawer

boot({
  id: "student-forum",
  portal: "student",
  watch: ["forumThreads", "forumPosts", "settings", "enrollments", "users"],
  mount(c) {
    ctx = c;
    const s = getSearchParam("scope");
    if (s && scopes().some((x) => x.id === s)) scope = s;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openThread(id);
  },
  update: () => refresh(),
});

/* ---------- data ---------- */

function scopes() {
  const courses = [...new Set(sel.activeBatchesOf(ctx.user.id).map((b) => b.courseId))].map((id) => store.byId("courses", id)).filter(Boolean);
  return [{ id: "general", label: "General", sub: "Everyone at OM Academy", icon: "Globe", tone: "blue" }, ...courses.map((c) => ({ id: c.id, label: c.title, sub: c.code || "Course", icon: "BookOpen", tone: c.tone || "green" }))];
}

const scopeOf = (id) => (id === "general" ? { type: "general" } : { type: "course", id });
const scopeLabel = (t) => (t.scope.type === "general" ? "General" : store.byId("courses", t.scope.id)?.title || "Course");
const canPost = () => (store.get("settings").system || {}).studentForumPosting !== false;
const userName = (id) => store.byId("users", id)?.name || "Former member";
const roleTag = (id) => {
  const u = store.byId("users", id);
  if (!u || u.role === "student") return raw("");
  return html`<span class="badge tone-navy">${u.role === "teacher" ? "Instructor" : "Staff"}</span>`;
};

// A student may open a thread only in a scope they belong to
function visible(t) {
  if (!t || t.hidden) return false;
  return t.scope.type === "general" || scopes().some((s) => s.id === t.scope.id);
}

function threadsInScope() {
  const s = scopeOf(scope);
  const needle = search.trim().toLowerCase();
  return sel
    .forumThreadsFor(s.type, s.id)
    .filter((t) => !needle || t.title.toLowerCase().includes(needle) || (t.body || "").toLowerCase().includes(needle) || (t.tags || []).some((g) => g.toLowerCase().includes(needle)));
}

/* ---------- layout ---------- */

function renderLayout() {
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Discussion Forum</li></ol>
        <h1 class="page-title">Discussion Forum</h1>
        <p class="page-subtitle">Ask questions, share work and help your classmates.</p>
      </div>
      <div class="page-actions" data-actions></div>
    </div>
    <div data-posting-alert></div>
    <div class="grid grid-side-main forum-layout">
      <div class="card forum-scopes">
        <div class="card-header"><h2 class="card-title">Boards</h2></div>
        <div class="list-plain" data-scopes></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div><h2 class="card-title" data-scope-title></h2><p class="card-subtitle" data-scope-sub></p></div>
          <div class="search-field forum-search">
            ${raw(icon("Search", { size: 15 }))}
            <input type="search" class="form-control form-control-sm" placeholder="Search threads" data-search aria-label="Search threads">
          </div>
        </div>
        <ul class="list-plain" data-threads></ul>
      </div>
    </div>`;
}

function refresh() {
  const all = scopes();
  if (!all.some((s) => s.id === scope)) scope = "general";
  const posting = canPost();

  qs("[data-actions]", ctx.root).innerHTML = html`<button type="button" class="btn btn-primary" data-act="new" ${raw(posting ? "" : "disabled")}>${raw(icon("Plus", { size: 16 }))}New thread</button>`;
  qs("[data-posting-alert]", ctx.root).innerHTML = posting
    ? ""
    : html`<div class="alert tone-amber page-section">${raw(icon("Lock", { size: 18 }))}<div class="alert-body"><p class="alert-title">Posting is paused</p>The academy has temporarily turned off new threads from students. You can still read and like posts.</div></div>`;

  qs("[data-scopes]", ctx.root).innerHTML = html`${all.map((s) => {
    const n = sel.forumThreadsFor(scopeOf(s.id).type, scopeOf(s.id).id).length;
    return html`<button type="button" class="list-row forum-scope ${raw(s.id === scope ? "is-active" : "")}" data-scope="${s.id}" aria-pressed="${s.id === scope ? "true" : "false"}">
      <span class="icon-tile icon-tile-sm tone-${raw(s.tone)}">${raw(icon(s.icon, { size: 16 }))}</span>
      <span class="list-row-main"><span class="list-row-title">${s.label}</span><span class="list-row-sub">${s.sub}</span></span>
      <span class="tab-count">${n}</span>
    </button>`;
  })}`;

  const cur = all.find((s) => s.id === scope);
  qs("[data-scope-title]", ctx.root).textContent = cur.label;
  qs("[data-scope-sub]", ctx.root).textContent = scope === "general" ? "Open to every student and instructor" : "Only students and instructors of this course";

  const list = threadsInScope();
  qs("[data-threads]", ctx.root).innerHTML = list.length
    ? html`${list.map(threadRow)}`
    : html`<li>${emptyState(
        search
          ? { icon: "Search", title: "No threads match your search", text: "Try different words, or clear the search." }
          : { icon: "MessagesSquare", title: "No threads here yet", text: posting ? "Start the first discussion on this board." : "Nothing has been posted on this board yet.", actionLabel: posting ? "Start a thread" : undefined, actionAttrs: 'data-act="new"' }
      )}</li>`;

  if (current) paintThread();
}

function threadRow(t) {
  const posts = sel.forumPostsFor(t.id);
  const lastPost = posts.at(-1);
  return html`
    <li>
      <button type="button" class="list-row forum-thread ${raw(t.pinned ? "is-pinned" : "")}" data-thread="${t.id}">
        ${avatar({ name: userName(t.authorId), size: "md" })}
        <span class="list-row-main">
          <span class="forum-thread-title">
            ${t.pinned ? html`<span class="forum-flag tone-amber" title="Pinned">${raw(icon("Pin", { size: 13 }))}</span>` : raw("")}
            ${t.locked ? html`<span class="forum-flag tone-slate" title="Locked">${raw(icon("Lock", { size: 13 }))}</span>` : raw("")}
            <span class="forum-thread-text">${t.title}</span>
            ${t.solvedPostId ? html`<span class="badge tone-green">${raw(icon("CircleCheck", { size: 12 }))}Solved</span>` : raw("")}
          </span>
          <span class="list-row-sub">${userName(t.authorId)} · ${lastPost ? "last reply " + relative(lastPost.createdAt) + " by " + userName(lastPost.authorId) : "posted " + relative(t.createdAt || t.lastPostAt)}</span>
          ${(t.tags || []).length ? html`<span class="cluster forum-tags">${t.tags.map((g) => html`<span class="chip">#${g}</span>`)}</span>` : raw("")}
        </span>
        <span class="forum-stats">
          <span title="Replies">${raw(icon("MessageSquare", { size: 14 }))}${num(posts.length)}</span>
          <span title="Views">${raw(icon("Eye", { size: 14 }))}${num(t.views || 0)}</span>
        </span>
      </button>
    </li>`;
}

/* ---------- thread drawer ---------- */

function openThread(id) {
  const t = store.byId("forumThreads", id);
  if (!visible(t)) {
    toast("That thread couldn't be found. It may have been removed.", { type: "warning" });
    setSearchParam("id", null);
    return;
  }
  if (t.scope.type === "course" && scope !== t.scope.id) {
    scope = t.scope.id;
    setSearchParam("scope", scope);
  } else if (t.scope.type === "general" && scope !== "general") {
    scope = "general";
    setSearchParam("scope", null);
  }
  setSearchParam("id", id);
  const d = drawer.open({
    title: "Discussion",
    wide: true,
    body: html`<div data-thread-body></div>`,
    footer: html`<form class="forum-reply" data-reply-form novalidate>
      <div class="forum-reply-main">
        <textarea class="form-control" name="body" rows="2" placeholder="Write a reply…" aria-label="Your reply"></textarea>
        <p class="field-error" data-error-for="body" hidden></p>
      </div>
      <button type="submit" class="btn btn-primary">${raw(icon("Send", { size: 15 }))}Reply</button>
    </form><div data-reply-locked hidden></div>`,
  });
  current = { id, d };
  // Clear the deep link when the drawer closes (close button, backdrop or Escape)
  const obs = new MutationObserver(() => {
    if (!d.root.isConnected) {
      obs.disconnect();
      if (current?.d === d) current = null;
      setSearchParam("id", null);
    }
  });
  obs.observe(document.body, { childList: true });

  wireDrawer(d);
  paintThread();
  run(() => services.incrementThreadViews(ctx.user, id), { error: "Couldn't update the view count" });
}

function paintThread() {
  const { id, d } = current;
  const t = store.byId("forumThreads", id);
  const box = qs("[data-thread-body]", d.root);
  if (!visible(t)) {
    box.innerHTML = emptyState({ icon: "Ban", title: "This thread is no longer available", text: "It may have been hidden by a moderator." });
    qs("[data-reply-form]", d.root).hidden = true;
    return;
  }
  const posts = sel.forumPostsFor(id);
  const isAuthor = t.authorId === ctx.user.id;
  const solved = posts.find((p) => p.id === t.solvedPostId);
  box.innerHTML = html`
    <div class="forum-op">
      <div class="cluster forum-op-badges">
        <span class="chip">${scopeLabel(t)}</span>
        ${t.pinned ? html`<span class="badge tone-amber">${raw(icon("Pin", { size: 12 }))}Pinned</span>` : raw("")}
        ${t.locked ? html`<span class="badge tone-slate">${raw(icon("Lock", { size: 12 }))}Locked</span>` : raw("")}
        ${t.solvedPostId ? html`<span class="badge tone-green">${raw(icon("CircleCheck", { size: 12 }))}Solved</span>` : raw("")}
      </div>
      <h2 class="forum-op-title">${t.title}</h2>
      <div class="cell-user">
        ${avatar({ name: userName(t.authorId), size: "sm" })}
        <div class="cell-user-text"><span class="cell-title">${userName(t.authorId)} ${roleTag(t.authorId)}</span><span class="cell-sub" title="${dateTime(t.createdAt)}">${relative(t.createdAt || t.lastPostAt)} · ${plural(t.views || 0, "view")}</span></div>
      </div>
      <div class="forum-body">${t.body}</div>
      ${(t.tags || []).length ? html`<div class="cluster">${t.tags.map((g) => html`<span class="chip">#${g}</span>`)}</div>` : raw("")}
    </div>
    ${solved ? html`<div class="alert tone-green section-gap">${raw(icon("CircleCheck", { size: 18 }))}<div class="alert-body"><p class="alert-title">Accepted answer by ${userName(solved.authorId)}</p>${truncate(solved.body, 200)}</div></div>` : raw("")}
    <h3 class="drawer-section-title">${plural(posts.length, "reply", "replies")}</h3>
    ${posts.length
      ? html`<div class="stack forum-posts">${posts.map((p) => postHtml(p, t, isAuthor))}</div>`
      : emptyState({ icon: "MessageSquare", title: "No replies yet", text: t.locked ? "This thread is locked." : "Be the first to reply." })}`;

  const form = qs("[data-reply-form]", d.root);
  const lockedNote = qs("[data-reply-locked]", d.root);
  form.hidden = !!t.locked;
  lockedNote.hidden = !t.locked;
  lockedNote.innerHTML = t.locked ? html`<div class="alert tone-slate w-100">${raw(icon("Lock", { size: 16 }))}<div class="alert-body">This thread is locked by a moderator — new replies are turned off.</div></div>` : "";
}

function postHtml(p, t, isAuthor) {
  const liked = (p.likes || []).includes(ctx.user.id);
  const mine = p.authorId === ctx.user.id;
  const reported = (p.reports || []).some((r) => r.by === ctx.user.id);
  const accepted = t.solvedPostId === p.id;
  return html`
    <article class="forum-post ${raw(accepted ? "is-accepted" : "")}">
      <div class="cluster-between">
        <div class="cell-user">
          ${avatar({ name: userName(p.authorId), size: "sm" })}
          <div class="cell-user-text"><span class="cell-title">${userName(p.authorId)} ${roleTag(p.authorId)}</span><span class="cell-sub" title="${dateTime(p.createdAt)}">${relative(p.createdAt)}${p.editedAt ? " · edited" : ""}</span></div>
        </div>
        ${accepted ? html`<span class="badge tone-green">${raw(icon("CircleCheck", { size: 12 }))}Accepted answer</span>` : raw("")}
      </div>
      <div class="forum-body">${p.body}</div>
      <div class="forum-post-actions">
        <button type="button" class="btn btn-ghost btn-sm ${raw(liked ? "is-liked" : "")}" data-like="${p.id}" aria-pressed="${liked ? "true" : "false"}">${raw(icon("ThumbsUp", { size: 14 }))}${liked ? "Liked" : "Like"}${(p.likes || []).length ? " · " + p.likes.length : ""}</button>
        ${isAuthor && !mine && !t.locked
          ? html`<button type="button" class="btn btn-ghost btn-sm" data-solve="${p.id}">${raw(icon(accepted ? "RotateCcw" : "CircleCheck", { size: 14 }))}${accepted ? "Unmark solution" : "Mark as solution"}</button>`
          : raw("")}
        ${mine
          ? raw("")
          : reported
            ? html`<span class="text-xs text-muted forum-reported">${raw(icon("Flag", { size: 13 }))}Reported</span>`
            : html`<button type="button" class="btn btn-ghost btn-sm" data-report="${p.id}">${raw(icon("Flag", { size: 14 }))}Report</button>`}
      </div>
    </article>`;
}

function wireDrawer(d) {
  on(d.root, "click", "[data-like]", (e, btn) => run(() => services.toggleLikePost(ctx.user, btn.dataset.like), { error: "Couldn't update your like" }));
  on(d.root, "click", "[data-solve]", (e, btn) => markSolved(current.id, btn.dataset.solve));
  on(d.root, "click", "[data-report]", (e, btn) => reportFlow(btn.dataset.report));
  const form = qs("[data-reply-form]", d.root);
  const textarea = form.elements.namedItem("body");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = textarea.value.trim();
    if (!body) return showErrors(form, { body: "Write a reply before posting." });
    if (body.length > 4000) return showErrors(form, { body: "Keep replies under 4,000 characters." });
    showErrors(form, {});
    const t = store.byId("forumThreads", current.id);
    if (!t || t.locked) return toast("This thread is locked — replies are turned off.", { type: "warning" });
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const ok = await run(() => services.replyForumThread(ctx.user, current.id, body), { success: "Reply posted.", error: "Couldn't post your reply" });
    btn.disabled = false;
    if (ok) {
      textarea.value = "";
      const list = qs(".drawer-body", d.root);
      list.scrollTop = list.scrollHeight;
    }
  });
}

// Clicking the current solution again unmarks it (services.markThreadSolved with null clears it).
function markSolved(threadId, postId) {
  const t = store.byId("forumThreads", threadId);
  if (!t) return toast("That thread no longer exists.", { type: "warning" });
  const next = t.solvedPostId === postId ? null : postId;
  run(() => services.markThreadSolved(ctx.user, threadId, next), { success: next ? "Marked as the solution." : "Solution unmarked.", error: "Couldn't update the solution" });
}

async function reportFlow(postId) {
  const post = store.byId("forumPosts", postId);
  if (!post || post.hidden) return toast("That post couldn't be found.", { type: "warning" });
  const data = await modal.form({
    title: "Report post",
    submitLabel: "Send report",
    columns: 1,
    size: "sm",
    extraBodyHtml: html`<p class="text-muted text-sm m-0 section-gap">Moderators will review this post. The author won't see who reported it.</p>`,
    fields: [
      { name: "reason", label: "Reason", type: "select", required: true, placeholder: "Choose a reason", options: REPORT_REASONS },
      { name: "details", label: "Details (optional)", type: "textarea", rows: 3, placeholder: "Anything the moderators should know" },
    ],
    validate: (d) => {
      const errors = {};
      if (!d.reason) errors.reason = "Choose a reason.";
      if (d.reason === "other" && !d.details.trim()) errors.details = "Tell the moderators what's wrong.";
      return errors;
    },
  });
  if (!data) return;
  const label = REPORT_REASONS.find(([v]) => v === data.reason)?.[1] || data.reason;
  run(() => services.reportPost(ctx.user, postId, data.details.trim() ? `${label}: ${data.details.trim()}` : label), { success: "Thanks — the moderators have been notified.", error: "Couldn't report the post" });
}

/* ---------- page actions ---------- */

async function newThread() {
  if (!canPost()) return toast("Posting new threads is turned off right now.", { type: "warning" });
  const all = scopes();
  const data = await modal.form({
    title: "Start a new thread",
    submitLabel: "Post thread",
    columns: 1,
    values: { scope },
    fields: [
      { name: "scope", label: "Board", type: "select", required: true, options: all.map((s) => [s.id, s.label]) },
      { name: "title", label: "Title", required: true, placeholder: "Summarise your question in one line" },
      { name: "body", label: "Details", type: "textarea", rows: 6, required: true, placeholder: "Add context, what you've tried, screenshots described in words…" },
      { name: "tags", label: "Tags (optional)", placeholder: "e.g. excel, practical", help: "Separate tags with commas. Up to 5." },
    ],
    validate: (d) => {
      const errors = {};
      if (!all.some((s) => s.id === d.scope)) errors.scope = "Choose a board.";
      if (d.title.trim().length < 5) errors.title = "Write a title of at least 5 characters.";
      else if (d.title.trim().length > 140) errors.title = "Keep the title under 140 characters.";
      if (d.body.trim().length < 10) errors.body = "Add a few more details (at least 10 characters).";
      const tags = d.tags.split(",").map((x) => x.trim()).filter(Boolean);
      if (tags.length > 5) errors.tags = "Use at most 5 tags.";
      return errors;
    },
  });
  if (!data) return;
  if (!canPost()) return toast("Posting new threads was turned off while you were writing.", { type: "warning" });
  const tags = [...new Set(data.tags.split(",").map((x) => x.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))].slice(0, 5);
  const rec = await run(() => services.createForumThread(ctx.user, { scope: scopeOf(data.scope), title: data.title.trim(), body: data.body.trim(), tags }), { success: "Thread posted.", error: "Couldn't post your thread" });
  if (!rec) return;
  scope = data.scope;
  setSearchParam("scope", scope === "general" ? null : scope);
  refresh();
  openThread(rec.id);
}

function wire() {
  on(ctx.root, "click", '[data-act="new"]', newThread);
  on(ctx.root, "click", "[data-scope]", (e, btn) => {
    scope = btn.dataset.scope;
    setSearchParam("scope", scope === "general" ? null : scope);
    refresh();
  });
  on(ctx.root, "click", "[data-thread]", (e, btn) => openThread(btn.dataset.thread));
  const onSearch = debounce((value) => {
    search = value;
    refresh();
  }, 150);
  on(ctx.root, "input", "[data-search]", (e, input) => onSearch(input.value));
}

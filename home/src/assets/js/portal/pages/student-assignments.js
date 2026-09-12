/*
Author       : OM Academy
Description  : Student → Assignments. Pending / Submitted / Graded / Overdue tabs, a detail drawer, the submit
               (and resubmit) modal with file upload, and the graded view with marks, grade and feedback.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import * as files from "../core/files.js";
import { html, raw, on, qs, toast, modal, drawer, badge, statCard, emptyState, tabs, setSearchParam, getSearchParam } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, dateTime, dueIn, fileSize, plural } from "../core/format.js";
import { run, friendlyMessage } from "../core/errors.js";

const TABS = ["pending", "submitted", "graded", "overdue"];
const TAB_META = {
  pending: { label: "Pending", icon: "Clock", empty: "Nothing pending — you're all caught up." },
  submitted: { label: "Submitted", icon: "Send", empty: "Submitted work waiting to be graded appears here." },
  graded: { label: "Graded", icon: "BadgeCheck", empty: "Graded assignments with marks and feedback appear here." },
  overdue: { label: "Overdue", icon: "TriangleAlert", empty: "No overdue assignments. Keep it up!" },
};
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png";
const ACCEPT_RE = /\.(pdf|docx?|pptx?|xlsx?|txt|zip|jpe?g|png)$/i;
const MAX_FILES = 5;

let ctx;
let tabCtl;
let courseFilter = "";

boot({
  id: "student-assignments",
  portal: "student",
  watch: ["assignments", "submissions", "enrollments", "batches", "courses", "files", "settings"],
  mount(c) {
    ctx = c;
    courseFilter = getSearchParam("course") || "";
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openAssignment(id);
  },
  update: () => refresh(),
});

/* ---------- data ---------- */

const bucketOf = (status) => (status === "overdue-allowed" ? "overdue" : status);
const pastDue = (a) => sel.isPastDue(a.dueAt);
const canSubmit = (row) => row.status !== "graded" && (!pastDue(row) || row.allowLate);

function allRows() {
  return sel
    .assignmentsForStudent(ctx.user.id)
    .map((a) => {
      const status = sel.assignmentStatusFor(a, ctx.user.id);
      const sub = sel.submissionFor(a.id, ctx.user.id) || null;
      const course = store.byId("courses", a.courseId) || sel.courseOf(store.byId("batches", a.batchId));
      const pct = sub && sub.status === "graded" && sub.marks != null && a.maxMarks ? Math.round((sub.marks / a.maxMarks) * 1000) / 10 : null;
      return { ...a, status, bucket: bucketOf(status), sub, course, pct, grade: pct != null ? sel.gradeFor(pct) : null };
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

const rowsFor = (all) => all.filter((r) => !courseFilter || r.courseId === courseFilter);

function maxKB() {
  return (store.get("settings").system || {}).maxUploadKB || 2048;
}

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "pending";
  const courses = sel.activeBatchesOf(ctx.user.id).map((b) => store.byId("courses", b.courseId)).filter(Boolean);
  if (courseFilter && !courses.some((c) => c.id === courseFilter)) {
    toast("That course isn't one of your enrolments, so all assignments are shown.", { type: "warning" });
    courseFilter = "";
    setSearchParam("course", null);
  }
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Assignments</li></ol>
        <h1 class="page-title">Assignments</h1>
        <p class="page-subtitle">Submit your work, track deadlines and read your instructor's feedback.</p>
      </div>
      <div class="page-actions">
        <select class="form-control" data-course-filter aria-label="Filter by course">
          <option value="">All courses</option>
          ${courses.map((c) => html`<option value="${c.id}" ${raw(c.id === courseFilter ? "selected" : "")}>${c.title}</option>`)}
        </select>
      </div>
    </div>
    <div data-alert></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${TABS.map((t) => html`<button type="button" class="tab" role="tab" data-tab="${t}">${raw(icon(TAB_META[t].icon, { size: 15 }))}${TAB_META[t].label} <span class="tab-count" data-count="${t}"></span></button>`)}
      </div>
      ${TABS.map((t) => html`<div data-tab-panel="${t}" ${raw(t === active ? "" : "hidden")}><div class="card-body" data-list="${t}"></div></div>`)}
    </div>`;
  tabCtl = tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });
}

function refresh() {
  const all = allRows();
  const list = rowsFor(all);
  const by = (b) => list.filter((r) => r.bucket === b);
  const graded = by("graded");
  const avg = graded.length ? Math.round(graded.reduce((t, r) => t + (r.pct || 0), 0) / graded.length) : null;
  const dueSoon = by("pending").filter((r) => dueIn(r.dueAt) === "Today" || dueIn(r.dueAt) === "Tomorrow");

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "Clock", label: "Pending", value: String(by("pending").length), tone: "amber" }),
    statCard({ icon: "Send", label: "Awaiting grade", value: String(by("submitted").length), tone: "blue" }),
    statCard({ icon: "BadgeCheck", label: "Graded", value: String(graded.length), tone: "green" }),
    statCard({ icon: "Award", label: "Average score", value: avg == null ? "—" : avg + "%", tone: avg == null ? "slate" : "purple" }),
  ].join("");

  const overdueOpen = by("overdue").filter((r) => r.allowLate);
  qs("[data-alert]", ctx.root).innerHTML = dueSoon.length || overdueOpen.length
    ? html`<div class="alert tone-${raw(overdueOpen.length ? "rust" : "amber")} page-section" role="status">
        ${raw(icon("TriangleAlert", { size: 18 }))}
        <div class="alert-body"><p class="alert-title">${overdueOpen.length ? plural(overdueOpen.length, "overdue assignment") + " still accept late work" : plural(dueSoon.length, "assignment") + " due soon"}</p>${overdueOpen.length ? "Submit as soon as you can — late submissions are marked late." : "Don't miss the deadline: " + dueSoon.map((r) => r.title).join(", ") + "."}</div>
        <div class="alert-actions"><button type="button" class="btn btn-outline btn-sm" data-goto="${overdueOpen.length ? "overdue" : "pending"}">View</button></div>
      </div>`
    : "";

  for (const t of TABS) {
    const items = by(t);
    qs(`[data-count="${t}"]`, ctx.root).textContent = items.length;
    qs(`[data-list="${t}"]`, ctx.root).innerHTML = items.length
      ? html`<div class="grid grid-2">${(t === "graded" || t === "submitted" ? [...items].reverse() : items).map(cardHtml)}</div>`
      : emptyState({ icon: TAB_META[t].icon, title: all.length ? `No ${TAB_META[t].label.toLowerCase()} assignments` : "No assignments yet", text: all.length ? TAB_META[t].empty : "Assignments from your instructors will appear here." });
  }
}

function statusBadge(r) {
  if (r.status === "overdue-allowed") return html`${badge("overdue", "Overdue")}<span class="badge tone-amber">Late allowed</span>`;
  if (r.status === "overdue") return badge("overdue", "Closed");
  return badge(r.status, TAB_META[r.bucket]?.label || r.status);
}

function cardHtml(r) {
  const tone = r.course?.tone || "blue";
  const late = r.sub?.late;
  return html`
    <article class="card asg-card ${raw(r.bucket === "overdue" ? "is-overdue" : "")}">
      <div class="card-body stack-sm">
        <div class="cluster-between asg-card-top">
          <span class="badge tone-${raw(tone)}">${r.course?.code || r.course?.title || "Course"}</span>
          <div class="cluster">${statusBadge(r)}${late ? html`<span class="badge tone-amber">Late</span>` : raw("")}</div>
        </div>
        <h3 class="asg-title">${r.title}</h3>
        <p class="text-sm text-muted m-0 asg-course">${r.course?.title || ""}</p>
        <div class="asg-meta">
          <span>${raw(icon("CalendarClock", { size: 14 }))}Due ${date(r.dueAt)}${r.bucket === "pending" || r.bucket === "overdue" ? html` · <span class="${raw(r.bucket === "overdue" ? "text-danger" : "")}">${dueIn(r.dueAt)}</span>` : raw("")}</span>
          <span>${raw(icon("Target", { size: 14 }))}${r.maxMarks} marks</span>
        </div>
        ${r.bucket === "graded"
          ? html`<div class="asg-score">
              <div><div class="asg-score-value">${r.sub.marks}<span class="text-muted">/${r.maxMarks}</span></div><div class="text-xs text-muted">${r.pct}%</div></div>
              <span class="asg-grade tone-${raw(r.pct >= 60 ? "green" : r.pct >= 40 ? "amber" : "rust")}">${r.grade?.grade || "—"}</span>
            </div>`
          : raw("")}
        ${r.bucket === "submitted" ? html`<p class="text-xs text-muted m-0">Submitted ${dateTime(r.sub.submittedAt)}</p>` : raw("")}
      </div>
      <div class="card-footer">
        <button type="button" class="btn btn-ghost btn-sm" data-open="${r.id}">${raw(icon("Eye", { size: 15 }))}Details</button>
        ${canSubmit(r) ? html`<button type="button" class="btn ${raw(r.sub ? "btn-outline" : "btn-primary")} btn-sm" data-submit="${r.id}">${raw(icon(r.sub ? "RefreshCw" : "Upload", { size: 15 }))}${r.sub ? "Resubmit" : "Submit"}</button>` : raw("")}
      </div>
    </article>`;
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", "[data-open]", (e, btn) => openAssignment(btn.dataset.open));
  on(ctx.root, "click", "[data-submit]", (e, btn) => submitFlow(btn.dataset.submit));
  on(ctx.root, "click", "[data-goto]", (e, btn) => tabCtl.setTab(btn.dataset.goto));
  on(ctx.root, "change", "[data-course-filter]", (e, select) => {
    courseFilter = select.value;
    setSearchParam("course", courseFilter || null);
    refresh();
  });
}

function findRow(id) {
  const r = allRows().find((x) => x.id === id);
  if (!r) toast("That assignment couldn't be found — it may have been removed or isn't for your batch.", { type: "warning" });
  return r;
}

function fileListHtml(fileIds) {
  const recs = (fileIds || []).map((id) => store.byId("files", id) || { id, name: "Missing file", size: 0, missing: true });
  if (!recs.length) return raw("");
  return html`<div class="stack-sm">${recs.map(
    (f) => html`<div class="file-tile">
      <span class="icon-tile icon-tile-sm tone-blue">${raw(icon("Paperclip", { size: 15 }))}</span>
      <div class="file-tile-main"><div class="file-tile-name">${f.name}</div><div class="file-tile-meta">${f.missing ? "No longer available" : fileSize(f.size)}</div></div>
      ${f.missing ? raw("") : html`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-file="${f.id}" aria-label="Download ${f.name}">${raw(icon("Download", { size: 15 }))}</button>`}
    </div>`
  )}</div>`;
}

async function downloadAttachment(fileId, btn) {
  const rec = store.byId("files", fileId);
  if (!rec) return toast("That file is no longer available.", { type: "warning" });
  btn.disabled = true;
  try {
    await files.downloadFile(rec);
    toast(`Downloading "${rec.name}"`, { type: "success" });
  } catch (err) {
    console.error(err);
    toast(`Couldn't download "${rec.name}": ${friendlyMessage(err)}`, { type: "danger", duration: 6000 });
  } finally {
    btn.disabled = false;
  }
}

function openAssignment(id) {
  const r = findRow(id);
  if (!r) return;
  setSearchParam("id", r.id);
  const sub = r.sub;
  const d = drawer.open({
    title: "Assignment details",
    wide: true,
    body: html`
      <div class="section-gap">
        <div class="cluster section-gap"><span class="badge tone-${raw(r.course?.tone || "blue")}">${r.course?.title || "Course"}</span>${statusBadge(r)}</div>
        <div class="fw-700 text-lg text-title">${r.title}</div>
      </div>
      <dl class="kv-list drawer-section">
        <dt>Due</dt><dd>${dateTime(r.dueAt)}${r.bucket === "pending" || r.bucket === "overdue" ? html` <span class="text-muted text-sm">· ${dueIn(r.dueAt)}</span>` : raw("")}</dd>
        <dt>Maximum marks</dt><dd>${r.maxMarks}</dd>
        <dt>Late submissions</dt><dd>${r.allowLate ? "Accepted (marked late)" : "Not accepted"}</dd>
        <dt>Batch</dt><dd>${store.byId("batches", r.batchId)?.name || "—"}</dd>
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Instructions</h4>
        <p class="m-0 asg-text">${r.description || "No instructions were added."}</p>
      </div>
      ${(r.fileIds || []).length ? html`<div class="drawer-section"><h4 class="drawer-section-title">Attached by instructor</h4>${fileListHtml(r.fileIds)}</div>` : raw("")}
      ${sub && sub.status === "graded"
        ? html`<div class="drawer-section">
            <h4 class="drawer-section-title">Result</h4>
            <div class="asg-result">
              <div><div class="text-xs text-muted">Marks</div><div class="asg-score-value">${sub.marks}<span class="text-muted">/${r.maxMarks}</span></div></div>
              <div><div class="text-xs text-muted">Percentage</div><div class="asg-score-value">${r.pct}%</div></div>
              <div><div class="text-xs text-muted">Grade</div><div class="asg-score-value">${r.grade?.grade || "—"}</div>${r.grade?.label ? html`<div class="text-xs text-muted">${r.grade.label}</div>` : raw("")}</div>
            </div>
            <div class="progress tone-${raw(r.pct >= 60 ? "green" : r.pct >= 40 ? "amber" : "rust")} section-gap"><span class="progress-bar pct-${raw(Math.min(100, Math.round((r.pct || 0) / 5) * 5))}"></span></div>
            ${sub.feedback ? html`<div class="alert tone-green">${raw(icon("MessageSquare", { size: 18 }))}<div class="alert-body"><p class="alert-title">Instructor feedback</p>${sub.feedback}</div></div>` : html`<p class="text-muted m-0">No written feedback.</p>`}
            ${sub.gradedAt ? html`<p class="text-xs text-muted">Graded ${dateTime(sub.gradedAt)}</p>` : raw("")}
          </div>`
        : raw("")}
      <div class="drawer-section">
        <h4 class="drawer-section-title">My submission</h4>
        ${sub
          ? html`<div class="stack-sm">
              <div class="cluster">${raw(badge(sub.status, sub.status === "graded" ? "Graded" : "Submitted"))}${sub.late ? html`<span class="badge tone-amber">Late</span>` : raw("")}<span class="text-sm text-muted">${dateTime(sub.submittedAt)}</span></div>
              ${sub.text ? html`<p class="m-0 asg-text">${sub.text}</p>` : raw("")}
              ${fileListHtml(sub.fileIds)}
            </div>`
          : html`<p class="text-muted m-0">${r.status === "overdue" ? "The deadline has passed and this assignment no longer accepts submissions." : "You haven't submitted this assignment yet."}</p>`}
      </div>`,
    footer: html`
      <button type="button" class="btn btn-outline" data-d="close">Close</button>
      ${canSubmit(r) ? html`<button type="button" class="btn btn-primary" data-d="submit">${raw(icon(sub ? "RefreshCw" : "Upload", { size: 16 }))}${sub ? "Resubmit" : "Submit assignment"}</button>` : raw("")}`,
  });
  const close = () => {
    setSearchParam("id", null);
    d.close();
  };
  d.root.querySelector('[data-d="close"]').addEventListener("click", close);
  d.root.querySelector("[data-drawer-close]").addEventListener("click", () => setSearchParam("id", null));
  d.root.querySelector('[data-d="submit"]')?.addEventListener("click", () => {
    close();
    submitFlow(r.id);
  });
  on(d.root, "click", "[data-file]", (e, btn) => downloadAttachment(btn.dataset.file, btn));
}

async function submitFlow(id) {
  const r = findRow(id);
  if (!r) return;
  if (r.status === "graded") return toast("This assignment has already been graded, so it can't be resubmitted.", { type: "info" });
  if (!canSubmit(r)) return toast("The deadline has passed and this assignment doesn't accept late submissions.", { type: "warning" });
  const existing = r.sub;
  const limitKB = maxKB();
  const limitLabel = limitKB >= 1024 ? Math.round((limitKB / 1024) * 10) / 10 + " MB" : limitKB + " KB";
  const late = pastDue(r);
  const notes = html`
    <div class="asg-submit-head section-gap">
      <div><div class="text-muted text-sm">${r.course?.title || ""}</div><div class="fw-600 text-title">${r.title}</div></div>
      <div class="text-right"><div class="text-muted text-sm">Due</div><div class="fw-600 text-title">${date(r.dueAt)}</div></div>
    </div>
    ${late ? html`<div class="alert tone-amber section-gap">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">The deadline has passed. Your work will be marked <strong>late</strong>.</div></div>` : raw("")}
    ${existing ? html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">You're replacing your earlier submission. ${(existing.fileIds || []).length ? "Your previous files are kept unless you attach new ones." : ""}</div></div>` : raw("")}`;

  const data = await modal.form({
    title: existing ? "Resubmit assignment" : "Submit assignment",
    submitLabel: existing ? "Resubmit" : "Submit",
    columns: 1,
    extraBodyHtml: notes,
    fields: [
      { name: "text", label: "Your answer or notes", type: "textarea", rows: 5, placeholder: "Write your answer, or a short note for your instructor…" },
      { name: "files", label: "Attach files", type: "file", multiple: true, accept: ACCEPT, help: `Up to ${MAX_FILES} files, ${limitLabel} each. PDF, Word, PowerPoint, Excel, text, ZIP or images.` },
    ],
    values: { text: existing?.text || "" },
    validate: (v) => {
      const errors = {};
      const list = Array.from(v.files || []);
      const hasOld = (existing?.fileIds || []).length > 0;
      if (!v.text.trim() && !list.length && !hasOld) errors.text = "Write an answer or attach at least one file.";
      if (v.text.length > 5000) errors.text = "Keep your answer under 5,000 characters, or attach it as a file.";
      if (list.length > MAX_FILES) errors.files = `Attach at most ${MAX_FILES} files.`;
      const badType = list.find((f) => !ACCEPT_RE.test(f.name));
      const tooBig = list.find((f) => f.size > limitKB * 1024);
      const empty = list.find((f) => f.size === 0);
      if (badType) errors.files = `"${badType.name}" isn't an accepted file type.`;
      else if (tooBig) errors.files = `"${tooBig.name}" is ${fileSize(tooBig.size)} — the limit is ${limitLabel} per file.`;
      else if (empty) errors.files = `"${empty.name}" is empty.`;
      return errors;
    },
  });
  if (!data) return;
  const fileList = Array.from(data.files || []);
  const res = await run(() => services.submitAssignment(ctx.user, r.id, { text: data.text.trim(), fileList: fileList.length ? fileList : null }), {
    success: existing ? "Submission updated." : late ? "Assignment submitted (marked late)." : "Assignment submitted.",
    error: "Couldn't submit the assignment",
  });
  if (res) tabCtl.setTab("submitted");
}

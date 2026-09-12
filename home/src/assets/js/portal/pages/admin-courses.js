/*
Author       : OM Academy
Description  : Staff → Courses & Batches. Courses (cards, create/edit, syllabus editor), Batches (table, create/edit,
               roster with enrol/transfer/drop/complete, module checklist), weekly Timetable (clash-checked slots)
               and Resources (upload/remove). Teachers (scope "assigned") only see their own batches.
               Every mutation goes through services via errors.run().
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import * as files from "../core/files.js";
import { html, raw, on, qs, qsa, toast, modal, drawer, dataTable, badge, statCard, emptyState, tabs, setSearchParam, getSearchParam, confirm, avatar } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, date, pct, num, time, fileSize, titleCase } from "../core/format.js";
import { today, addDays } from "../core/clock.js";
import { run } from "../core/errors.js";

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];
const DAY_LONG = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
const TONES = ["blue", "green", "purple", "navy", "amber", "rust"];
const BATCH_STATUS = [["scheduled", "Upcoming"], ["active", "Active"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const KINDS = [["pdf", "PDF"], ["doc", "Document"], ["slides", "Slides"], ["video-link", "Video link"], ["link", "Web link"]];
const KIND_ICON = { pdf: "FileText", doc: "FileText", slides: "Presentation", "video-link": "Video", link: "Link" };

let ctx;
let batchTable;
let resTable;
let openPanel = null; // { kind: "course"|"batch", id, d }
let courseSearch = "";
let ttCenter = "";
let ttInstructor = "";

boot({
  id: "admin-courses",
  portal: "admin",
  perm: ["courses.view"],
  watch: ["courses", "batches", "enrollments", "timetableSlots", "resources", "users", "feeStructures", "centers", "files", "attendanceSessions"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) {
      if (store.byId("courses", id)) openCourse(id);
      else if (store.byId("batches", id)) openBatch(id);
      else toast("That course or batch couldn't be found.", { type: "warning" });
    }
  },
  update: () => refresh(),
  unmount() {
    batchTable?.destroy();
    resTable?.destroy();
  },
});

/* ---------- helpers & scope ---------- */

const userById = (id) => store.byId("users", id);
const courseById = (id) => store.byId("courses", id);
const centerName = (id) => store.byId("centers", id)?.name || "—";
const pctClass = (p) => "pct-" + Math.min(100, Math.max(0, Math.round((Number(p) || 0) / 5) * 5));
const statusLabel = (s) => (BATCH_STATUS.find(([k]) => k === s) || [s, titleCase(s)])[1];
const isAssigned = () => sel.roleOf(ctx.user)?.scope === "assigned";

const visibleBatches = () => sel.batchesVisibleTo(ctx.user);
function visibleCourses() {
  const all = store.get("courses");
  if (!isAssigned()) return all;
  const ids = new Set(visibleBatches().map((b) => b.courseId));
  return all.filter((c) => ids.has(c.id));
}
const canSeeBatch = (id) => visibleBatches().some((b) => b.id === id);

const activeEnrolments = (batchId) => store.where("enrollments", (e) => e.batchId === batchId && e.status === "active");
const filled = (batchId) => activeEnrolments(batchId).length;
const seatsLeft = (b) => Math.max(0, (b.capacity || 0) - filled(b.id));

function courseFee(course) {
  const fs = store.byId("feeStructures", course?.feeStructureId);
  return fs ? fs.components.reduce((t, c) => t + c.amount, 0) : null;
}

const teachers = () => store.where("users", (u) => u.role === "teacher" && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
const instructorNames = (b) => (b.instructorIds || []).map((id) => userById(id)?.name).filter(Boolean).join(", ") || "—";

function moduleTitle(course, modId) {
  return course?.syllabus?.find((m) => m.id === modId)?.title || "Removed module";
}

/* ---------- layout ---------- */

function availableTabs() {
  const t = ["courses", "batches", "timetable"];
  if (ctx.can("resources.manage")) t.push("resources");
  return t;
}

function renderLayout() {
  const avail = availableTabs();
  const active = avail.includes(getSearchParam("tab")) ? getSearchParam("tab") : "courses";
  const canCourse = ctx.can("courses.manage");
  const canBatch = ctx.can("batches.manage");
  const centers = store.get("centers");

  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Courses &amp; Batches</li></ol>
        <h1 class="page-title">Courses &amp; Batches</h1>
        <p class="page-subtitle">${isAssigned() ? "Your assigned batches, their timetable and resources." : "Course catalogue, batches, the weekly timetable and course resources."}</p>
      </div>
      <div class="page-actions">
        ${canCourse ? html`<button type="button" class="btn btn-outline" data-act="new-course" data-for="courses">${raw(icon("Plus", { size: 16 }))}New course</button>` : raw("")}
        ${canBatch ? html`<button type="button" class="btn btn-primary" data-act="new-batch" data-for="courses batches">${raw(icon("Layers", { size: 16 }))}New batch</button>` : raw("")}
        ${canBatch ? html`<button type="button" class="btn btn-primary" data-act="new-slot" data-for="timetable">${raw(icon("CalendarClock", { size: 16 }))}Add class slot</button>` : raw("")}
        ${ctx.can("resources.manage") ? html`<button type="button" class="btn btn-primary" data-act="new-resource" data-for="resources">${raw(icon("Upload", { size: 16 }))}Upload resource</button>` : raw("")}
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="courses">${raw(icon("BookOpen", { size: 15 }))}Courses <span class="tab-count" data-count="courses"></span></button>
        <button type="button" class="tab" role="tab" data-tab="batches">${raw(icon("Layers", { size: 15 }))}Batches <span class="tab-count" data-count="batches"></span></button>
        <button type="button" class="tab" role="tab" data-tab="timetable">${raw(icon("CalendarDays", { size: 15 }))}Timetable</button>
        ${avail.includes("resources") ? html`<button type="button" class="tab" role="tab" data-tab="resources">${raw(icon("FolderOpen", { size: 15 }))}Resources <span class="tab-count" data-count="resources"></span></button>` : raw("")}
      </div>
      <div data-tab-panel="courses" hidden>
        <div class="table-toolbar">
          <div class="table-toolbar-left"><div class="search-field">${raw(icon("Search", { size: 15 }))}<input type="search" class="form-control form-control-sm" placeholder="Search courses" data-course-search></div></div>
          <div class="table-toolbar-right"><span class="table-total-count" data-course-total></span></div>
        </div>
        <div class="card-body" data-course-grid></div>
      </div>
      <div data-tab-panel="batches" hidden><div data-batch-table></div></div>
      <div data-tab-panel="timetable" hidden>
        <div class="table-toolbar">
          <div class="table-toolbar-left">
            <select class="form-control form-control-sm" data-tt-center><option value="">Center: All</option>${raw(centers.map((c) => html`<option value="${c.id}">${c.name}</option>`).join(""))}</select>
            ${isAssigned() ? raw("") : html`<select class="form-control form-control-sm" data-tt-instructor><option value="">Instructor: All</option>${raw(teachers().map((t) => html`<option value="${t.id}">${t.name}</option>`).join(""))}</select>`}
          </div>
          <div class="table-toolbar-right"><span class="table-total-count" data-tt-total></span></div>
        </div>
        <div class="card-body" data-timetable></div>
      </div>
      ${avail.includes("resources") ? html`<div data-tab-panel="resources" hidden><div data-res-table></div></div>` : raw("")}
    </div>`;

  tabs(ctx.root, {
    active,
    onChange: (id) => {
      setSearchParam("tab", id);
      qsa("[data-for]", ctx.root).forEach((b) => (b.hidden = !b.dataset.for.split(" ").includes(id)));
    },
  });

  batchTable = dataTable(qs("[data-batch-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["name", "code", "courseTitle", "instructors", "room"],
    filters: [
      { key: "courseId", label: "Course", options: visibleCourses().map((c) => [c.id, c.code]) },
      { key: "centerId", label: "Center", options: centers.map((c) => [c.id, c.name]) },
      { key: "status", label: "Status", options: BATCH_STATUS },
    ],
    columns: [
      { key: "name", label: "Batch", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.code} · ${r.room || "No room"}</span></div>` },
      { key: "centerName", label: "Center", sortable: true, hideBelow: "md" },
      { key: "instructors", label: "Instructors", hideBelow: "md" },
      { key: "startDate", label: "Dates", sortable: true, render: (r) => html`<span class="nowrap">${date(r.startDate)}</span><div class="cell-sub">to ${date(r.endDate)}</div>` },
      { key: "fillPct", label: "Seats", sortable: true, render: (r) => html`<div class="fill-cell"><div class="progress progress-sm tone-${raw(r.fillPct >= 100 ? "rust" : r.fillPct >= 80 ? "amber" : "green")}"><span class="progress-bar ${raw(pctClass(r.fillPct))}"></span></div><span class="text-sm tabular">${r.filled}/${r.capacity}</span></div>` },
      { key: "status", label: "Status", render: (r) => badge(r.status, statusLabel(r.status)) },
    ],
    rowActions: [
      { label: "Open batch", icon: "Eye", onClick: (r) => openBatch(r.id) },
      { label: "Edit batch", icon: "Pencil", perm: "batches.manage", onClick: (r) => batchFormFlow(r.id) },
      { label: "Enrol students", icon: "UserPlus", perm: "enrollments.manage", hidden: (r) => !["active", "scheduled"].includes(r.status), onClick: (r) => enrolStudentsFlow(r.id) },
      { label: "Mark completed", icon: "CircleCheck", perm: "batches.manage", hidden: (r) => r.status !== "active", onClick: (r) => batchStatusFlow(r.id, "completed") },
      { label: "Cancel batch", icon: "Ban", perm: "batches.manage", danger: true, hidden: (r) => ["completed", "cancelled"].includes(r.status), onClick: (r) => batchStatusFlow(r.id, "cancelled") },
    ],
    onRowClick: (r) => openBatch(r.id),
    empty: emptyState({ icon: "Layers", title: "No batches match", text: isAssigned() ? "You aren't assigned to any batch that matches." : "Try a different search or clear the filters." }),
  });

  if (avail.includes("resources")) {
    resTable = dataTable(qs("[data-res-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["title", "courseCode", "batchName", "fileName"],
      filters: [
        { key: "courseId", label: "Course", options: visibleCourses().map((c) => [c.id, c.code]) },
        { key: "kind", label: "Type", options: KINDS },
      ],
      columns: [
        { key: "title", label: "Resource", sortable: true, render: (r) => html`<div class="cell-user"><span class="icon-tile icon-tile-sm tone-${raw(r.tone)}">${raw(icon(KIND_ICON[r.kind] || "FileText", { size: 16 }))}</span><div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${r.fileName || r.url || "—"}</span></div></div>` },
        { key: "courseCode", label: "Course", sortable: true, render: (r) => html`<span class="chip">${r.courseCode}</span>` },
        { key: "batchName", label: "Batch", hideBelow: "md" },
        { key: "kind", label: "Type", hideBelow: "md", render: (r) => (KINDS.find(([k]) => k === r.kind) || [r.kind, titleCase(r.kind)])[1] },
        { key: "sizeBytes", label: "Size", hideBelow: "md", align: "right", render: (r) => (r.sizeBytes ? fileSize(r.sizeBytes) : "—") },
        { key: "downloads", label: "Downloads", sortable: true, align: "right", render: (r) => html`<span class="tabular fw-600">${num(r.downloads || 0)}</span>` },
      ],
      rowActions: [
        { label: "Open", icon: "ExternalLink", onClick: (r) => openResource(r) },
        { label: "Remove", icon: "Trash2", perm: "resources.manage", danger: true, onClick: (r) => removeResourceFlow(r.id) },
      ],
      onRowClick: (r) => openResource(r),
      empty: emptyState({ icon: "FolderOpen", title: "No resources match", text: "Upload notes, slides or links for your batches." }),
    });
  }
}

/* ---------- data ---------- */

function batchRows() {
  return visibleBatches()
    .map((b) => {
      const n = filled(b.id);
      const c = courseById(b.courseId);
      return { ...b, courseTitle: c?.title || "—", centerName: centerName(b.centerId), instructors: instructorNames(b), filled: n, fillPct: b.capacity ? Math.round((n / b.capacity) * 100) : 0 };
    })
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
}

function resourceRows() {
  const batchIds = new Set(visibleBatches().map((b) => b.id));
  const courseIds = new Set(visibleCourses().map((c) => c.id));
  return store
    .where("resources", (r) => (r.batchId ? batchIds.has(r.batchId) : courseIds.has(r.courseId)))
    .map((r) => {
      const c = courseById(r.courseId);
      const f = r.fileId ? store.byId("files", r.fileId) : null;
      return { ...r, courseCode: c?.code || "—", tone: c?.tone || "blue", batchName: r.batchId ? store.byId("batches", r.batchId)?.name || "Removed batch" : "All batches", fileName: f?.name || "", sizeBytes: r.sizeBytes || f?.size || 0 };
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function refresh() {
  const batches = visibleBatches();
  const courses = visibleCourses();
  const live = batches.filter((b) => b.status === "active");
  const students = new Set(store.where("enrollments", (e) => e.status === "active" && batches.some((b) => b.id === e.batchId)).map((e) => e.studentId));
  const cap = live.reduce((t, b) => t + (b.capacity || 0), 0);
  const used = live.reduce((t, b) => t + filled(b.id), 0);
  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "BookOpen", label: "Active courses", value: num(courses.filter((c) => c.status === "active").length), tone: "blue" }),
    statCard({ icon: "Layers", label: "Active batches", value: num(live.length), tone: "purple" }),
    statCard({ icon: "GraduationCap", label: "Students enrolled", value: num(students.size), tone: "green" }),
    statCard({ icon: "Target", label: "Seats filled", value: cap ? pct((used / cap) * 100) : "—", tone: "amber" }),
  ].join("");

  qs('[data-count="courses"]', ctx.root).textContent = courses.length;
  qs('[data-count="batches"]', ctx.root).textContent = batches.length;
  renderCourses();
  batchTable.update(batchRows());
  renderTimetable();
  if (resTable) {
    const rows = resourceRows();
    qs('[data-count="resources"]', ctx.root).textContent = rows.length;
    resTable.update(rows);
  }
  if (openPanel) repaintPanel();
}

/* ---------- courses ---------- */

function renderCourses() {
  const needle = courseSearch.trim().toLowerCase();
  const list = visibleCourses().filter((c) => !needle || [c.title, c.code, c.body, c.category].some((v) => String(v || "").toLowerCase().includes(needle)));
  qs("[data-course-total]", ctx.root).textContent = `${list.length} ${list.length === 1 ? "course" : "courses"}`;
  const box = qs("[data-course-grid]", ctx.root);
  if (!list.length) {
    box.innerHTML = emptyState({ icon: "BookOpen", title: needle ? "No courses match" : "No courses yet", text: needle ? "Try a different search." : "Create your first course to start adding batches." }).toString();
    return;
  }
  const canM = ctx.can("courses.manage");
  const vis = visibleBatches();
  box.innerHTML = html`<div class="course-grid">${raw(
    list
      .map((c) => {
        const batches = vis.filter((b) => b.courseId === c.id);
        const active = batches.filter((b) => b.status === "active").length;
        const studentCount = new Set(batches.flatMap((b) => activeEnrolments(b.id).map((e) => e.studentId))).size;
        const fee = courseFee(c);
        return html`<article class="course-card">
          <div class="course-card-top">
            <span class="icon-tile tone-${raw(c.tone || "blue")}">${raw(icon("BookOpen", { size: 18 }))}</span>
            <div class="cluster"><span class="chip">${c.code}</span>${raw(badge(c.status, c.status === "active" ? "Active" : "Inactive"))}</div>
          </div>
          <h3 class="course-card-title"><button type="button" class="link-btn" data-open-course="${c.id}">${c.title}</button></h3>
          <p class="course-card-meta">${c.body} · ${c.category}</p>
          <dl class="course-stats">
            <div><dt>Duration</dt><dd>${c.durationWeeks} weeks</dd></div>
            <div><dt>Fee</dt><dd>${fee != null ? money(fee) : "Not set"}</dd></div>
            <div><dt>Active batches</dt><dd>${active}</dd></div>
            <div><dt>Students</dt><dd>${studentCount}</dd></div>
          </dl>
          <div class="course-card-actions">
            <button type="button" class="btn btn-outline btn-sm" data-open-course="${c.id}">${raw(icon("Eye", { size: 14 }))}View</button>
            ${canM ? html`<button type="button" class="btn btn-outline btn-sm" data-syllabus="${c.id}">${raw(icon("ListChecks", { size: 14 }))}Syllabus · ${(c.syllabus || []).length}</button>` : html`<span class="text-sm text-muted">${(c.syllabus || []).length} modules</span>`}
            ${canM ? html`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-edit-course="${c.id}" aria-label="Edit ${c.code}">${raw(icon("Pencil", { size: 14 }))}</button>` : raw("")}
          </div>
        </article>`;
      })
      .join("")
  )}</div>`.toString();
}

async function courseFormFlow(id) {
  const c = id ? courseById(id) : null;
  if (id && !c) return toast("That course no longer exists.", { type: "warning" });
  const structures = store.get("feeStructures");
  const categories = [...new Set(store.get("courses").map((x) => x.category))];
  const data = await modal.form({
    title: c ? `Edit ${c.code}` : "New course",
    submitLabel: c ? "Save course" : "Create course",
    size: "lg",
    fields: [
      { name: "title", label: "Title", required: true, span: 2 },
      { name: "code", label: "Code", required: true, placeholder: "e.g. CCC", help: "2–12 capital letters, digits or hyphens." },
      { name: "body", label: "Certifying body", required: true, placeholder: "e.g. NIELIT" },
      { name: "category", label: "Category", type: "select", required: true, options: categories },
      { name: "durationWeeks", label: "Duration (weeks)", type: "number", min: 1, max: 104, step: 1, required: true },
      { name: "feeStructureId", label: "Fee structure", type: "select", placeholder: "None yet", options: structures.map((f) => [f.id, `${f.name} (${money(f.components.reduce((t, x) => t + x.amount, 0))})`]), span: 2 },
      { name: "tone", label: "Colour", type: "select", options: TONES.map((t) => [t, titleCase(t)]) },
      { name: "status", label: "Status", type: "select", options: [["active", "Active"], ["inactive", "Inactive"]] },
      { name: "description", label: "Description", type: "textarea", rows: 3, span: 2 },
    ],
    values: c ? { ...c } : { durationWeeks: 12, tone: "blue", status: "active", category: categories[0] },
    validate: (d) => {
      const e = {};
      const code = d.code.trim().toUpperCase();
      if (!d.title.trim()) e.title = "Enter a course title.";
      if (!/^[A-Z0-9-]{2,12}$/.test(code)) e.code = "Use 2–12 capital letters, digits or hyphens.";
      else if (store.get("courses").some((x) => x.code === code && x.id !== id)) e.code = "Another course already uses this code.";
      if (!d.body.trim()) e.body = "Enter the certifying body.";
      if (!d.category) e.category = "Choose a category.";
      const w = Number(d.durationWeeks);
      if (!Number.isInteger(w) || w < 1 || w > 104) e.durationWeeks = "Enter whole weeks between 1 and 104.";
      if (c && d.status === "inactive" && store.count("batches", (b) => b.courseId === id && b.status === "active")) e.status = "This course still has active batches.";
      return e;
    },
  });
  if (!data) return;
  const patch = { title: data.title.trim(), code: data.code.trim().toUpperCase(), body: data.body.trim(), category: data.category, durationWeeks: Number(data.durationWeeks), feeStructureId: data.feeStructureId || null, tone: data.tone, status: data.status, description: data.description.trim() };
  const rec = await run(() => services.saveCourse(ctx.user, id, patch), { success: (r) => (c ? `${r.code} saved.` : `${r.code} created. Add its syllabus modules next.`), error: "Couldn't save the course" });
  if (rec && !c) syllabusFlow(rec.id);
}

function syllabusFlow(courseId) {
  const course = courseById(courseId);
  if (!course) return toast("That course no longer exists.", { type: "warning" });
  let list = (course.syllabus || []).map((m) => ({ ...m }));
  const completedIds = new Set(store.where("batches", (b) => b.courseId === courseId).flatMap((b) => b.completedModuleIds || []));
  const m = modal.open({
    title: `Syllabus — ${course.code}`,
    size: "lg",
    body: html`
      <p class="text-muted text-sm section-gap m-0">Rename, reorder or remove modules. Batches of this course pick up the new module list for their progress checklist.</p>
      <ol class="syl-list" data-syl-list></ol>
      <form class="syl-add" data-syl-add novalidate>
        <input type="text" class="form-control" name="title" placeholder="New module title" aria-label="New module title" maxlength="80">
        <button type="submit" class="btn btn-outline">${raw(icon("Plus", { size: 16 }))}Add module</button>
      </form>
      <p class="field-error" data-syl-error hidden></p>`,
    footer: html`<button type="button" class="btn btn-outline" data-syl-cancel>Cancel</button><button type="button" class="btn btn-primary" data-syl-save>${raw(icon("Save", { size: 16 }))}Save syllabus</button>`,
  });
  const listEl = m.root.querySelector("[data-syl-list]");
  const errEl = m.root.querySelector("[data-syl-error]");
  const paint = () => {
    listEl.innerHTML = list.length
      ? list
          .map(
            (mod, i) => html`<li class="syl-row">
            <span class="syl-num">${i + 1}</span>
            <input type="text" class="form-control form-control-sm" value="${mod.title}" data-syl-title="${i}" aria-label="Module ${i + 1} title" maxlength="80">
            ${completedIds.has(mod.id) ? html`<span class="badge tone-green hide-sm">Taught</span>` : raw("")}
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-syl-move="${i}:-1" aria-label="Move up" ${raw(i === 0 ? "disabled" : "")}>${raw(icon("ChevronUp", { size: 14 }))}</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-syl-move="${i}:1" aria-label="Move down" ${raw(i === list.length - 1 ? "disabled" : "")}>${raw(icon("ChevronDown", { size: 14 }))}</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm syl-remove" data-syl-remove="${i}" aria-label="Remove module">${raw(icon("Trash2", { size: 14 }))}</button>
          </li>`
          )
          .join("")
      : emptyState({ icon: "ListChecks", title: "No modules yet", text: "Add the first module below." }).toString();
  };
  paint();
  listEl.addEventListener("input", (e) => {
    const i = e.target.dataset.sylTitle;
    if (i != null) list[i].title = e.target.value;
  });
  listEl.addEventListener("click", async (e) => {
    const mv = e.target.closest("[data-syl-move]");
    const rm = e.target.closest("[data-syl-remove]");
    if (mv) {
      const [i, dir] = mv.dataset.sylMove.split(":").map(Number);
      [list[i], list[i + dir]] = [list[i + dir], list[i]];
      paint();
    }
    if (rm) {
      const i = Number(rm.dataset.sylRemove);
      if (completedIds.has(list[i].id)) {
        const ok = await confirm({ title: "Remove a taught module?", message: `"${list[i].title}" is already marked complete in a batch. Removing it also removes it from those batches' progress.`, confirmLabel: "Remove", danger: true });
        if (!ok) return;
      }
      list.splice(i, 1);
      paint();
    }
  });
  m.root.querySelector("[data-syl-add]").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.elements.title;
    const title = input.value.trim();
    if (!title) {
      errEl.hidden = false;
      errEl.textContent = "Type a module title first.";
      return;
    }
    errEl.hidden = true;
    list.push({ id: `mod_${course.code}_${Date.now().toString(36)}${list.length}`, title, topics: [] });
    input.value = "";
    paint();
    input.focus();
  });
  m.root.querySelector("[data-syl-cancel]").addEventListener("click", m.close);
  m.root.querySelector("[data-syl-save]").addEventListener("click", async () => {
    list = list.map((x) => ({ ...x, title: x.title.trim() }));
    const blank = list.findIndex((x) => !x.title);
    if (blank >= 0) {
      errEl.hidden = false;
      errEl.textContent = `Module ${blank + 1} needs a title.`;
      return;
    }
    if (!list.length) {
      errEl.hidden = false;
      errEl.textContent = "Add at least one module.";
      return;
    }
    const saved = await run(() => services.setSyllabusModules(ctx.user, courseId, list.map((x) => ({ id: x.id, title: x.title, topics: x.topics || [] }))), { success: `Syllabus for ${course.code} saved.`, error: "Couldn't save the syllabus" });
    if (!saved) return;
    m.close();
    // Keep each batch's module checklist in step with the course syllabus.
    if (ctx.can("batches.manage")) {
      const ids = list.map((x) => x.id);
      for (const b of store.where("batches", (x) => x.courseId === courseId)) {
        await run(() => services.saveBatch(ctx.user, b.id, { moduleIds: ids, completedModuleIds: (b.completedModuleIds || []).filter((x) => ids.includes(x)) }), { error: `Couldn't update ${b.code}` });
      }
    }
  });
}

/* ---------- drawers (course / batch) ---------- */

function openPanelDrawer(kind, id, title) {
  openPanel?.d.close();
  const d = drawer.open({ title, wide: true, body: "", footer: raw(" ") });
  openPanel = { kind, id, d };
  setSearchParam("id", id);
  const clear = () => {
    openPanel = null;
    setSearchParam("id", null);
  };
  d.root.querySelector("[data-drawer-close]").addEventListener("click", clear);
  d.root.addEventListener("mousedown", (e) => e.target === d.root && clear());
  d.root.addEventListener("click", onPanelClick);
  d.root.addEventListener("change", onPanelChange);
  repaintPanel();
}

function openCourse(id) {
  if (!courseById(id)) return toast("That course no longer exists.", { type: "warning" });
  if (!visibleCourses().some((c) => c.id === id)) return toast("That course has none of your batches.", { type: "warning" });
  openPanelDrawer("course", id, "Course details");
}

function openBatch(id) {
  if (!store.byId("batches", id)) return toast("That batch no longer exists.", { type: "warning" });
  if (!canSeeBatch(id)) return toast("You aren't assigned to that batch.", { type: "warning" });
  openPanelDrawer("batch", id, "Batch details");
}

function repaintPanel() {
  const { kind, id, d } = openPanel;
  if (!d.root.isConnected) return (openPanel = null);
  const rec = store.byId(kind === "course" ? "courses" : "batches", id);
  const footer = d.root.querySelector(".drawer-footer");
  if (!rec) {
    d.body.innerHTML = emptyState({ icon: "CircleX", title: "This record no longer exists" }).toString();
    footer.innerHTML = "";
    return;
  }
  const scroll = d.body.scrollTop;
  d.body.innerHTML = (kind === "course" ? courseDrawerHtml(rec) : batchDrawerHtml(rec)).toString();
  footer.innerHTML = (kind === "course" ? courseFooter(rec) : batchFooter(rec)).toString();
  footer.hidden = !footer.innerHTML.trim();
  d.body.scrollTop = scroll;
}

function courseDrawerHtml(c) {
  const batches = visibleBatches().filter((b) => b.courseId === c.id);
  const fs = store.byId("feeStructures", c.feeStructureId);
  return html`
    <div class="course-hero section-gap">
      <span class="icon-tile tone-${raw(c.tone || "blue")}">${raw(icon("BookOpen", { size: 20 }))}</span>
      <div class="cell-user-text"><span class="course-hero-title">${c.title}</span><span class="cell-sub">${c.code} · ${c.body} · ${c.category}</span></div>
      ${raw(badge(c.status, c.status === "active" ? "Active" : "Inactive"))}
    </div>
    ${c.description ? html`<p class="text-muted drawer-section">${c.description}</p>` : raw("")}
    <div class="drawer-section">
      <h4 class="drawer-section-title">Fee</h4>
      ${fs
        ? html`<table class="money-table">${raw(fs.components.map((x) => html`<tr><td>${x.label}</td><td>${money(x.amount)}</td></tr>`).join(""))}<tr class="is-total"><td>Total${fs.gstPct ? ` + ${fs.gstPct}% GST` : ""}</td><td>${money(courseFee(c))}</td></tr></table>
            <div class="cluster section-gap">${raw(fs.installments.map((i) => html`<span class="chip">${i.label}: ${i.pct}%</span>`).join(""))}</div>`
        : html`<div class="alert tone-amber">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">No fee structure — enrolling students won't create invoices.${ctx.can("courses.manage") ? " Edit the course to pick one." : ""}</div></div>`}
    </div>
    <div class="drawer-section">
      <h4 class="drawer-section-title">Syllabus · ${(c.syllabus || []).length} modules · ${c.durationWeeks} weeks</h4>
      ${(c.syllabus || []).length ? html`<ol class="syl-view">${raw(c.syllabus.map((mod) => html`<li>${mod.title}</li>`).join(""))}</ol>` : html`<p class="text-muted m-0">No modules yet.</p>`}
    </div>
    <div class="drawer-section">
      <h4 class="drawer-section-title">Batches</h4>
      ${batches.length
        ? html`<ul class="list-plain card">${raw(
            batches
              .map((b) => html`<li class="list-row"><div class="list-row-main"><div class="list-row-title">${b.name}</div><div class="list-row-sub">${centerName(b.centerId)} · ${date(b.startDate)} – ${date(b.endDate)} · ${filled(b.id)}/${b.capacity} students</div></div>${raw(badge(b.status, statusLabel(b.status)))}<button type="button" class="btn btn-ghost btn-sm btn-icon" data-c-act="open-batch" data-id="${b.id}" aria-label="Open ${b.code}">${raw(icon("ChevronRight", { size: 16 }))}</button></li>`)
              .join("")
          )}</ul>`
        : emptyState({ icon: "Layers", title: "No batches yet", text: "Create a batch to start enrolling students." })}
    </div>`;
}

function courseFooter(c) {
  return html`
    ${ctx.can("courses.manage") ? html`<button type="button" class="btn btn-outline" data-c-act="syllabus">${raw(icon("ListChecks", { size: 16 }))}Edit syllabus</button><button type="button" class="btn btn-outline" data-c-act="edit-course">${raw(icon("Pencil", { size: 16 }))}Edit course</button>` : raw("")}
    ${ctx.can("batches.manage") && c.status === "active" ? html`<button type="button" class="btn btn-primary" data-c-act="new-batch">${raw(icon("Plus", { size: 16 }))}New batch</button>` : raw("")}`;
}

function batchDrawerHtml(b) {
  const c = courseById(b.courseId);
  const roster = activeEnrolments(b.id).map((e) => ({ e, u: userById(e.studentId) })).filter((x) => x.u).sort((a, x) => a.u.name.localeCompare(x.u.name));
  const past = store.where("enrollments", (e) => e.batchId === b.id && e.status !== "active");
  const n = roster.length;
  const fill = b.capacity ? (n / b.capacity) * 100 : 0;
  const progress = sel.courseProgress(b);
  const canB = ctx.can("batches.manage");
  const canE = ctx.can("enrollments.manage");
  const slots = store.where("timetableSlots", (s) => s.batchId === b.id).sort((a, x) => a.weekday - x.weekday || a.start.localeCompare(x.start));
  return html`
    <div class="course-hero section-gap">
      <span class="icon-tile tone-${raw(c?.tone || "blue")}">${raw(icon("Layers", { size: 20 }))}</span>
      <div class="cell-user-text"><span class="course-hero-title">${b.name}</span><span class="cell-sub">${b.code} · ${c?.title || "—"}</span></div>
      ${raw(badge(b.status, statusLabel(b.status)))}
    </div>
    <div class="grid grid-2 drawer-section">
      <dl class="kv-list">
        <dt>Center</dt><dd>${centerName(b.centerId)}</dd>
        <dt>Dates</dt><dd>${date(b.startDate)} – ${date(b.endDate)}</dd>
        <dt>Room</dt><dd>${b.room || "—"}</dd>
        <dt>Instructors</dt><dd>${instructorNames(b)}</dd>
        <dt>Schedule</dt><dd>${slots.length ? slots.map((s) => `${DAYS.find(([d]) => d === s.weekday)?.[1]} ${time(s.start)}`).join(", ") : "No class slots"}</dd>
      </dl>
      <div class="stack-sm">
        <div class="cluster-between"><span class="text-sm text-muted">Seats filled</span><span class="fw-700 text-title tabular">${n}/${b.capacity}</span></div>
        <div class="progress tone-${raw(fill >= 100 ? "rust" : fill >= 80 ? "amber" : "green")}"><span class="progress-bar ${raw(pctClass(fill))}"></span></div>
        <div class="cluster-between"><span class="text-sm text-muted">Syllabus covered</span><span class="fw-700 text-title tabular">${progress}%</span></div>
        <div class="progress tone-blue"><span class="progress-bar ${raw(pctClass(progress))}"></span></div>
      </div>
    </div>
    <div class="drawer-section">
      <h4 class="drawer-section-title">Module checklist · ${(b.completedModuleIds || []).length}/${(b.moduleIds || []).length} done</h4>
      ${(b.moduleIds || []).length
        ? html`<ul class="list-plain module-list">${raw(
            b.moduleIds
              .map((mid, i) => {
                const done = (b.completedModuleIds || []).includes(mid);
                return html`<li><label class="check-label module-item ${raw(done ? "is-done" : "")}"><input type="checkbox" data-mod="${mid}" ${raw(done ? "checked" : "")} ${raw(canB ? "" : "disabled")}><span class="syl-num">${i + 1}</span><span>${moduleTitle(c, mid)}</span></label></li>`;
              })
              .join("")
          )}</ul>`
        : html`<p class="text-muted m-0">The course has no syllabus modules yet.</p>`}
    </div>
    <div class="drawer-section">
      <div class="cluster-between section-gap"><h4 class="drawer-section-title m-0">Roster · ${n} active</h4>${canE && ["active", "scheduled"].includes(b.status) ? html`<button type="button" class="btn btn-outline btn-sm" data-c-act="enrol">${raw(icon("UserPlus", { size: 14 }))}Enrol students</button>` : raw("")}</div>
      ${roster.length
        ? html`<ul class="list-plain card">${raw(
            roster
              .map(({ e, u }) => {
                const st = sel.attendanceStats(u.id, b.id);
                return html`<li class="list-row roster-row">
                  ${raw(avatar({ name: u.name, size: "sm" }))}
                  <div class="list-row-main"><div class="list-row-title">${u.name}</div><div class="list-row-sub">${u.rollNo} · attendance ${st.total ? pct(st.pct, 1) : "—"}</div></div>
                  ${canE ? html`<div class="roster-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-c-act="transfer" data-id="${e.id}">${raw(icon("Repeat", { size: 14 }))}<span class="hide-sm">Transfer</span></button>
                    <button type="button" class="btn btn-ghost btn-sm" data-c-act="complete" data-id="${e.id}">${raw(icon("Award", { size: 14 }))}<span class="hide-sm">Complete</span></button>
                    <button type="button" class="btn btn-ghost btn-sm roster-drop" data-c-act="drop" data-id="${e.id}">${raw(icon("UserX", { size: 14 }))}<span class="hide-sm">Drop</span></button>
                  </div>` : raw("")}
                </li>`;
              })
              .join("")
          )}</ul>`
        : emptyState({ icon: "Users", title: "No students enrolled", text: canE ? "Use “Enrol students” to add students to this batch." : "Students appear here once they're enrolled." })}
      ${past.length ? html`<p class="text-sm text-muted roster-past">Past enrolments: ${past.map((e) => `${userById(e.studentId)?.name || "—"} (${e.status})`).join(", ")}</p>` : raw("")}
    </div>`;
}

function batchFooter(b) {
  return html`
    ${ctx.can("batches.manage") ? html`<button type="button" class="btn btn-outline" data-c-act="edit-batch">${raw(icon("Pencil", { size: 16 }))}Edit batch</button>` : raw("")}
    ${ctx.can("enrollments.manage") && ["active", "scheduled"].includes(b.status) ? html`<button type="button" class="btn btn-primary" data-c-act="enrol">${raw(icon("UserPlus", { size: 16 }))}Enrol students</button>` : raw("")}`;
}

function onPanelClick(e) {
  const btn = e.target.closest("[data-c-act]");
  if (!btn || !openPanel) return;
  const { id } = openPanel;
  const act = btn.dataset.cAct;
  if (act === "open-batch") openBatch(btn.dataset.id);
  if (act === "syllabus") syllabusFlow(id);
  if (act === "edit-course") courseFormFlow(id);
  if (act === "new-batch") batchFormFlow(null, id);
  if (act === "edit-batch") batchFormFlow(id);
  if (act === "enrol") enrolStudentsFlow(id);
  if (act === "transfer") transferFlow(btn.dataset.id);
  if (act === "complete") completeFlow(btn.dataset.id);
  if (act === "drop") dropFlow(btn.dataset.id);
}

async function onPanelChange(e) {
  const cb = e.target.closest("[data-mod]");
  if (!cb || !openPanel) return;
  const title = cb.closest("label")?.textContent.trim() || "Module";
  const done = cb.checked;
  const res = await run(() => services.toggleModuleComplete(ctx.user, openPanel.id, cb.dataset.mod, done), { success: done ? `Marked complete: ${title}` : `Marked not done: ${title}`, error: "Couldn't update the module" });
  if (!res) cb.checked = !done;
}

/* ---------- batches ---------- */

async function batchFormFlow(id, presetCourseId) {
  const b = id ? store.byId("batches", id) : null;
  if (id && !b) return toast("That batch no longer exists.", { type: "warning" });
  const courses = store.where("courses", (c) => c.status === "active" || c.id === b?.courseId);
  const enrolled = b ? filled(b.id) : 0;
  const pending = modal.form({
    title: b ? `Edit ${b.code}` : "New batch",
    submitLabel: b ? "Save batch" : "Create batch",
    size: "lg",
    fields: [
      { name: "courseId", label: "Course", type: "select", required: true, placeholder: "Select a course", options: courses.map((c) => [c.id, `${c.code} — ${c.title}`]), span: 2 },
      { name: "name", label: "Batch name", required: true, placeholder: "e.g. CCC (Morning Batch)" },
      { name: "code", label: "Batch code", required: true, placeholder: "e.g. CCC-M7" },
      { name: "centerId", label: "Center", type: "select", required: true, options: store.get("centers").map((c) => [c.id, c.name]) },
      { name: "room", label: "Room", placeholder: "e.g. Lab 1" },
      { name: "startDate", label: "Start date", type: "date", required: true },
      { name: "endDate", label: "End date", type: "date", required: true },
      { name: "capacity", label: "Capacity", type: "number", min: 1, max: 200, step: 1, required: true },
      { name: "status", label: "Status", type: "select", options: BATCH_STATUS },
      { name: "instructorIds", label: "Instructors (Ctrl/⌘-click to pick several)", type: "select", multiple: true, required: true, options: teachers().map((t) => [t.id, `${t.name}${(t.specializations || []).length ? " · " + t.specializations.join(", ") : ""}`]), span: 2 },
    ],
    values: b ? { ...b, instructorIds: "" } : { courseId: presetCourseId || "", centerId: ctx.user.centerId || store.get("centers")[0]?.id, startDate: addDays(today(), 7), capacity: 25, status: "scheduled" },
    validate: (d) => {
      const e = {};
      if (!d.courseId) e.courseId = "Choose a course.";
      if (!d.name.trim()) e.name = "Enter a batch name.";
      const code = d.code.trim().toUpperCase();
      if (!code) e.code = "Enter a batch code.";
      else if (store.get("batches").some((x) => (x.code || "").toUpperCase() === code && x.id !== id)) e.code = "Another batch already uses this code.";
      if (!d.startDate) e.startDate = "Pick a start date.";
      if (!d.endDate) e.endDate = "Pick an end date.";
      else if (d.startDate && d.endDate <= d.startDate) e.endDate = "The end date must be after the start date.";
      const cap = Number(d.capacity);
      if (!Number.isInteger(cap) || cap <= 0) e.capacity = "Capacity must be a whole number above zero.";
      else if (cap < enrolled) e.capacity = `${enrolled} students are already enrolled — capacity can't be lower.`;
      if (!d.instructorIds?.length) e.instructorIds = "Pick at least one instructor.";
      if (b && b.courseId !== d.courseId && enrolled) e.courseId = "Students are enrolled — the course can't be changed.";
      return e;
    },
  });
  // modal.form renders synchronously; pre-select the current instructors in the multi-select.
  const select = qsa('.modal-overlay select[name="instructorIds"]').pop();
  if (select && b) Array.from(select.options).forEach((o) => (o.selected = (b.instructorIds || []).includes(o.value)));
  if (!b && presetCourseId && select) {
    const code = courseById(presetCourseId)?.code;
    const first = teachers().find((t) => (t.specializations || []).includes(code));
    if (first) Array.from(select.options).forEach((o) => (o.selected = o.value === first.id));
  }
  const data = await pending;
  if (!data) return;
  const course = courseById(data.courseId);
  const patch = { courseId: data.courseId, name: data.name.trim(), code: data.code.trim().toUpperCase(), centerId: data.centerId, room: data.room.trim(), startDate: data.startDate, endDate: data.endDate, capacity: Number(data.capacity), status: data.status || "scheduled", instructorIds: data.instructorIds };
  if (!b || b.courseId !== data.courseId) {
    patch.moduleIds = (course?.syllabus || []).map((m) => m.id);
    patch.completedModuleIds = [];
    patch.feeStructureId = course?.feeStructureId || null;
  }
  const rec = await run(() => services.saveBatch(ctx.user, id, patch), { success: (r) => (b ? `${r.code} saved.` : `${r.code} created. Add class slots in the Timetable tab.`), error: "Couldn't save the batch" });
  if (rec && !b && openPanel?.kind !== "batch") openBatch(rec.id);
}

async function batchStatusFlow(id, status) {
  const b = store.byId("batches", id);
  if (!b) return;
  const n = filled(id);
  if (status === "cancelled" && n) return toast(`${b.code} still has ${n} active students. Transfer or drop them before cancelling the batch.`, { type: "warning", duration: 6000 });
  const ok = await confirm({
    title: status === "completed" ? `Mark ${b.code} completed?` : `Cancel ${b.code}?`,
    message: status === "completed" ? "The batch stops taking enrolments. Use each student's Complete action to record certificates." : "The batch is kept for records but can't take enrolments.",
    confirmLabel: status === "completed" ? "Mark completed" : "Cancel batch",
    cancelLabel: "Keep as is",
    danger: status === "cancelled",
  });
  if (!ok) return;
  await run(() => services.saveBatch(ctx.user, id, { status }), { success: `${b.code} ${status === "completed" ? "marked completed" : "cancelled"}.`, error: "Couldn't update the batch" });
}

function enrolStudentsFlow(batchId) {
  const b = store.byId("batches", batchId);
  if (!b) return;
  const inBatch = new Set(activeEnrolments(batchId).map((e) => e.studentId));
  const candidates = store.where("users", (u) => u.role === "student" && u.status === "active" && !inBatch.has(u.id)).sort((a, x) => a.name.localeCompare(x.name));
  const left = seatsLeft(b);
  if (!left) return toast(`${b.code} is full (${b.capacity} seats). Raise its capacity to enrol more students.`, { type: "warning", duration: 6000 });
  if (!candidates.length) return toast("Every active student is already in this batch.", { type: "info" });
  const m = modal.open({
    title: `Enrol students — ${b.code}`,
    size: "lg",
    body: html`
      <div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">${left} ${left === 1 ? "seat" : "seats"} left. Fee invoices are created for each student from the ${courseById(b.courseId)?.code || ""} fee structure.</div></div>
      <div class="search-field section-gap">${raw(icon("Search", { size: 15 }))}<input type="search" class="form-control form-control-sm" placeholder="Search by name or roll no." data-enrol-search aria-label="Search students"></div>
      <ul class="list-plain enrol-pick" data-enrol-list>${raw(
        candidates
          .map((u) => {
            const current = sel.activeBatchesOf(u.id).map((x) => x.code).join(", ");
            return html`<li data-enrol-row data-q="${(u.name + " " + u.rollNo).toLowerCase()}"><label class="enrol-pick-row"><input type="checkbox" value="${u.id}" data-enrol-cb>${raw(avatar({ name: u.name, size: "sm" }))}<span class="list-row-main"><span class="list-row-title">${u.name}</span><span class="list-row-sub">${u.rollNo} · ${centerName(u.centerId)}${current ? " · in " + current : ""}</span></span></label></li>`;
          })
          .join("")
      )}</ul>
      <p class="field-error" data-enrol-error hidden></p>`,
    footer: html`<span class="text-sm text-muted enrol-count" data-enrol-count>0 selected</span><button type="button" class="btn btn-outline" data-enrol-cancel>Cancel</button><button type="button" class="btn btn-primary" data-enrol-go>Enrol selected</button>`,
  });
  const errEl = m.root.querySelector("[data-enrol-error]");
  const picked = () => qsa("[data-enrol-cb]:checked", m.root).map((cb) => cb.value);
  m.root.querySelector("[data-enrol-search]").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    qsa("[data-enrol-row]", m.root).forEach((li) => (li.hidden = q && !li.dataset.q.includes(q)));
  });
  m.root.querySelector("[data-enrol-list]").addEventListener("change", () => {
    const n = picked().length;
    m.root.querySelector("[data-enrol-count]").textContent = `${n} selected · ${left} ${left === 1 ? "seat" : "seats"} left`;
    errEl.hidden = n <= left;
    errEl.textContent = n > left ? `Only ${left} ${left === 1 ? "seat is" : "seats are"} left — untick ${n - left}.` : "";
  });
  m.root.querySelector("[data-enrol-cancel]").addEventListener("click", m.close);
  m.root.querySelector("[data-enrol-go]").addEventListener("click", async (e) => {
    const ids = picked();
    if (!ids.length) {
      errEl.hidden = false;
      errEl.textContent = "Tick at least one student.";
      return;
    }
    if (ids.length > seatsLeft(store.byId("batches", batchId))) {
      errEl.hidden = false;
      errEl.textContent = `Only ${seatsLeft(store.byId("batches", batchId))} seats are left in this batch.`;
      return;
    }
    e.currentTarget.disabled = true;
    const summary = await run(
      async () => {
        let ok = 0;
        let invoices = 0;
        const failed = [];
        for (const sid of ids) {
          try {
            const enr = await services.enrollStudent(ctx.user, { studentId: sid, batchId });
            ok++;
            invoices += enr.invoiceIds.length;
          } catch (err) {
            failed.push(`${userById(sid)?.name}: ${err.message}`);
          }
        }
        if (!ok) throw new Error(failed[0] || "No students were enrolled.");
        return { ok, invoices, failed };
      },
      { success: (s) => `Enrolled ${s.ok} ${s.ok === 1 ? "student" : "students"} in ${b.code} · ${s.invoices} invoices created.${s.failed.length ? ` ${s.failed.length} skipped (${s.failed.join("; ")}).` : ""}`, error: "Couldn't enrol the students" }
    );
    if (summary) m.close();
    else e.currentTarget.disabled = false;
  });
}

async function transferFlow(enrId) {
  const enr = store.byId("enrollments", enrId);
  if (!enr) return;
  const u = userById(enr.studentId);
  const targets = store.where("batches", (x) => x.id !== enr.batchId && ["active", "scheduled"].includes(x.status)).sort((a, x) => (x.courseId === enr.courseId) - (a.courseId === enr.courseId));
  if (!targets.length) return toast("There's no other open batch to transfer to.", { type: "info" });
  const data = await modal.form({
    title: `Transfer ${u?.name}`,
    submitLabel: "Transfer",
    columns: 1,
    extraBodyHtml: html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">The current enrolment is marked "transferred". Existing invoices stay with the student; no new invoices are created.</div></div>`,
    fields: [{ name: "batchId", label: "Move to batch", type: "select", required: true, placeholder: "Select a batch", options: targets.map((x) => [x.id, `${x.name} · ${centerName(x.centerId)} · ${seatsLeft(x)} seats left`]) }],
    validate: (d) => {
      const e = {};
      const t = store.byId("batches", d.batchId);
      if (!t) e.batchId = "Choose a batch.";
      else if (!seatsLeft(t)) e.batchId = "That batch is full.";
      else if (activeEnrolments(t.id).some((x) => x.studentId === enr.studentId)) e.batchId = "The student is already in that batch.";
      return e;
    },
  });
  if (!data) return;
  await run(() => services.transferEnrollment(ctx.user, enrId, data.batchId), { success: `${u?.name} transferred to ${store.byId("batches", data.batchId)?.code}.`, error: "Couldn't transfer the student" });
}

async function completeFlow(enrId) {
  const enr = store.byId("enrollments", enrId);
  if (!enr) return;
  const u = userById(enr.studentId);
  const data = await modal.form({
    title: `Complete course — ${u?.name}`,
    submitLabel: "Mark completed",
    columns: 1,
    size: "sm",
    fields: [{ name: "certificateNo", label: "Certificate no.", placeholder: "Optional", help: "Recorded on the enrolment." }],
  });
  if (!data) return;
  await run(() => services.completeEnrollment(ctx.user, enrId, data.certificateNo.trim()), { success: `${u?.name} marked as completed.`, error: "Couldn't complete the enrolment" });
}

async function dropFlow(enrId) {
  const enr = store.byId("enrollments", enrId);
  if (!enr) return;
  const u = userById(enr.studentId);
  const data = await modal.form({
    title: `Drop ${u?.name}`,
    submitLabel: "Continue",
    columns: 1,
    size: "sm",
    fields: [{ name: "reason", label: "Reason", required: true, placeholder: "e.g. Discontinued — personal reasons" }],
    validate: (d) => (d.reason.trim() ? {} : { reason: "Give a reason — it's kept on the student's record." }),
  });
  if (!data) return;
  const ok = await confirm({ title: `Drop ${u?.name} from the batch?`, message: "They lose access to this batch's classes and resources. Their invoices aren't cancelled automatically.", confirmLabel: "Drop student", danger: true });
  if (!ok) return;
  await run(() => services.dropEnrollment(ctx.user, enrId, data.reason.trim()), { success: `${u?.name} dropped.`, error: "Couldn't drop the student" });
}

/* ---------- timetable ---------- */

function visibleSlots() {
  const batchIds = new Set(visibleBatches().filter((b) => !ttCenter || b.centerId === ttCenter).map((b) => b.id));
  return store.where("timetableSlots", (s) => batchIds.has(s.batchId) && (!ttInstructor || s.instructorId === ttInstructor));
}

function renderTimetable() {
  const box = qs("[data-timetable]", ctx.root);
  const slots = visibleSlots();
  qs("[data-tt-total]", ctx.root).textContent = `${slots.length} ${slots.length === 1 ? "class" : "classes"} a week`;
  if (!slots.length) {
    box.innerHTML = emptyState({ icon: "CalendarDays", title: "No classes scheduled", text: ctx.can("batches.manage") ? "Add class slots to build the weekly timetable." : "No class slots match these filters.", actionLabel: ctx.can("batches.manage") ? "Add class slot" : "", actionAttrs: 'data-act="new-slot"' }).toString();
    return;
  }
  const ranges = [...new Set(slots.map((s) => `${s.start}|${s.end}`))].sort();
  box.innerHTML = html`
    <div class="tt-scroll">
      <div class="tt-grid" role="table" aria-label="Weekly timetable">
        <div class="tt-head tt-corner" role="columnheader">Time</div>
        ${raw(DAYS.map(([, l]) => html`<div class="tt-head" role="columnheader">${l}</div>`).join(""))}
        ${raw(
          ranges
            .map((r) => {
              const [start, end] = r.split("|");
              return html`<div class="tt-time" role="rowheader">${time(start)}<span>${time(end)}</span></div>${raw(
                DAYS.map(([d]) => {
                  const cell = slots.filter((s) => s.weekday === d && s.start === start && s.end === end);
                  return html`<div class="tt-cell" role="cell">${raw(
                    cell
                      .map((s) => {
                        const b = store.byId("batches", s.batchId);
                        const c = courseById(b?.courseId);
                        return html`<button type="button" class="tt-slot tone-${raw(c?.tone || "blue")}" data-slot="${s.id}"><span class="tt-slot-code">${b?.code || "—"}</span><span class="tt-slot-meta">${raw(icon("MapPin", { size: 11 }))}${s.room || "—"}</span><span class="tt-slot-meta">${raw(icon("UserRound", { size: 11 }))}${userById(s.instructorId)?.name || "—"}</span></button>`;
                      })
                      .join("")
                  )}</div>`;
                }).join("")
              )}`;
            })
            .join("")
        )}
      </div>
    </div>`.toString();
}

function openSlot(id) {
  const s = store.byId("timetableSlots", id);
  if (!s) return toast("That class slot no longer exists.", { type: "warning" });
  const b = store.byId("batches", s.batchId);
  const canB = ctx.can("batches.manage");
  const m = modal.open({
    title: b?.code || "Class slot",
    size: "sm",
    body: html`<dl class="kv-list">
      <dt>Batch</dt><dd>${b?.name || "—"}</dd>
      <dt>When</dt><dd>${DAY_LONG[s.weekday]}, ${time(s.start)} – ${time(s.end)}</dd>
      <dt>Room</dt><dd>${s.room || "—"}</dd>
      <dt>Instructor</dt><dd>${userById(s.instructorId)?.name || "—"}</dd>
      <dt>Center</dt><dd>${centerName(b?.centerId)}</dd>
    </dl>`,
    footer: canB
      ? html`<button type="button" class="btn btn-outline btn-danger-text" data-s="remove">${raw(icon("Trash2", { size: 16 }))}Remove</button><button type="button" class="btn btn-primary" data-s="edit">${raw(icon("Pencil", { size: 16 }))}Edit</button>`
      : html`<button type="button" class="btn btn-outline" data-s="open">Open batch</button>`,
  });
  m.root.querySelector('[data-s="edit"]')?.addEventListener("click", () => {
    m.close();
    slotFormFlow(id);
  });
  m.root.querySelector('[data-s="open"]')?.addEventListener("click", () => {
    m.close();
    openBatch(s.batchId);
  });
  m.root.querySelector('[data-s="remove"]')?.addEventListener("click", async () => {
    m.close();
    const ok = await confirm({ title: "Remove this class slot?", message: `${b?.code} on ${DAY_LONG[s.weekday]} at ${time(s.start)} will be removed from the timetable. Attendance already marked is kept.`, confirmLabel: "Remove slot", danger: true });
    if (!ok) return;
    await run(() => services.removeTimetableSlot(ctx.user, id), { success: "Class slot removed.", error: "Couldn't remove the slot" });
  });
}

async function slotFormFlow(id) {
  const s = id ? store.byId("timetableSlots", id) : null;
  const batches = visibleBatches().filter((b) => ["active", "scheduled"].includes(b.status) || b.id === s?.batchId);
  if (!batches.length) return toast("Create an active batch first.", { type: "info" });
  const data = await modal.form({
    title: s ? "Edit class slot" : "Add class slot",
    submitLabel: s ? "Save slot" : "Add slot",
    fields: [
      { name: "batchId", label: "Batch", type: "select", required: true, placeholder: "Select a batch", options: batches.map((b) => [b.id, `${b.code} — ${b.name}`]), span: 2 },
      { name: "weekday", label: "Day", type: "select", required: true, options: DAYS.map(([d]) => [d, DAY_LONG[d]]) },
      { name: "room", label: "Room", required: true, placeholder: "e.g. Lab 1" },
      { name: "start", label: "Starts", type: "time", required: true },
      { name: "end", label: "Ends", type: "time", required: true },
      { name: "instructorId", label: "Instructor", type: "select", required: true, placeholder: "Select an instructor", options: teachers().map((t) => [t.id, t.name]), span: 2 },
    ],
    values: s ? { ...s } : { weekday: 1, start: "09:00", end: "10:30" },
    validate: (d) => {
      const e = {};
      if (!d.batchId) e.batchId = "Choose a batch.";
      if (!d.room.trim()) e.room = "Enter a room.";
      if (!d.start) e.start = "Pick a start time.";
      if (!d.end) e.end = "Pick an end time.";
      else if (d.start && d.end <= d.start) e.end = "The class must end after it starts.";
      if (!d.instructorId) e.instructorId = "Choose an instructor.";
      if (!Object.keys(e).length) {
        const clash = services.checkTimetableClash({ weekday: Number(d.weekday), start: d.start, end: d.end, room: d.room.trim(), instructorId: d.instructorId }, id);
        if (clash) e[/^Room/.test(clash) ? "room" : "instructorId"] = clash;
      }
      return e;
    },
  });
  if (!data) return;
  const patch = { batchId: data.batchId, weekday: Number(data.weekday), start: data.start, end: data.end, room: data.room.trim(), instructorId: data.instructorId, moduleId: s?.moduleId || null };
  await run(() => services.saveTimetableSlot(ctx.user, id, patch), { success: `Class slot ${s ? "saved" : "added"} — ${DAY_LONG[patch.weekday]} ${time(patch.start)}.`, error: "Couldn't save the slot" });
}

/* ---------- resources ---------- */

async function openResource(r) {
  if (r.url && !r.fileId) {
    window.open(r.url, "_blank", "noopener");
    return;
  }
  if (!r.fileId) return toast("This resource has no file or link.", { type: "warning" });
  await run(() => files.downloadFile(r.fileId), { error: "Couldn't open the file" });
}

async function removeResourceFlow(id) {
  const r = store.byId("resources", id);
  if (!r) return;
  const ok = await confirm({ title: `Remove "${r.title}"?`, message: "Students will no longer see it. Any uploaded file is deleted.", confirmLabel: "Remove", danger: true });
  if (!ok) return;
  await run(() => services.removeResource(ctx.user, id), { success: "Resource removed.", error: "Couldn't remove the resource" });
}

async function resourceFormFlow() {
  const courses = visibleCourses();
  const batches = visibleBatches();
  if (!courses.length) return toast("There are no courses to add resources to.", { type: "info" });
  const maxKB = (store.get("settings").system || {}).maxUploadKB || 2048;
  const data = await modal.form({
    title: "Upload resource",
    submitLabel: "Upload",
    fields: [
      { name: "title", label: "Title", required: true, span: 2, placeholder: "e.g. Spreadsheet practice set" },
      { name: "courseId", label: "Course", type: "select", required: true, placeholder: "Select a course", options: courses.map((c) => [c.id, `${c.code} — ${c.title}`]) },
      { name: "batchId", label: "Batch", type: "select", placeholder: isAssigned() ? "Select a batch" : "All batches of the course", options: batches.map((b) => [b.id, b.code]) },
      { name: "kind", label: "Type", type: "select", required: true, options: KINDS },
      { name: "file", label: "File", type: "file", accept: ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*", help: `Up to ${Math.round(maxKB / 1024)} MB.` },
      { name: "url", label: "…or link (URL)", type: "url", placeholder: "https://", span: 2 },
    ],
    values: { kind: "pdf" },
    validate: (d) => {
      const e = {};
      if (!d.title.trim()) e.title = "Enter a title.";
      if (!d.courseId) e.courseId = "Choose a course.";
      const b = d.batchId ? store.byId("batches", d.batchId) : null;
      if (b && b.courseId !== d.courseId) e.batchId = "That batch belongs to a different course.";
      if (!b && isAssigned()) e.batchId = "Choose one of your batches.";
      const url = d.url.trim();
      if (url && !/^https?:\/\/\S+\.\S+/.test(url)) e.url = "Enter a full link starting with http:// or https://";
      const linkKind = d.kind === "video-link" || d.kind === "link";
      if (linkKind && !url) e.url = "Links need a URL.";
      if (!linkKind && !d.file && !url) e.file = "Choose a file or give a link.";
      if (d.file && d.file.size > maxKB * 1024) e.file = `That file is larger than ${Math.round(maxKB / 1024)} MB.`;
      return e;
    },
  });
  if (!data) return;
  const url = data.url.trim();
  const useFile = data.file && !(data.kind === "video-link" || data.kind === "link");
  await run(() => services.saveResource(ctx.user, { title: data.title.trim(), courseId: data.courseId, batchId: data.batchId || null, moduleId: null, kind: data.kind, url: useFile ? null : url || null, sizeBytes: useFile ? data.file.size : 0 }, useFile ? [data.file] : null), { success: (r) => `"${r.title}" uploaded and students notified.`, error: "Couldn't upload the resource" });
}

/* ---------- wiring ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="new-course"]', () => courseFormFlow(null));
  on(ctx.root, "click", '[data-act="new-batch"]', () => batchFormFlow(null));
  on(ctx.root, "click", '[data-act="new-slot"]', () => slotFormFlow(null));
  on(ctx.root, "click", '[data-act="new-resource"]', () => resourceFormFlow());
  on(ctx.root, "click", "[data-open-course]", (e, b) => openCourse(b.dataset.openCourse));
  on(ctx.root, "click", "[data-syllabus]", (e, b) => syllabusFlow(b.dataset.syllabus));
  on(ctx.root, "click", "[data-edit-course]", (e, b) => courseFormFlow(b.dataset.editCourse));
  on(ctx.root, "click", "[data-slot]", (e, b) => openSlot(b.dataset.slot));
  on(ctx.root, "input", "[data-course-search]", (e, input) => {
    courseSearch = input.value;
    renderCourses();
  });
  on(ctx.root, "change", "[data-tt-center]", (e, s) => {
    ttCenter = s.value;
    renderTimetable();
  });
  on(ctx.root, "change", "[data-tt-instructor]", (e, s) => {
    ttInstructor = s.value;
    renderTimetable();
  });
}

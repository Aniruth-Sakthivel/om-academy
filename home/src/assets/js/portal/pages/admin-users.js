/*
Author       : OM Academy
Description  : Staff → Users. Students (KPIs, filters, profile drawer, enrol, reset password, CSV import/export),
               Staff (add/edit, activate/deactivate) and Roles & permissions (permission matrix, new role).
               Teachers (scope "assigned") only see students enrolled in their own batches.
               Every mutation goes through services via errors.run().
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, drawer, dataTable, badge, statCard, emptyState, tabs, downloadCsv, setSearchParam, getSearchParam, confirm, avatar } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, date, pct, num } from "../core/format.js";
import { today } from "../core/clock.js";
import { PERMISSION_GROUPS } from "../core/perms.js";
import { DEMO_ACCOUNTS } from "../core/auth.js";
import { run } from "../core/errors.js";

let ctx;
let studentTable;
let staffTable;
let courseFilter = "";
let openPanel = null; // { kind: "student"|"staff", id, d }
const roleDrafts = new Map(); // roleId → Set of permissions (unsaved edits)

boot({
  id: "admin-users",
  portal: "admin",
  perm: ["students.view", "staff.view", "roles.manage"],
  watch: ["users", "enrollments", "batches", "roles", "invoices", "payments", "attendanceSessions", "exams", "marks", "centers", "courses"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openUser(id);
  },
  update: () => refresh(),
  unmount() {
    studentTable?.destroy();
    staffTable?.destroy();
  },
});

/* ---------- helpers ---------- */

const userById = (id) => store.byId("users", id);
const centerName = (id) => store.byId("centers", id)?.name || "—";
const roleName = (id) => store.byId("roles", id)?.name || id;
const pctClass = (p) => "pct-" + Math.min(100, Math.max(0, Math.round((Number(p) || 0) / 5) * 5));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normPhone(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
}
const phoneOk = (v) => /^\d{10}$/.test(normPhone(v));
const fmtPhone = (v) => (normPhone(v) ? "+91 " + normPhone(v) : "");

function emailTaken(email, exceptId) {
  const needle = String(email || "").trim().toLowerCase();
  return store.get("users").some((u) => u.id !== exceptId && (u.email || "").toLowerCase() === needle);
}

const isAssigned = () => sel.roleOf(ctx.user)?.scope === "assigned";

// Students visible to the current user (teachers: students of their batches only)
function visibleStudents() {
  const all = store.where("users", (u) => u.role === "student");
  if (!isAssigned()) return all;
  const batchIds = new Set(sel.batchesVisibleTo(ctx.user).map((b) => b.id));
  const ids = new Set(store.where("enrollments", (e) => batchIds.has(e.batchId) && e.status === "active").map((e) => e.studentId));
  return all.filter((u) => ids.has(u.id));
}

function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return "oma-" + out;
}

/* ---------- data ---------- */

function studentRows() {
  return visibleStudents()
    .map((u) => {
      const enr = sel.studentEnrollments(u.id, { activeOnly: true });
      const courses = enr.map((e) => store.byId("courses", e.courseId)).filter(Boolean);
      return { ...u, courseIds: courses.map((c) => c.id), courseCodes: courses.map((c) => c.code).join(", "), centerName: centerName(u.centerId) };
    })
    .filter((r) => !courseFilter || r.courseIds.includes(courseFilter))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function staffRows() {
  return store
    .where("users", (u) => u.role !== "student")
    .map((u) => ({ ...u, roleName: roleName(u.role), centerName: centerName(u.centerId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- layout ---------- */

function availableTabs() {
  const out = [];
  if (ctx.can("students.view")) out.push("students");
  if (ctx.can("staff.view")) out.push("staff");
  if (ctx.can("roles.manage")) out.push("roles");
  return out;
}

function renderLayout() {
  const avail = availableTabs();
  const active = avail.includes(getSearchParam("tab")) ? getSearchParam("tab") : avail[0];
  const canStudents = ctx.can("students.manage");
  const canStaff = ctx.can("staff.manage");
  const centers = store.get("centers");
  const tabBtn = (id, ic, label, count) =>
    avail.includes(id) ? html`<button type="button" class="tab" role="tab" data-tab="${id}">${raw(icon(ic, { size: 15 }))}${label}${count ? html` <span class="tab-count" data-count="${id}"></span>` : raw("")}</button>` : raw("");

  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Users</li></ol>
        <h1 class="page-title">Users</h1>
        <p class="page-subtitle">${isAssigned() ? "Students enrolled in your batches." : "Students, staff accounts and what each role can do."}</p>
      </div>
      <div class="page-actions" data-actions>
        ${avail.includes("students") ? html`<button type="button" class="btn btn-outline" data-act="export" data-for="students">${raw(icon("Download", { size: 16 }))}Export</button>` : raw("")}
        ${canStudents ? html`<button type="button" class="btn btn-outline" data-act="import" data-for="students">${raw(icon("FileUp", { size: 16 }))}Import CSV</button>` : raw("")}
        ${canStudents ? html`<button type="button" class="btn btn-primary" data-act="new-student" data-for="students">${raw(icon("UserPlus", { size: 16 }))}Add student</button>` : raw("")}
        ${canStaff ? html`<button type="button" class="btn btn-primary" data-act="new-staff" data-for="staff">${raw(icon("UserPlus", { size: 16 }))}Add staff</button>` : raw("")}
        ${ctx.can("roles.manage") ? html`<button type="button" class="btn btn-primary" data-act="new-role" data-for="roles">${raw(icon("Plus", { size: 16 }))}New role</button>` : raw("")}
      </div>
    </div>
    ${avail.includes("students") ? html`<div class="grid grid-kpi page-section" data-kpis></div>` : raw("")}
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${tabBtn("students", "GraduationCap", "Students", true)}
        ${tabBtn("staff", "Users", "Staff", true)}
        ${tabBtn("roles", "ShieldCheck", "Roles & permissions", false)}
      </div>
      ${avail.includes("students") ? html`
        <div data-tab-panel="students" hidden>
          <div class="users-course-filter">
            <label class="text-sm text-muted" for="course-filter">Course</label>
            <select id="course-filter" class="form-control form-control-sm" data-course-filter>
              <option value="">All courses</option>
              ${raw(store.get("courses").map((c) => html`<option value="${c.id}">${c.code} — ${c.title}</option>`).join(""))}
            </select>
          </div>
          <div data-student-table></div>
        </div>` : raw("")}
      ${avail.includes("staff") ? html`<div data-tab-panel="staff" hidden><div data-staff-table></div></div>` : raw("")}
      ${avail.includes("roles") ? html`<div data-tab-panel="roles" hidden><div class="card-body" data-roles></div></div>` : raw("")}
    </div>`;

  tabs(ctx.root, {
    active,
    onChange: (id) => {
      setSearchParam("tab", id);
      qsa("[data-for]", ctx.root).forEach((b) => (b.hidden = b.dataset.for !== id));
    },
  });

  if (avail.includes("students")) {
    studentTable = dataTable(qs("[data-student-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["name", "rollNo", "email", "phone", "courseCodes"],
      filters: [
        { key: "centerId", label: "Center", options: centers.map((c) => [c.id, c.name]) },
        { key: "status", label: "Status", options: [["active", "Active"], ["inactive", "Inactive"]] },
      ],
      columns: [
        { key: "name", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.name, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.name}</span><span class="cell-sub">${r.email}</span></div></div>` },
        { key: "rollNo", label: "Roll no.", sortable: true, render: (r) => html`<span class="tabular">${r.rollNo}</span>` },
        { key: "courseCodes", label: "Course(s)", render: (r) => (r.courseCodes ? html`<div class="cluster">${raw(r.courseCodes.split(", ").map((c) => html`<span class="chip">${c}</span>`).join(""))}</div>` : html`<span class="text-muted">Not enrolled</span>`) },
        { key: "centerName", label: "Center", sortable: true, hideBelow: "md" },
        { key: "phone", label: "Phone", hideBelow: "md" },
        { key: "status", label: "Status", render: (r) => badge(r.status, r.status === "active" ? "Active" : "Inactive") },
      ],
      rowActions: [
        { label: "View profile", icon: "Eye", onClick: (r) => openStudent(r.id) },
        { label: "Edit", icon: "Pencil", perm: "students.manage", onClick: (r) => studentFormFlow(r.id) },
        { label: "Enrol in batch", icon: "BookOpen", perm: "enrollments.manage", hidden: (r) => r.status !== "active", onClick: (r) => enrolFlow(r.id) },
        { label: "Reset password", icon: "KeyRound", perm: "students.manage", onClick: (r) => resetPasswordFlow(r.id) },
        { label: "Deactivate", icon: "UserX", perm: "students.manage", danger: true, hidden: (r) => r.status !== "active", onClick: (r) => statusFlow(r.id, "inactive") },
        { label: "Activate", icon: "UserCheck", perm: "students.manage", hidden: (r) => r.status === "active", onClick: (r) => statusFlow(r.id, "active") },
      ],
      onRowClick: (r) => openStudent(r.id),
      empty: emptyState({ icon: "GraduationCap", title: "No students match", text: isAssigned() ? "Only students in your batches are listed." : "Try a different search or clear the filters." }),
    });
  }

  if (avail.includes("staff")) {
    staffTable = dataTable(qs("[data-staff-table]", ctx.root), {
      rows: [],
      can: ctx.can,
      searchKeys: ["name", "email", "designation", "roleName"],
      filters: [
        { key: "role", label: "Role", options: store.where("roles", (r) => r.portal === "staff").map((r) => [r.id, r.name]) },
        { key: "centerId", label: "Center", options: centers.map((c) => [c.id, c.name]) },
        { key: "status", label: "Status", options: [["active", "Active"], ["inactive", "Inactive"]] },
      ],
      columns: [
        { key: "name", label: "Name", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.name, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.name}${r.id === ctx.user.id ? html` <span class="text-muted text-sm">(you)</span>` : raw("")}</span><span class="cell-sub">${r.email}</span></div></div>` },
        { key: "roleName", label: "Role", sortable: true, render: (r) => html`<span class="badge tone-${raw(r.role === "admin" ? "navy" : r.role === "teacher" ? "blue" : r.role === "accountant" ? "amber" : "purple")}">${r.roleName}</span>` },
        { key: "designation", label: "Designation", hideBelow: "md" },
        { key: "centerName", label: "Center", sortable: true, hideBelow: "md" },
        { key: "status", label: "Status", render: (r) => badge(r.status, r.status === "active" ? "Active" : "Inactive") },
      ],
      rowActions: [
        { label: "View details", icon: "Eye", onClick: (r) => openStaff(r.id) },
        { label: "Edit", icon: "Pencil", perm: "staff.manage", onClick: (r) => staffFormFlow(r.id) },
        { label: "Reset password", icon: "KeyRound", perm: "staff.manage", onClick: (r) => resetPasswordFlow(r.id) },
        { label: "Deactivate", icon: "UserX", perm: "staff.manage", danger: true, hidden: (r) => r.status !== "active", onClick: (r) => statusFlow(r.id, "inactive") },
        { label: "Activate", icon: "UserCheck", perm: "staff.manage", hidden: (r) => r.status === "active", onClick: (r) => statusFlow(r.id, "active") },
      ],
      onRowClick: (r) => openStaff(r.id),
      empty: emptyState({ icon: "Users", title: "No staff match", text: "Try a different search or clear the filters." }),
    });
  }
}

function refresh() {
  const avail = availableTabs();
  if (avail.includes("students")) {
    const all = visibleStudents();
    const month = today().slice(0, 7);
    const active = all.filter((u) => u.status === "active").length;
    const newThisMonth = all.filter((u) => (u.admissionDate || "").slice(0, 7) === month).length;
    const byCenter = store.get("centers").map((c) => `${c.code} ${all.filter((u) => u.centerId === c.id).length}`).join(" · ");
    qs("[data-kpis]", ctx.root).innerHTML = [
      statCard({ icon: "GraduationCap", label: isAssigned() ? "Students in your batches" : "Total students", value: num(all.length), tone: "blue" }),
      statCard({ icon: "UserCheck", label: "Active", value: num(active), tone: "green" }),
      statCard({ icon: "UserPlus", label: "New this month", value: num(newThisMonth), tone: "purple" }),
      statCard({ icon: "Building2", label: "By center", value: html`<span class="users-kpi-small">${byCenter}</span>`, tone: "amber" }),
    ].join("");
    const rows = studentRows();
    qs('[data-count="students"]', ctx.root).textContent = rows.length;
    studentTable.update(rows);
  }
  if (avail.includes("staff")) {
    const rows = staffRows();
    qs('[data-count="staff"]', ctx.root).textContent = rows.length;
    staffTable.update(rows);
  }
  if (avail.includes("roles")) renderRoles();
  if (openPanel) repaintPanel();
}

/* ---------- actions wiring ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="new-student"]', () => studentFormFlow(null));
  on(ctx.root, "click", '[data-act="new-staff"]', () => staffFormFlow(null));
  on(ctx.root, "click", '[data-act="new-role"]', () => newRoleFlow());
  on(ctx.root, "click", '[data-act="export"]', () => exportCsv());
  on(ctx.root, "click", '[data-act="import"]', () => importFlow());
  on(ctx.root, "change", "[data-course-filter]", (e, s) => {
    courseFilter = s.value;
    refresh();
  });
  // Permission matrix
  on(ctx.root, "change", "[data-perm-cb]", (e, cb) => {
    const set = draftFor(cb.dataset.role);
    cb.checked ? set.add(cb.dataset.permCb) : set.delete(cb.dataset.permCb);
    renderRoles();
  });
  on(ctx.root, "change", "[data-module-cb]", (e, cb) => {
    const set = draftFor(cb.dataset.role);
    const group = PERMISSION_GROUPS.find((g) => g.module === cb.dataset.moduleCb);
    group.perms.forEach(([p]) => (cb.checked ? set.add(p) : set.delete(p)));
    renderRoles();
  });
  on(ctx.root, "click", "[data-save-role]", (e, btn) => saveRoleFlow(btn.dataset.saveRole));
  on(ctx.root, "click", "[data-reset-role]", (e, btn) => {
    roleDrafts.delete(btn.dataset.resetRole);
    renderRoles();
  });
}

/* ---------- students ---------- */

function studentFields(isNew) {
  const centers = store.get("centers");
  return [
    { name: "name", label: "Full name", required: true, span: 2 },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Mobile (10 digits)", type: "tel", required: true, placeholder: "98xxxxxxxx" },
    { name: "centerId", label: "Center", type: "select", required: true, options: centers.map((c) => [c.id, c.name]) },
    { name: "gender", label: "Gender", type: "select", placeholder: "Select", options: [["F", "Female"], ["M", "Male"], ["O", "Other"]] },
    { name: "dob", label: "Date of birth", type: "date" },
    { name: "qualification", label: "Qualification", type: "select", placeholder: "Select", options: ["10th Pass", "12th Pass", "Graduate", "Post Graduate"] },
    { name: "guardianName", label: "Guardian name" },
    { name: "guardianPhone", label: "Guardian mobile", type: "tel" },
    { name: "address", label: "Address", type: "textarea", rows: 2, span: 2 },
    ...(isNew ? [] : [{ name: "admissionDate", label: "Admission date", type: "date" }]),
  ];
}

async function studentFormFlow(id) {
  const u = id ? userById(id) : null;
  if (id && !u) return toast("That student no longer exists.", { type: "warning" });
  const data = await modal.form({
    title: u ? `Edit ${u.name}` : "Add student",
    submitLabel: u ? "Save changes" : "Add student",
    size: "lg",
    fields: studentFields(!u),
    values: u ? { ...u, phone: normPhone(u.phone), guardianPhone: normPhone(u.guardianPhone) } : { centerId: ctx.user.centerId || store.get("centers")[0]?.id },
    validate: (d) => {
      const e = {};
      if (!d.name.trim()) e.name = "Enter the student's name.";
      if (!EMAIL_RE.test(d.email.trim())) e.email = "Enter a valid email address.";
      else if (emailTaken(d.email, id)) e.email = "Another account already uses this email.";
      if (!phoneOk(d.phone)) e.phone = "Enter a 10-digit mobile number.";
      if (d.guardianPhone.trim() && !phoneOk(d.guardianPhone)) e.guardianPhone = "Enter a 10-digit mobile number.";
      if (!d.centerId) e.centerId = "Choose a center.";
      if (d.dob && d.dob >= today()) e.dob = "Date of birth must be in the past.";
      return e;
    },
  });
  if (!data) return;
  const patch = {
    name: data.name.trim(), email: data.email.trim().toLowerCase(), phone: fmtPhone(data.phone), centerId: data.centerId,
    gender: data.gender || null, dob: data.dob || null, qualification: data.qualification || "", guardianName: data.guardianName.trim(),
    guardianPhone: fmtPhone(data.guardianPhone), address: data.address.trim(),
    ...(u && data.admissionDate ? { admissionDate: data.admissionDate } : {}),
  };
  if (u) {
    await run(() => services.updateStudent(ctx.user, id, patch), { success: `${patch.name} updated.`, error: "Couldn't save the student" });
  } else {
    const rec = await run(() => services.createStudent(ctx.user, patch), { success: (r) => `${r.name} added — roll no. ${r.rollNo}. Default password: student123`, error: "Couldn't add the student" });
    if (rec && ctx.can("enrollments.manage")) {
      const go = await confirm({ title: "Enrol in a batch now?", message: `${rec.name} isn't enrolled in any batch yet.`, confirmLabel: "Enrol now", cancelLabel: "Later" });
      if (go) enrolFlow(rec.id);
    }
  }
}

async function statusFlow(id, status) {
  const u = userById(id);
  if (!u) return;
  if (status === "inactive" && id === ctx.user.id) return toast("You can't deactivate your own account.", { type: "warning" });
  if (status === "inactive") {
    const ok = await confirm({ title: `Deactivate ${u.name}?`, message: "They won't be able to sign in until the account is activated again. Their records are kept.", confirmLabel: "Deactivate", danger: true });
    if (!ok) return;
  }
  await run(() => services.setUserStatus(ctx.user, id, status), { success: `${u.name} ${status === "active" ? "activated" : "deactivated"}.`, error: `Couldn't ${status === "active" ? "activate" : "deactivate"} ${u.name}` });
}

async function resetPasswordFlow(id) {
  const u = userById(id);
  if (!u) return;
  const ok = await confirm({ title: `Reset password for ${u.name}?`, message: "A temporary password is generated. Their current password stops working immediately.", confirmLabel: "Reset password" });
  if (!ok) return;
  const pw = await run(() => services.resetUserPassword(ctx.user, id, tempPassword()), { error: "Couldn't reset the password" });
  if (!pw) return;
  const m = modal.open({
    title: "Temporary password",
    size: "sm",
    body: html`
      <p class="m-0 text-muted">Share this with ${u.name} (${u.email}). Ask them to change it after signing in.</p>
      <div class="temp-password"><code data-pw>${pw}</code><button type="button" class="btn btn-outline btn-sm" data-copy>${raw(icon("Copy", { size: 14 }))}Copy</button></div>`,
    footer: html`<button type="button" class="btn btn-primary" data-done>Done</button>`,
  });
  m.root.querySelector("[data-done]").addEventListener("click", m.close);
  m.root.querySelector("[data-copy]").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pw);
      toast("Password copied.", { type: "success" });
    } catch {
      toast("Couldn't copy — select the password and copy it manually.", { type: "warning" });
    }
  });
  toast(`Password reset for ${u.name}.`, { type: "success" });
}

function seatsLeft(b) {
  return Math.max(0, (b.capacity || 0) - store.count("enrollments", (e) => e.batchId === b.id && e.status === "active"));
}

async function enrolFlow(studentId) {
  const u = userById(studentId);
  if (!u) return;
  const mine = new Set(sel.studentEnrollments(studentId, { activeOnly: true }).map((e) => e.batchId));
  const batches = store.where("batches", (b) => b.status === "active" && !mine.has(b.id));
  if (!batches.length) return toast("There are no other active batches to enrol in.", { type: "info" });
  const data = await modal.form({
    title: `Enrol ${u.name}`,
    submitLabel: "Enrol",
    columns: 1,
    extraBodyHtml: html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Fee invoices are created automatically from the batch's fee structure, and the student is notified.</div></div>`,
    fields: [{ name: "batchId", label: "Batch", type: "select", required: true, placeholder: "Select a batch", options: batches.map((b) => [b.id, `${b.name} · ${centerName(b.centerId)} · ${seatsLeft(b)} seats left`]) }],
    validate: (d) => {
      const e = {};
      if (!d.batchId) e.batchId = "Choose a batch.";
      else if (!seatsLeft(store.byId("batches", d.batchId))) e.batchId = "This batch is full. Choose another or raise its capacity.";
      return e;
    },
  });
  if (!data) return;
  const b = store.byId("batches", data.batchId);
  await run(() => services.enrollStudent(ctx.user, { studentId, batchId: data.batchId }), {
    success: (enr) => `${u.name} enrolled in ${b.name}. ${enr.invoiceIds.length} ${enr.invoiceIds.length === 1 ? "invoice" : "invoices"} created.`,
    error: "Couldn't enrol the student",
  });
}

function exportCsv() {
  const rows = studentRows();
  if (!rows.length) return toast("There are no students to export.", { type: "info" });
  downloadCsv(`om-academy-students-${today()}.csv`, rows, [
    { key: "rollNo", label: "Roll no." },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { label: "Center code", value: (r) => store.byId("centers", r.centerId)?.code || "" },
    { key: "courseCodes", label: "Courses" },
    { label: "Admission date", value: (r) => r.admissionDate || "" },
    { key: "status", label: "Status" },
  ]);
  toast(`Exported ${rows.length} students.`, { type: "success" });
}

/* ---- CSV import ---- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  const s = String(text).replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

function validateCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: "The CSV is empty." };
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idx = { name: header.indexOf("name"), email: header.indexOf("email"), phone: header.indexOf("phone"), center: header.indexOf("centercode") };
  if (idx.name < 0 || idx.email < 0 || idx.phone < 0 || idx.center < 0) return { error: "The first row must be the header: name,email,phone,centerCode" };
  const centers = store.get("centers");
  const seen = new Set();
  const out = rows.slice(1).map((r, i) => {
    const rec = { line: i + 2, name: r[idx.name] || "", email: (r[idx.email] || "").toLowerCase(), phone: r[idx.phone] || "", centerCode: (r[idx.center] || "").toUpperCase() };
    const errs = [];
    if (!rec.name) errs.push("name missing");
    if (!EMAIL_RE.test(rec.email)) errs.push("invalid email");
    else if (emailTaken(rec.email)) errs.push("email already registered");
    else if (seen.has(rec.email)) errs.push("duplicate email in file");
    seen.add(rec.email);
    if (!phoneOk(rec.phone)) errs.push("phone must be 10 digits");
    const center = centers.find((c) => c.code === rec.centerCode);
    if (!center) errs.push(`unknown center "${rec.centerCode}"`);
    return { ...rec, centerId: center?.id, errors: errs };
  });
  if (!out.length) return { error: "The CSV has a header but no student rows." };
  return { rows: out };
}

function importFlow() {
  const codes = store.get("centers").map((c) => c.code).join(", ");
  const m = modal.open({
    title: "Import students from CSV",
    size: "lg",
    body: html`
      <div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">Columns: <strong>name,email,phone,centerCode</strong>. Center codes: ${codes}. Imported students get the default password <strong>student123</strong>.</div></div>
      <div class="form-grid form-grid-1">
        <div class="form-field"><label class="form-label" for="csv-file">Upload a .csv file</label><input type="file" id="csv-file" class="form-control" accept=".csv,text/csv" data-csv-file></div>
        <div class="form-field"><label class="form-label" for="csv-text">…or paste CSV</label><textarea id="csv-text" class="form-control" rows="6" data-csv-text placeholder="name,email,phone,centerCode&#10;Ritu Saini,ritu.saini@gmail.com,9812345678,HSR"></textarea><p class="field-error" data-csv-error hidden></p></div>
      </div>
      <div class="csv-preview" data-csv-preview></div>`,
    footer: html`
      <button type="button" class="btn btn-outline" data-csv-cancel>Cancel</button>
      <button type="button" class="btn btn-outline" data-csv-check>${raw(icon("ListChecks", { size: 16 }))}Preview</button>
      <button type="button" class="btn btn-primary" data-csv-import disabled>Import</button>`,
  });
  const ta = m.root.querySelector("[data-csv-text]");
  const errEl = m.root.querySelector("[data-csv-error]");
  const importBtn = m.root.querySelector("[data-csv-import]");
  let valid = [];
  const preview = () => {
    const res = validateCsv(ta.value);
    const box = m.root.querySelector("[data-csv-preview]");
    errEl.hidden = !res.error;
    errEl.textContent = res.error || "";
    valid = res.rows ? res.rows.filter((r) => !r.errors.length) : [];
    importBtn.disabled = !valid.length;
    importBtn.textContent = valid.length ? `Import ${valid.length} ${valid.length === 1 ? "student" : "students"}` : "Import";
    if (!res.rows) {
      box.innerHTML = "";
      return;
    }
    const bad = res.rows.length - valid.length;
    box.innerHTML = html`
      <div class="cluster-between section-gap"><h4 class="drawer-section-title m-0">Preview</h4><span class="text-sm"><span class="badge tone-green">${valid.length} ready</span> ${bad ? html`<span class="badge tone-rust">${bad} with errors (skipped)</span>` : raw("")}</span></div>
      <div class="table-scroll"><table class="simple-table">
        <thead><tr><th>Line</th><th>Name</th><th>Email</th><th>Phone</th><th>Center</th><th>Check</th></tr></thead>
        <tbody>${raw(res.rows.map((r) => html`<tr><td>${r.line}</td><td>${r.name}</td><td>${r.email}</td><td>${r.phone}</td><td>${r.centerCode}</td><td>${r.errors.length ? html`<span class="text-danger text-sm">${r.errors.join("; ")}</span>` : html`<span class="text-success">${raw(icon("CircleCheck", { size: 16 }))}</span>`}</td></tr>`).join(""))}</tbody>
      </table></div>`.toString();
  };
  m.root.querySelector("[data-csv-file]").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 512 * 1024) {
      errEl.hidden = false;
      errEl.textContent = "That file is too large (max 512 KB).";
      return;
    }
    ta.value = await f.text();
    preview();
  });
  m.root.querySelector("[data-csv-check]").addEventListener("click", preview);
  m.root.querySelector("[data-csv-cancel]").addEventListener("click", m.close);
  importBtn.addEventListener("click", async () => {
    preview();
    if (!valid.length) return;
    const rows = valid.map((r) => ({ name: r.name, email: r.email, phone: fmtPhone(r.phone), centerId: r.centerId }));
    const created = await run(() => services.importStudentsCsv(ctx.user, rows), { success: (list) => `Imported ${list.length} students.`, error: "Couldn't import the students" });
    if (created) m.close();
  });
}

/* ---------- profile drawers ---------- */

function openUser(id) {
  const u = userById(id);
  if (!u) return toast("That user couldn't be found.", { type: "warning" });
  if (u.role === "student") {
    if (!visibleStudents().some((s) => s.id === id)) return toast("That student isn't in your batches.", { type: "warning" });
    openStudent(id);
  } else if (ctx.can("staff.view")) openStaff(id);
}

function openStudent(id) {
  const u = userById(id);
  if (!u) return toast("That student no longer exists.", { type: "warning" });
  openPanel?.d.close();
  const d = drawer.open({ title: "Student profile", wide: true, body: "", footer: studentFooter(u) });
  openPanel = { kind: "student", id, d };
  setSearchParam("id", id);
  d.root.querySelector("[data-drawer-close]").addEventListener("click", clearPanel);
  d.root.addEventListener("mousedown", (e) => e.target === d.root && clearPanel());
  d.root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) return;
    const act = b.dataset.p;
    if (act === "edit") studentFormFlow(id);
    if (act === "enrol") enrolFlow(id);
    if (act === "reset") resetPasswordFlow(id);
    if (act === "deactivate") statusFlow(id, "inactive");
    if (act === "activate") statusFlow(id, "active");
  });
  repaintPanel();
}

function clearPanel() {
  openPanel = null;
  setSearchParam("id", null);
}

function studentFooter(u) {
  const canM = ctx.can("students.manage");
  return html`
    ${canM ? html`<button type="button" class="btn btn-outline" data-p="reset">${raw(icon("KeyRound", { size: 16 }))}Reset password</button>` : raw("")}
    ${canM ? (u.status === "active" ? html`<button type="button" class="btn btn-outline" data-p="deactivate">${raw(icon("UserX", { size: 16 }))}Deactivate</button>` : html`<button type="button" class="btn btn-outline" data-p="activate">${raw(icon("UserCheck", { size: 16 }))}Activate</button>`) : raw("")}
    ${canM ? html`<button type="button" class="btn btn-outline" data-p="edit">${raw(icon("Pencil", { size: 16 }))}Edit</button>` : raw("")}
    ${ctx.can("enrollments.manage") && u.status === "active" ? html`<button type="button" class="btn btn-primary" data-p="enrol">${raw(icon("BookOpen", { size: 16 }))}Enrol in batch</button>` : raw("")}`;
}

function repaintPanel() {
  const { kind, id, d } = openPanel;
  if (!d.root.isConnected) return (openPanel = null);
  const u = userById(id);
  if (!u) {
    d.body.innerHTML = emptyState({ icon: "UserX", title: "This user no longer exists" }).toString();
    return;
  }
  d.body.innerHTML = (kind === "student" ? studentProfileHtml(u) : staffProfileHtml(u)).toString();
  const footer = d.root.querySelector(".drawer-footer");
  if (footer) footer.innerHTML = (kind === "student" ? studentFooter(u) : staffFooter(u)).toString();
}

function studentProfileHtml(u) {
  const enrolments = sel.studentEnrollments(u.id).sort((a, b) => (b.enrolledAt || "").localeCompare(a.enrolledAt || ""));
  const fees = sel.feeSummary(u.id);
  const results = sel.examsForStudent(u.id, { publishedOnly: true }).map((ex) => ({ ex, m: sel.marksFor(ex.id, u.id) })).filter((r) => r.m);
  const gpa = sel.gpaFor(u.id);
  const paidPct = fees.total ? (fees.paid / fees.total) * 100 : 100;
  return html`
    <div class="profile-hero section-gap">
      ${raw(avatar({ name: u.name, size: "lg" }))}
      <div class="cell-user-text">
        <span class="profile-hero-name">${u.name}</span>
        <span class="cell-sub">${u.rollNo} · ${centerName(u.centerId)}</span>
      </div>
      ${raw(badge(u.status, u.status === "active" ? "Active" : "Inactive"))}
    </div>
    <div class="drawer-section">
      <h4 class="drawer-section-title">Details</h4>
      <dl class="kv-list">
        <dt>Email</dt><dd>${u.email}</dd>
        <dt>Mobile</dt><dd>${u.phone || "—"}</dd>
        <dt>Admission</dt><dd>${u.admissionDate ? date(u.admissionDate) : "—"}</dd>
        <dt>Date of birth</dt><dd>${u.dob ? date(u.dob) : "—"}</dd>
        <dt>Qualification</dt><dd>${u.qualification || "—"}</dd>
        <dt>Guardian</dt><dd>${u.guardianName || "—"}${u.guardianPhone ? " · " + u.guardianPhone : ""}</dd>
        <dt>Address</dt><dd>${u.address || "—"}</dd>
      </dl>
    </div>
    <div class="drawer-section">
      <h4 class="drawer-section-title">Enrolments &amp; attendance</h4>
      ${enrolments.length
        ? html`<div class="stack-sm">${raw(
            enrolments
              .map((e) => {
                const b = store.byId("batches", e.batchId);
                const st = sel.attendanceStats(u.id, e.batchId);
                const tone = st.pct >= 75 ? "green" : st.pct >= 60 ? "amber" : "rust";
                return html`<div class="file-tile enrol-tile">
                  <span class="icon-tile icon-tile-sm tone-${raw(store.byId("courses", e.courseId)?.tone || "blue")}">${raw(icon("BookOpen", { size: 16 }))}</span>
                  <div class="file-tile-main">
                    <div class="cluster-between"><div class="file-tile-name">${b?.name || "Removed batch"}</div>${raw(badge(e.status, e.status))}</div>
                    <div class="file-tile-meta">Enrolled ${date(e.enrolledAt)}${e.certificateNo ? " · Certificate " + e.certificateNo : ""}${e.dropReason ? " · " + e.dropReason : ""}</div>
                    ${st.total ? html`<div class="enrol-att"><div class="progress progress-sm tone-${raw(tone)}"><span class="progress-bar ${raw(pctClass(st.pct))}"></span></div><span class="text-sm fw-600">${pct(st.pct, 1)}</span><span class="text-xs text-muted">${st.present}/${st.total - st.excused} classes</span></div>` : html`<div class="text-xs text-muted">No attendance recorded yet.</div>`}
                  </div>
                </div>`;
              })
              .join("")
          )}</div>`
        : emptyState({ icon: "BookOpen", title: "Not enrolled yet", text: "Enrol the student in a batch to create their fee invoices." })}
    </div>
    ${ctx.can("fees.view") || ctx.can("students.manage")
      ? html`<div class="drawer-section">
          <h4 class="drawer-section-title">Fees</h4>
          ${fees.total
            ? html`<div class="grid grid-3 fee-mini">
                <div><div class="text-muted text-sm">Billed</div><div class="fw-700 text-title money">${money(fees.total)}</div></div>
                <div><div class="text-muted text-sm">Paid</div><div class="fw-700 text-success money">${money(fees.paid)}</div></div>
                <div><div class="text-muted text-sm">Balance</div><div class="fw-700 money ${raw(fees.overdue ? "text-danger" : "text-title")}">${money(fees.balance)}</div></div>
              </div>
              <div class="progress tone-green section-gap"><span class="progress-bar ${raw(pctClass(paidPct))}"></span></div>
              ${fees.overdue ? html`<div class="alert tone-rust">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">${money(fees.overdue)} is overdue.${ctx.can("fees.view") ? html` <a href="admin-fees.html?tab=invoices">Open invoices</a>` : raw("")}</div></div>` : raw("")}`
            : html`<p class="text-muted m-0">No invoices yet.</p>`}
        </div>`
      : raw("")}
    <div class="drawer-section">
      <h4 class="drawer-section-title">Published results${gpa != null ? html` · GPA ${gpa}` : raw("")}</h4>
      ${results.length
        ? html`<div class="table-scroll"><table class="simple-table"><thead><tr><th>Exam</th><th>Date</th><th class="text-right">Marks</th><th>Grade</th></tr></thead><tbody>${raw(
            results
              .map(({ ex, m }) => {
                const p = m.absent ? null : (m.marks / ex.maxMarks) * 100;
                return html`<tr><td>${ex.title}</td><td class="nowrap">${date(ex.date)}</td><td class="text-right tabular">${m.absent ? "Absent" : `${m.marks}/${ex.maxMarks}`}</td><td>${p == null ? html`<span class="badge tone-rust">AB</span>` : html`<span class="badge tone-${raw(p >= 35 ? "green" : "rust")}">${sel.gradeFor(p).grade}</span>`}</td></tr>`;
              })
              .join("")
          )}</tbody></table></div>`
        : html`<p class="text-muted m-0">No published results yet.</p>`}
    </div>`;
}

/* ---------- staff ---------- */

function openStaff(id) {
  const u = userById(id);
  if (!u) return toast("That account no longer exists.", { type: "warning" });
  openPanel?.d.close();
  const d = drawer.open({ title: "Staff details", body: "", footer: staffFooter(u) });
  openPanel = { kind: "staff", id, d };
  setSearchParam("id", id);
  d.root.querySelector("[data-drawer-close]").addEventListener("click", clearPanel);
  d.root.addEventListener("mousedown", (e) => e.target === d.root && clearPanel());
  d.root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) return;
    const act = b.dataset.p;
    if (act === "edit") staffFormFlow(id);
    if (act === "reset") resetPasswordFlow(id);
    if (act === "deactivate") statusFlow(id, "inactive");
    if (act === "activate") statusFlow(id, "active");
  });
  repaintPanel();
}

function staffFooter(u) {
  if (!ctx.can("staff.manage")) return "";
  return html`
    <button type="button" class="btn btn-outline" data-p="reset">${raw(icon("KeyRound", { size: 16 }))}Reset password</button>
    ${u.status === "active" ? html`<button type="button" class="btn btn-outline" data-p="deactivate">${raw(icon("UserX", { size: 16 }))}Deactivate</button>` : html`<button type="button" class="btn btn-outline" data-p="activate">${raw(icon("UserCheck", { size: 16 }))}Activate</button>`}
    <button type="button" class="btn btn-primary" data-p="edit">${raw(icon("Pencil", { size: 16 }))}Edit</button>`;
}

function staffProfileHtml(u) {
  const batches = sel.teacherBatches(u.id);
  return html`
    <div class="profile-hero section-gap">
      ${raw(avatar({ name: u.name, size: "lg" }))}
      <div class="cell-user-text"><span class="profile-hero-name">${u.name}</span><span class="cell-sub">${roleName(u.role)} · ${u.designation || "—"}</span></div>
      ${raw(badge(u.status, u.status === "active" ? "Active" : "Inactive"))}
    </div>
    <div class="drawer-section">
      <dl class="kv-list">
        <dt>Email</dt><dd>${u.email}</dd>
        <dt>Mobile</dt><dd>${u.phone || "—"}</dd>
        <dt>Center</dt><dd>${centerName(u.centerId)}</dd>
        <dt>Department</dt><dd>${u.department || "—"}</dd>
        <dt>Joined</dt><dd>${u.joinDate ? date(u.joinDate) : "—"}</dd>
        <dt>Specialisations</dt><dd>${(u.specializations || []).length ? u.specializations.join(", ") : "—"}</dd>
      </dl>
    </div>
    ${u.role === "teacher" || batches.length
      ? html`<div class="drawer-section"><h4 class="drawer-section-title">Assigned batches</h4>${batches.length ? html`<ul class="list-plain card">${raw(batches.map((b) => html`<li class="list-row"><div class="list-row-main"><div class="list-row-title">${b.name}</div><div class="list-row-sub">${b.code} · ${centerName(b.centerId)}</div></div>${raw(badge(b.status, b.status))}</li>`).join(""))}</ul>` : html`<p class="text-muted m-0">No batches assigned.</p>`}</div>`
      : raw("")}`;
}

async function staffFormFlow(id) {
  const u = id ? userById(id) : null;
  if (id && !u) return toast("That account no longer exists.", { type: "warning" });
  const roles = store.where("roles", (r) => r.portal === "staff");
  const data = await modal.form({
    title: u ? `Edit ${u.name}` : "Add staff member",
    submitLabel: u ? "Save changes" : "Add staff",
    size: "lg",
    fields: [
      { name: "name", label: "Full name", required: true, span: 2 },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Mobile (10 digits)", type: "tel", required: true },
      { name: "role", label: "Role", type: "select", required: true, options: roles.map((r) => [r.id, r.name]) },
      { name: "centerId", label: "Center", type: "select", required: true, options: store.get("centers").map((c) => [c.id, c.name]) },
      { name: "designation", label: "Designation", required: true, placeholder: "e.g. Faculty" },
      { name: "department", label: "Department", placeholder: "e.g. Academics" },
      { name: "joinDate", label: "Joining date", type: "date" },
      { name: "specializations", label: "Specialisations (course codes)", placeholder: "e.g. CCC, TALLY", help: "Comma-separated." },
    ],
    values: u ? { ...u, phone: normPhone(u.phone), specializations: (u.specializations || []).join(", ") } : { role: "teacher", centerId: ctx.user.centerId, joinDate: today(), department: "Academics", designation: "Faculty" },
    validate: (d) => {
      const e = {};
      if (!d.name.trim()) e.name = "Enter a name.";
      if (!EMAIL_RE.test(d.email.trim())) e.email = "Enter a valid email address.";
      else if (emailTaken(d.email, id)) e.email = "Another account already uses this email.";
      if (!phoneOk(d.phone)) e.phone = "Enter a 10-digit mobile number.";
      if (!d.role) e.role = "Choose a role.";
      if (!d.designation.trim()) e.designation = "Enter a designation.";
      if (u && u.role === "admin" && d.role !== "admin" && u.status === "active" && !store.count("users", (x) => x.role === "admin" && x.status === "active" && x.id !== u.id)) e.role = "At least one administrator must stay active.";
      if (u && u.id === ctx.user.id && d.role !== u.role) e.role = "You can't change your own role.";
      return e;
    },
  });
  if (!data) return;
  const patch = {
    name: data.name.trim(), email: data.email.trim().toLowerCase(), phone: fmtPhone(data.phone), role: data.role, centerId: data.centerId,
    designation: data.designation.trim(), department: data.department.trim(), joinDate: data.joinDate || today(),
    specializations: data.specializations.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  };
  if (u) await run(() => services.updateStaff(ctx.user, id, patch), { success: `${patch.name} updated.`, error: "Couldn't save the staff member" });
  else await run(() => services.createStaff(ctx.user, patch), { success: (r) => `${r.name} added as ${roleName(r.role)}. Default password: staff123`, error: "Couldn't add the staff member" });
}

/* ---------- roles & permissions ---------- */

function staffRoles() {
  return store.where("roles", (r) => r.portal === "staff");
}

function draftFor(roleId) {
  if (!roleDrafts.has(roleId)) roleDrafts.set(roleId, new Set(store.byId("roles", roleId)?.permissions || []));
  return roleDrafts.get(roleId);
}

function permsOf(role) {
  return roleDrafts.get(role.id) || new Set(role.permissions || []);
}

function isDirty(role) {
  const d = roleDrafts.get(role.id);
  if (!d) return false;
  const orig = new Set(role.permissions || []);
  return d.size !== orig.size || [...d].some((p) => !orig.has(p));
}

const has = (role, set, perm) => role.permissions?.includes("*") || set.has("*") || set.has(perm) || set.has(perm.split(".")[0] + ".*");

function renderRoles() {
  const box = qs("[data-roles]", ctx.root);
  if (!box) return;
  const roles = staffRoles();
  const users = store.get("users");
  const cards = roles
    .map((r) => {
      const count = users.filter((u) => u.role === r.id).length;
      const demos = DEMO_ACCOUNTS.filter((a) => a.role === r.id);
      return html`<div class="role-card">
        <div class="cluster-between"><h3 class="card-title">${r.name}</h3>${r.locked ? html`<span class="badge tone-slate">${raw(icon("Lock", { size: 12 }))}Locked</span>` : r.system ? html`<span class="badge tone-blue">System</span>` : html`<span class="badge tone-purple">Custom</span>`}</div>
        <p class="text-sm text-muted role-card-desc">${r.description || "No description."}</p>
        <div class="cluster text-sm">
          <span class="chip">${raw(icon("Users", { size: 12 }))}${count} ${count === 1 ? "user" : "users"}</span>
          <span class="chip">${raw(icon("Target", { size: 12 }))}${r.scope === "assigned" ? "Assigned batches" : "All records"}</span>
        </div>
        ${demos.length ? html`<p class="text-xs text-muted role-card-demo">Demo account: ${demos.map((a) => a.email).join(", ")}</p>` : raw("")}
      </div>`;
    })
    .join("");

  const head = html`<tr><th>Permission</th>${raw(roles.map((r) => html`<th><span class="perm-role-head">${r.name}${isDirty(r) ? html`<span class="dot tone-amber" title="Unsaved changes"></span>` : raw("")}</span></th>`).join(""))}</tr>`;
  const body = PERMISSION_GROUPS.map((g) => {
    const moduleRow = html`<tr class="perm-module"><td>${g.module}</td>${raw(
      roles
        .map((r) => {
          const set = permsOf(r);
          const n = g.perms.filter(([p]) => has(r, set, p)).length;
          return html`<td><label class="perm-all"><input type="checkbox" data-module-cb="${g.module}" data-role="${r.id}" ${raw(n === g.perms.length ? "checked" : "")} ${raw(n > 0 && n < g.perms.length ? "data-indeterminate" : "")} ${raw(r.locked ? "disabled" : "")} aria-label="${g.module}: all for ${r.name}"><span class="text-xs">All</span></label></td>`;
        })
        .join("")
    )}</tr>`;
    const permRows = g.perms
      .map(
        ([p, label]) => html`<tr><td><span class="perm-label">${label}</span><span class="text-xs text-muted perm-key">${p}</span></td>${raw(
          roles.map((r) => html`<td><input type="checkbox" data-perm-cb="${p}" data-role="${r.id}" ${raw(has(r, permsOf(r), p) ? "checked" : "")} ${raw(r.locked ? "disabled" : "")} aria-label="${label} for ${r.name}"></td>`).join("")
        )}</tr>`
      )
      .join("");
    return moduleRow + permRows;
  }).join("");
  const foot = html`<tr class="perm-foot"><td></td>${raw(
    roles
      .map((r) =>
        r.locked
          ? html`<td><span class="text-xs text-muted">Read-only</span></td>`
          : html`<td><div class="perm-actions"><button type="button" class="btn btn-primary btn-sm" data-save-role="${r.id}" ${raw(isDirty(r) ? "" : "disabled")}>${raw(icon("Save", { size: 14 }))}Save</button>${isDirty(r) ? html`<button type="button" class="link-btn text-xs" data-reset-role="${r.id}">Discard</button>` : raw("")}</div></td>`
      )
      .join("")
  )}</tr>`;

  box.innerHTML = html`
    <div class="role-cards section-gap">${raw(cards)}</div>
    <div class="alert tone-amber section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">The Administrator role always has every permission and can't be edited. Changes to a role apply the next time its users load a page. Checks run in the browser — this is a demo of role-based access, not a security boundary.</div></div>
    <div class="table-scroll perm-scroll"><table class="simple-table perm-matrix"><thead>${head}</thead><tbody>${raw(body)}${foot}</tbody></table></div>`.toString();
  qsa("[data-indeterminate]", box).forEach((cb) => (cb.indeterminate = true));
}

async function saveRoleFlow(roleId) {
  const role = store.byId("roles", roleId);
  const set = roleDrafts.get(roleId);
  if (!role || !set) return;
  const ok = await run(() => services.saveRole(ctx.user, roleId, { permissions: [...set] }), { success: `${role.name} permissions saved.`, error: "Couldn't save the role" });
  if (ok) {
    roleDrafts.delete(roleId);
    renderRoles();
  }
}

async function newRoleFlow() {
  const data = await modal.form({
    title: "New role",
    submitLabel: "Create role",
    fields: [
      { name: "name", label: "Role name", required: true, placeholder: "e.g. Front office" },
      { name: "id", label: "Role id (slug)", required: true, placeholder: "e.g. front-office", help: "Lowercase letters, numbers and hyphens." },
      { name: "scope", label: "Data scope", type: "select", required: true, options: [["all", "All records"], ["assigned", "Assigned batches only"]] },
      { name: "copyFrom", label: "Start with permissions of", type: "select", placeholder: "No permissions", options: staffRoles().filter((r) => !r.locked).map((r) => [r.id, r.name]) },
      { name: "description", label: "Description", type: "textarea", rows: 2, span: 2 },
    ],
    values: { scope: "all" },
    validate: (d) => {
      const e = {};
      if (!d.name.trim()) e.name = "Enter a name.";
      else if (store.get("roles").some((r) => r.name.toLowerCase() === d.name.trim().toLowerCase())) e.name = "A role with this name already exists.";
      if (!/^[a-z][a-z0-9-]{1,30}$/.test(d.id.trim())) e.id = "Use 2–31 lowercase letters, numbers or hyphens, starting with a letter.";
      else if (store.byId("roles", d.id.trim())) e.id = "This id is already used.";
      return e;
    },
  });
  if (!data) return;
  const base = data.copyFrom ? store.byId("roles", data.copyFrom)?.permissions || [] : [];
  await run(() => services.saveRole(ctx.user, data.id.trim(), { name: data.name.trim(), description: data.description.trim(), scope: data.scope, permissions: [...base] }), { success: (r) => `Role "${r.name}" created. Tick its permissions below, then Save.`, error: "Couldn't create the role" });
}

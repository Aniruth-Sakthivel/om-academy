/*
Author       : OM Academy
Description  : Student → Profile & Settings. Profile card with photo upload, personal details (phone, address and
               guardian phone editable), change password, notification preferences and theme.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, qsa, toast, modal, avatar, emptyState, tabs, setSearchParam, getSearchParam, showErrors, serialize } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { date, titleCase } from "../core/format.js";
import { run, friendlyMessage } from "../core/errors.js";
import * as files from "../core/files.js";

const TABS = ["details", "security", "preferences"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PHOTO_MAX_MB = 5;
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,15}$/;

// Notification types a student receives (key → label, description, icon)
const NOTIFY_TYPES = [
  ["assignment", "Assignments", "New assignments and deadline reminders", "ClipboardList"],
  ["grade", "Grades", "When a submission is graded", "Award"],
  ["exam", "Exams", "Exam schedules and admit cards", "GraduationCap"],
  ["result", "Results & transcripts", "Published results and issued transcripts", "FileBadge"],
  ["fee", "Fees", "Invoices, payment receipts and reminders", "Wallet"],
  ["leave", "Leave", "Decisions on your leave requests", "CalendarX"],
  ["message", "Messages", "Replies from instructors and offices", "MessageSquare"],
  ["forum", "Forum", "Replies to your forum threads", "MessagesSquare"],
  ["resource", "Resources", "New study material for your courses", "FolderOpen"],
];

let ctx;

boot({
  id: "student-profile",
  portal: "student",
  watch: ["users", "files", "enrollments", "batches", "courses", "centers"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    window.addEventListener("om-portal:theme", paintTheme);
  },
  update: () => refresh(),
  unmount() {
    window.removeEventListener("om-portal:theme", paintTheme);
  },
});

/* ---------- data ---------- */

const me = () => store.byId("users", ctx.user.id) || ctx.user;
const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

function photoHtml(u, size = "xl") {
  if (u.avatarFileId && store.byId("files", u.avatarFileId)) return html`<span class="avatar avatar-${raw(size)}"><img data-file-src="${u.avatarFileId}" alt="${u.name}"></span>`;
  return avatar({ name: u.name, size });
}

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "details";
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Profile &amp; Settings</li></ol>
        <h1 class="page-title">Profile &amp; Settings</h1>
        <p class="page-subtitle">Your details, password and portal preferences.</p>
      </div>
    </div>
    <div class="grid grid-side-main profile-layout">
      <div class="card profile-card" data-profile-card></div>
      <div class="card">
        <div class="tabs" data-tab-list role="tablist">
          <button type="button" class="tab" role="tab" data-tab="details">${raw(icon("UserRound", { size: 15 }))}Personal details</button>
          <button type="button" class="tab" role="tab" data-tab="security">${raw(icon("ShieldCheck", { size: 15 }))}Security</button>
          <button type="button" class="tab" role="tab" data-tab="preferences">${raw(icon("SlidersHorizontal", { size: 15 }))}Preferences</button>
        </div>
        <div data-tab-panel="details"><div class="card-body" data-details></div></div>
        <div data-tab-panel="security" hidden>
          <div class="card-body">
            <h2 class="card-title">Change password</h2>
            <p class="card-subtitle section-gap">Use at least 6 characters. You'll use the new password the next time you sign in.</p>
            <form class="stack profile-password" data-password-form novalidate>
              <div class="form-field">
                <label class="form-label" for="pw-current">Current password <span class="req">*</span></label>
                <input id="pw-current" class="form-control" type="password" name="current" autocomplete="current-password">
                <p class="field-error" data-error-for="current" hidden></p>
              </div>
              <div class="form-field">
                <label class="form-label" for="pw-next">New password <span class="req">*</span></label>
                <input id="pw-next" class="form-control" type="password" name="next" autocomplete="new-password">
                <p class="field-help">At least 6 characters, different from your current password.</p>
                <p class="field-error" data-error-for="next" hidden></p>
              </div>
              <div class="form-field">
                <label class="form-label" for="pw-confirm">Confirm new password <span class="req">*</span></label>
                <input id="pw-confirm" class="form-control" type="password" name="confirm" autocomplete="new-password">
                <p class="field-error" data-error-for="confirm" hidden></p>
              </div>
              <label class="check-label"><input type="checkbox" data-show-pw> Show passwords</label>
              <div class="form-actions profile-form-actions"><button type="submit" class="btn btn-primary">${raw(icon("KeyRound", { size: 16 }))}Update password</button></div>
            </form>
          </div>
        </div>
        <div data-tab-panel="preferences" hidden>
          <div class="card-body stack-lg">
            <section>
              <h2 class="card-title">Appearance</h2>
              <p class="card-subtitle section-gap">Choose how the portal looks on this device and in your account.</p>
              <div class="theme-options" role="radiogroup" aria-label="Theme" data-theme-options>
                <button type="button" class="theme-option" role="radio" data-theme-pick="light"><span class="icon-tile icon-tile-sm tone-amber">${raw(icon("Sun", { size: 16 }))}</span><span><span class="theme-option-name">Light</span><span class="theme-option-hint">Bright surfaces, best in daylight</span></span></button>
                <button type="button" class="theme-option" role="radio" data-theme-pick="dark"><span class="icon-tile icon-tile-sm tone-navy">${raw(icon("Moon", { size: 16 }))}</span><span><span class="theme-option-name">Dark</span><span class="theme-option-hint">Easier on the eyes at night</span></span></button>
              </div>
            </section>
            <section>
              <h2 class="card-title">Notifications</h2>
              <p class="card-subtitle section-gap">Pick which updates appear in your notification feed and which are also emailed to you.</p>
              <div class="pref-table" data-prefs></div>
            </section>
          </div>
        </div>
      </div>
    </div>`;
  tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });
}

function refresh() {
  const u = me();
  const enrollments = sel.studentEnrollments(u.id, { activeOnly: true });
  const center = store.byId("centers", u.centerId);
  const courses = enrollments.map((e) => ({ course: store.byId("courses", e.courseId), batch: store.byId("batches", e.batchId) })).filter((x) => x.course);

  qs("[data-profile-card]", ctx.root).innerHTML = html`
    <div class="card-body profile-card-body">
      <div class="profile-photo">
        ${photoHtml(u)}
        <label class="profile-photo-btn" aria-label="Change profile photo" title="Change photo">${raw(icon("Upload", { size: 15 }))}<input type="file" accept="${PHOTO_TYPES.join(",")}" class="visually-hidden-input" data-photo></label>
      </div>
      <h2 class="profile-name-lg">${u.name}</h2>
      <p class="text-muted m-0">${u.rollNo || "—"}</p>
      <span class="badge tone-${raw(u.status === "active" ? "green" : "rust")}">${u.status === "active" ? "Active student" : titleCase(u.status)}</span>
      <p class="field-error" data-photo-error hidden></p>
    </div>
    <div class="card-body profile-card-meta">
      <dl class="kv-list">
        <dt>Center</dt><dd>${center?.name || "—"}</dd>
        <dt>Admission</dt><dd>${date(u.admissionDate)}</dd>
        <dt>Email</dt><dd>${u.email ? u.email.split("@").map((part) => html`${part}`).reduce((a, b) => html`${a}${raw("<wbr>@")}${b}`) : "—"}</dd>
      </dl>
    </div>
    <div class="card-body profile-card-meta">
      <h3 class="drawer-section-title">Enrolled courses</h3>
      ${courses.length
        ? html`<ul class="list-plain stack-sm">${courses.map(({ course, batch }) => html`<li class="cell-user"><span class="icon-tile icon-tile-sm tone-${raw(course.tone || "blue")}">${raw(icon("BookOpen", { size: 15 }))}</span><div class="cell-user-text"><span class="cell-title">${course.title}</span><span class="cell-sub">${batch?.name || ""}</span></div></li>`)}</ul>`
        : emptyState({ icon: "BookOpen", title: "No active courses", text: "Your courses appear here after enrolment." })}
    </div>`;
  files.hydrateImages(qs("[data-profile-card]", ctx.root));

  qs("[data-details]", ctx.root).innerHTML = html`
    <div class="cluster-between section-gap">
      <div><h2 class="card-title">Personal details</h2><p class="card-subtitle">Contact the Admin office to correct your name, date of birth or other official details.</p></div>
      <button type="button" class="btn btn-outline btn-sm" data-act="edit">${raw(icon("Pencil", { size: 15 }))}Edit contact details</button>
    </div>
    <div class="grid grid-2">
      <div class="profile-section">
        <h3 class="drawer-section-title">Official record</h3>
        <dl class="kv-list">
          <dt>Full name</dt><dd>${u.name}</dd>
          <dt>Roll number</dt><dd>${u.rollNo || "—"}</dd>
          <dt>Date of birth</dt><dd>${date(u.dob)}</dd>
          <dt>Gender</dt><dd>${u.gender === "F" ? "Female" : u.gender === "M" ? "Male" : "—"}</dd>
          <dt>Qualification</dt><dd>${u.qualification || "—"}</dd>
          <dt>Guardian</dt><dd>${u.guardianName || "—"}</dd>
        </dl>
      </div>
      <div class="profile-section">
        <h3 class="drawer-section-title">Contact <span class="badge tone-blue">Editable</span></h3>
        <dl class="kv-list">
          <dt>Phone</dt><dd>${u.phone || "—"}</dd>
          <dt>Guardian phone</dt><dd>${u.guardianPhone || "—"}</dd>
          <dt>Address</dt><dd>${u.address || "—"}</dd>
          <dt>Email</dt><dd>${u.email ? u.email.split("@").map((part) => html`${part}`).reduce((a, b) => html`${a}${raw("<wbr>@")}${b}`) : "—"}</dd>
        </dl>
      </div>
    </div>`;

  const notify = u.prefs?.notify || {};
  qs("[data-prefs]", ctx.root).innerHTML = html`
    <div class="pref-row pref-head"><span>Type</span><span>In portal</span><span>Email</span></div>
    ${NOTIFY_TYPES.map(([key, label, desc, ico]) => {
      const p = notify[key] || {};
      const inApp = p.inApp !== false;
      const email = !!p.email;
      return html`<div class="pref-row">
        <span class="cell-user"><span class="icon-tile icon-tile-sm tone-slate">${raw(icon(ico, { size: 15 }))}</span><span class="cell-user-text"><span class="cell-title">${label}</span><span class="cell-sub">${desc}</span></span></span>
        <label class="pref-toggle"><span class="pref-toggle-label">In portal</span><input type="checkbox" class="toggle" data-pref="${key}" data-channel="inApp" ${raw(inApp ? "checked" : "")} aria-label="${label} in portal"></label>
        <label class="pref-toggle"><span class="pref-toggle-label">Email</span><input type="checkbox" class="toggle" data-pref="${key}" data-channel="email" ${raw(email ? "checked" : "")} aria-label="${label} by email"></label>
      </div>`;
    })}`;
  paintTheme();
}

function paintTheme() {
  const t = currentTheme();
  qsa("[data-theme-pick]", ctx.root).forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.themePick === t));
    b.classList.toggle("is-active", b.dataset.themePick === t);
  });
}

/* ---------- actions ---------- */

async function editDetails() {
  const u = me();
  const data = await modal.form({
    title: "Edit contact details",
    submitLabel: "Save changes",
    values: { phone: u.phone || "", guardianPhone: u.guardianPhone || "", address: u.address || "" },
    fields: [
      { name: "phone", label: "Phone", type: "tel", required: true, placeholder: "+91 98xxxxxxxx", autocomplete: "tel" },
      { name: "guardianPhone", label: "Guardian phone", type: "tel", placeholder: "+91 98xxxxxxxx" },
      { name: "address", label: "Address", type: "textarea", rows: 3, required: true, span: 2 },
    ],
    validate: (d) => {
      const errors = {};
      if (!PHONE_RE.test(d.phone.trim())) errors.phone = "Enter a valid phone number (10 digits, optional +91).";
      if (d.guardianPhone.trim() && !PHONE_RE.test(d.guardianPhone.trim())) errors.guardianPhone = "Enter a valid phone number, or leave it blank.";
      if (d.address.trim().length < 8) errors.address = "Enter your full address.";
      else if (d.address.trim().length > 300) errors.address = "Keep the address under 300 characters.";
      return errors;
    },
  });
  if (!data) return;
  run(() => services.updateProfile(ctx.user, { phone: data.phone.trim(), guardianPhone: data.guardianPhone.trim(), address: data.address.trim() }), { success: "Contact details updated.", error: "Couldn't save your details" });
}

async function uploadPhoto(input) {
  const file = input.files[0];
  input.value = "";
  const err = qs("[data-photo-error]", ctx.root);
  const fail = (msg) => {
    err.hidden = false;
    err.textContent = msg;
  };
  err.hidden = true;
  if (!file) return;
  if (!PHOTO_TYPES.includes(file.type)) return fail("Choose a JPG, PNG, WebP or GIF image.");
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return fail(`The photo must be ${PHOTO_MAX_MB} MB or smaller.`);
  await run(() => services.uploadProfilePhoto(ctx.user, file), { success: "Profile photo updated.", error: "Couldn't update your photo" });
}

async function changePassword(form) {
  const d = serialize(form);
  const errors = {};
  if (!d.current) errors.current = "Enter your current password.";
  if (!d.next) errors.next = "Enter a new password.";
  else if (d.next.length < 6) errors.next = "The new password must be at least 6 characters.";
  else if (d.next === d.current) errors.next = "Choose a password different from your current one.";
  if (!d.confirm) errors.confirm = "Re-enter the new password.";
  else if (d.next && d.confirm !== d.next) errors.confirm = "The passwords don't match.";
  if (!showErrors(form, errors)) return;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await services.changePassword(ctx.user, d.current, d.next);
    form.reset();
    toast("Password updated. Use it the next time you sign in.", { type: "success" });
  } catch (e) {
    const msg = friendlyMessage(e);
    if (/current password/i.test(msg)) showErrors(form, { current: msg });
    else if (/at least 6/i.test(msg)) showErrors(form, { next: msg });
    else toast("Couldn't change your password: " + msg, { type: "danger", duration: 6000 });
  } finally {
    btn.disabled = false;
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("om-portal:theme", theme);
  } catch {
    /* storage unavailable — the theme still applies for this page */
  }
  window.dispatchEvent(new CustomEvent("om-portal:theme", { detail: theme }));
  run(() => services.setTheme(me(), theme), { success: `${theme === "dark" ? "Dark" : "Light"} theme saved.`, error: "Couldn't save your theme" });
}

function wire() {
  on(ctx.root, "click", '[data-act="edit"]', editDetails);
  on(ctx.root, "change", "[data-photo]", (e, input) => uploadPhoto(input));
  on(ctx.root, "click", "[data-theme-pick]", (e, btn) => {
    if (btn.dataset.themePick !== currentTheme() || me().prefs?.theme !== btn.dataset.themePick) setTheme(btn.dataset.themePick);
  });
  on(ctx.root, "change", "[data-pref]", (e, input) => {
    const u = me();
    const key = input.dataset.pref;
    const next = { ...(u.prefs?.notify || {}), [key]: { inApp: true, ...(u.prefs?.notify?.[key] || {}), [input.dataset.channel]: input.checked } };
    const label = NOTIFY_TYPES.find(([k]) => k === key)?.[1] || key;
    run(() => services.updatePreferences(ctx.user, { notify: next }), { success: `${label} preference saved.`, error: "Couldn't save your preference" }).then((res) => {
      if (!res) input.checked = !input.checked;
    });
  });
  const form = qs("[data-password-form]", ctx.root);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    changePassword(form);
  });
  on(form, "change", "[data-show-pw]", (e, cb) => qsa('input[name="current"], input[name="next"], input[name="confirm"]', form).forEach((i) => (i.type = cb.checked ? "text" : "password")));
}

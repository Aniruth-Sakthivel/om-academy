/*
Author       : OM Academy
Description  : Portal sign-in. Not a shell page (there's no user yet): seeds the store on first run, then renders
               the sign-in form, one-click demo accounts, a demo "forgot password" and "Reset demo data".
               Signing in fills only that role's session slot, so a student and a staff member can be signed in
               side by side in two tabs.
*/

import * as store from "../core/store.js";
import * as auth from "../core/auth.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, confirm, modal } from "../core/ui.js";
import { icon } from "../core/icons.js";

const params = new URLSearchParams(location.search);

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("om-portal:theme", theme);
  } catch {
    /* storage unavailable: theme lasts for this page only */
  }
}

// Only same-site portal page names, and only for the portal the user belongs to (no open redirects).
function safeNext(user) {
  const next = params.get("next");
  if (!next) return null;
  const file = next.split("?")[0];
  if (!/^[a-z-]+\.html$/.test(file)) return null;
  if (user.role === "student" && file.startsWith("student-")) return next;
  if (user.role !== "student" && file.startsWith("admin-")) return next;
  return null;
}

const POINTS = [
  ["BookOpen", "Courses, class schedule and study resources"],
  ["ClipboardList", "Assignments, exams, results and progress reports"],
  ["Wallet", "Fee invoices, online payments and receipts"],
  ["ShieldCheck", "Role-based access for students, teachers and accounts"],
];

function demoAccountButton(account) {
  return html`
    <button type="button" class="demo-account" data-demo="${account.email}">
      <span class="icon-tile icon-tile-sm tone-${raw(account.role === "student" ? "blue" : account.role === "admin" ? "navy" : account.role === "teacher" ? "green" : "amber")}">
        ${raw(icon(account.role === "student" ? "GraduationCap" : account.role === "admin" ? "ShieldCheck" : account.role === "teacher" ? "School" : "Receipt", { size: 16 }))}
      </span>
      <span class="demo-account-text">
        <span class="demo-account-role">${account.label}</span>
        <span class="demo-account-hint">${account.hint}</span>
      </span>
    </button>`;
}

function signedInBanner() {
  const student = auth.currentUser("student");
  const staff = auth.currentUser("admin");
  const list = [student && { user: student, href: "student-dashboard.html" }, staff && { user: staff, href: "admin-dashboard.html" }].filter(Boolean);
  if (!list.length) return "";
  return html`
    <div class="alert tone-blue section-gap">
      ${raw(icon("Info", { size: 18 }))}
      <div class="alert-body">
        ${raw(list.map(({ user, href }) => html`<div>Signed in as <strong>${user.name}</strong> — <a href="${href}">continue</a></div>`).join(""))}
      </div>
    </div>`;
}

function render(portal) {
  const accounts = auth.DEMO_ACCOUNTS.filter((a) => (portal === "student" ? a.role === "student" : a.role !== "student"));
  const reason = params.get("msg");

  document.body.innerHTML = html`
    <a href="#login-form" class="skip-link">Skip to sign in</a>
    <div class="login-page">
      <aside class="login-aside">
        <a class="login-brand" href="index.html">
          <span class="brand-mark">OM</span>
          <span><span class="login-brand-name">OM Academy</span><span class="login-brand-tag">LEARN · GROW · SUCCEED</span></span>
        </a>
        <div class="login-hero">
          <h1 class="login-hero-title">Your academy, <span>one sign-in away.</span></h1>
          <p class="login-hero-text">Students track classes, assignments, attendance and fees. Staff manage courses, academics, payments and communication — all in one portal.</p>
          <ul class="login-points">
            ${raw(POINTS.map(([ic, text]) => html`<li><span class="login-point-ico">${raw(icon(ic, { size: 16 }))}</span>${text}</li>`).join(""))}
          </ul>
        </div>
        <!-- Curved right edge with a green stroke; the fill matches the form side and clips the photo -->
        <svg class="login-curve" aria-hidden="true" viewBox="0 0 48 1000" preserveAspectRatio="none">
          <path class="login-curve-fill" d="M14,0 C34,260 50,430 46,540 C43,720 36,860 30,1000 L49,1000 L49,0 Z"/>
          <path class="login-curve-line" d="M14,0 C34,260 50,430 46,540 C43,720 36,860 30,1000" stroke-width="3" vector-effect="non-scaling-stroke"/>
        </svg>
      </aside>

      <main class="login-main">
        <div class="login-theme">
          <button type="button" class="topbar-icon-btn" data-theme-toggle aria-label="Toggle dark mode">${raw(icon("Moon", { size: 18, cls: "icon-moon" }))}${raw(icon("Sun", { size: 18, cls: "icon-sun" }))}</button>
        </div>
        <div class="login-card">
          <a class="login-back" href="index.html">${raw(icon("ArrowLeft", { size: 14 }))}Back to website</a>
          <h2 class="login-title">Welcome back</h2>
          <p class="login-sub">Sign in to the ${portal === "student" ? "Student" : "Staff"} Portal.</p>

          ${raw(signedInBanner())}
          ${reason === "deactivated" ? html`<div class="alert tone-rust section-gap">${raw(icon("TriangleAlert", { size: 18 }))}<div class="alert-body">That account has been deactivated. Please contact the academy office.</div></div>` : raw("")}

          <div class="portal-switch" role="tablist" aria-label="Portal">
            <button type="button" role="tab" aria-selected="${portal === "student"}" data-portal="student">${raw(icon("GraduationCap", { size: 16 }))}Student</button>
            <button type="button" role="tab" aria-selected="${portal !== "student"}" data-portal="admin">${raw(icon("ShieldCheck", { size: 16 }))}Staff</button>
          </div>

          <form class="login-form" id="login-form" data-login-form novalidate>
            <div class="form-field">
              <label class="form-label" for="login-email">Email</label>
              <div class="input-icon">${raw(icon("Mail", { size: 16 }))}<input id="login-email" class="form-control" type="email" name="email" autocomplete="username" placeholder="you@example.com" required></div>
            </div>
            <div class="form-field">
              <label class="form-label" for="login-password">Password</label>
              <div class="password-field input-icon">
                ${raw(icon("Lock", { size: 16 }))}
                <input id="login-password" class="form-control" type="password" name="password" autocomplete="current-password" placeholder="Your password" required>
                <button type="button" class="btn btn-ghost btn-icon btn-sm password-toggle" data-toggle-password aria-label="Show password">${raw(icon("Eye", { size: 16 }))}</button>
              </div>
            </div>
            <div class="login-row">
              <label class="check-label"><input type="checkbox" name="remember" checked> Keep me signed in</label>
              <button type="button" class="link-btn" data-forgot>Forgot password?</button>
            </div>
            <div class="alert tone-rust" data-login-error hidden>${raw(icon("CircleAlert", { size: 18 }))}<div class="alert-body" data-login-error-text></div></div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" data-login-submit>${raw(icon("LogIn", { size: 17 }))}Sign in</button>
          </form>

          <div class="demo-accounts-title">Demo accounts</div>
          <div class="demo-accounts ${raw(accounts.length === 1 ? "demo-accounts-single" : "")}">
            ${raw(accounts.map(demoAccountButton).join(""))}
          </div>

          <div class="login-foot">
            <span>Demo data lives in this browser only.</span>
            <button type="button" class="link-btn" data-reset-demo>${raw(icon("RotateCcw", { size: 13 }))} Reset demo data</button>
          </div>
        </div>
      </main>
    </div>`;

  qs("#login-email").focus();
}

function showError(message) {
  const box = qs("[data-login-error]");
  qs("[data-login-error-text]").textContent = message;
  box.hidden = false;
}

function signIn(email, password) {
  try {
    const user = auth.verifyCredentials(email, password);
    auth.startSession(user);
    const btn = qs("[data-login-submit]");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>Signing in…`;
    }
    window.location.href = safeNext(user) || auth.dashboardFor(user);
  } catch (err) {
    showError(err.message);
  }
}

function wire() {
  on(document, "click", "[data-portal]", (e, btn) => {
    const portal = btn.dataset.portal;
    const url = new URL(location.href);
    url.searchParams.set("portal", portal);
    history.replaceState(null, "", url);
    render(portal);
  });

  on(document, "submit", "[data-login-form]", (e, form) => {
    e.preventDefault();
    const email = form.elements.namedItem("email").value.trim();
    const password = form.elements.namedItem("password").value;
    if (!email || !password) {
      showError("Enter your email and password.");
      return;
    }
    signIn(email, password);
  });

  on(document, "click", "[data-demo]", (e, btn) => {
    const account = auth.DEMO_ACCOUNTS.find((a) => a.email === btn.dataset.demo);
    if (!account) return;
    qs("#login-email").value = account.email;
    qs("#login-password").value = account.password;
    signIn(account.email, account.password);
  });

  on(document, "click", "[data-toggle-password]", (e, btn) => {
    const input = qs("#login-password");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    btn.innerHTML = icon(show ? "Lock" : "Eye", { size: 16 });
  });

  on(document, "click", "[data-theme-toggle]", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

  on(document, "click", "[data-forgot]", () => {
    const { root, close } = modal.open({
      title: "Reset your password",
      size: "sm",
      body: html`
        <p class="m-0">In the live portal, we would email a password reset link to your registered address.</p>
        <div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">This is a demo, so no email is sent. Use one of the demo accounts on this page to sign in.</div></div>`,
      footer: html`<button type="button" class="btn btn-primary" data-close-forgot>Got it</button>`,
    });
    root.querySelector("[data-close-forgot]").addEventListener("click", close);
  });

  on(document, "click", "[data-reset-demo]", async () => {
    const ok = await confirm({
      title: "Reset demo data?",
      message: "This restores every student, course, invoice and message to the original demo data in this browser. You'll stay signed in.",
      confirmLabel: "Reset data",
      danger: true,
    });
    if (!ok) return;
    try {
      await services.resetDemoData(null);
      toast("Demo data restored.", { type: "success" });
      render(new URLSearchParams(location.search).get("portal") === "admin" ? "admin" : "student");
    } catch (err) {
      toast(err.message, { type: "danger" });
    }
  });
}

function main() {
  const portal = params.get("portal") === "admin" || params.get("portal") === "staff" ? "admin" : "student";
  store
    .init()
    .then(() => {
      render(portal);
      wire();
      document.body.classList.remove("is-booting");
    })
    .catch((err) => {
      document.body.innerHTML = html`<div class="boot-screen"><div class="empty-state"><p class="empty-title">The portal couldn't start</p><p class="empty-text">${err.message}</p></div></div>`;
    });
}

main();

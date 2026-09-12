import"./modulepreload-polyfill.js";/* empty css      */import{bL as f,h as i,bJ as b,r as s,i as n,q as r,o as l,N as v,n as y,bv as w,e as u,bM as p,bN as k,bO as $,bP as S}from"./portal-core.js";import"./vendor-icons.js";const d=new URLSearchParams(location.search);function C(){return document.documentElement.getAttribute("data-theme")==="dark"?"dark":"light"}function z(e){document.documentElement.setAttribute("data-theme",e);try{localStorage.setItem("om-portal:theme",e)}catch{}}function L(e){const t=d.get("next");if(!t)return null;const a=t.split("?")[0];return/^[a-z-]+\.html$/.test(a)&&(e.role==="student"&&a.startsWith("student-")||e.role!=="student"&&a.startsWith("admin-"))?t:null}const x=[["BookOpen","Courses, class schedule and study resources"],["ClipboardList","Assignments, exams, results and progress reports"],["Wallet","Fee invoices, online payments and receipts"],["ShieldCheck","Role-based access for students, teachers and accounts"]];function T(e){return i`
    <button type="button" class="demo-account" data-demo="${e.email}">
      <span class="icon-tile icon-tile-sm tone-${s(e.role==="student"?"blue":e.role==="admin"?"navy":e.role==="teacher"?"green":"amber")}">
        ${s(n(e.role==="student"?"GraduationCap":e.role==="admin"?"ShieldCheck":e.role==="teacher"?"School":"Receipt",{size:16}))}
      </span>
      <span class="demo-account-text">
        <span class="demo-account-role">${e.label}</span>
        <span class="demo-account-hint">${e.hint}</span>
      </span>
    </button>`}function R(){const e=p("student"),t=p("admin"),a=[e&&{user:e,href:"student-dashboard.html"},t&&{user:t,href:"admin-dashboard.html"}].filter(Boolean);return a.length?i`
    <div class="alert tone-blue section-gap">
      ${s(n("Info",{size:18}))}
      <div class="alert-body">
        ${s(a.map(({user:o,href:c})=>i`<div>Signed in as <strong>${o.name}</strong> — <a href="${c}">continue</a></div>`).join(""))}
      </div>
    </div>`:""}function m(e){const t=b.filter(o=>e==="student"?o.role==="student":o.role!=="student"),a=d.get("msg");document.body.innerHTML=i`
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
            ${s(x.map(([o,c])=>i`<li><span class="login-point-ico">${s(n(o,{size:16}))}</span>${c}</li>`).join(""))}
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
          <button type="button" class="topbar-icon-btn" data-theme-toggle aria-label="Toggle dark mode">${s(n("Moon",{size:18,cls:"icon-moon"}))}${s(n("Sun",{size:18,cls:"icon-sun"}))}</button>
        </div>
        <div class="login-card">
          <a class="login-back" href="index.html">${s(n("ArrowLeft",{size:14}))}Back to website</a>
          <h2 class="login-title">Welcome back</h2>
          <p class="login-sub">Sign in to the ${e==="student"?"Student":"Staff"} Portal.</p>

          ${s(R())}
          ${a==="deactivated"?i`<div class="alert tone-rust section-gap">${s(n("TriangleAlert",{size:18}))}<div class="alert-body">That account has been deactivated. Please contact the academy office.</div></div>`:s("")}

          <div class="portal-switch" role="tablist" aria-label="Portal">
            <button type="button" role="tab" aria-selected="${e==="student"}" data-portal="student">${s(n("GraduationCap",{size:16}))}Student</button>
            <button type="button" role="tab" aria-selected="${e!=="student"}" data-portal="admin">${s(n("ShieldCheck",{size:16}))}Staff</button>
          </div>

          <form class="login-form" id="login-form" data-login-form novalidate>
            <div class="form-field">
              <label class="form-label" for="login-email">Email</label>
              <div class="input-icon">${s(n("Mail",{size:16}))}<input id="login-email" class="form-control" type="email" name="email" autocomplete="username" placeholder="you@example.com" required></div>
            </div>
            <div class="form-field">
              <label class="form-label" for="login-password">Password</label>
              <div class="password-field input-icon">
                ${s(n("Lock",{size:16}))}
                <input id="login-password" class="form-control" type="password" name="password" autocomplete="current-password" placeholder="Your password" required>
                <button type="button" class="btn btn-ghost btn-icon btn-sm password-toggle" data-toggle-password aria-label="Show password">${s(n("Eye",{size:16}))}</button>
              </div>
            </div>
            <div class="login-row">
              <label class="check-label"><input type="checkbox" name="remember" checked> Keep me signed in</label>
              <button type="button" class="link-btn" data-forgot>Forgot password?</button>
            </div>
            <div class="alert tone-rust" data-login-error hidden>${s(n("CircleAlert",{size:18}))}<div class="alert-body" data-login-error-text></div></div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" data-login-submit>${s(n("LogIn",{size:17}))}Sign in</button>
          </form>

          <div class="demo-accounts-title">Demo accounts</div>
          <div class="demo-accounts ${s(t.length===1?"demo-accounts-single":"")}">
            ${s(t.map(T).join(""))}
          </div>

          <div class="login-foot">
            <span>Demo data lives in this browser only.</span>
            <button type="button" class="link-btn" data-reset-demo>${s(n("RotateCcw",{size:13}))} Reset demo data</button>
          </div>
        </div>
      </main>
    </div>`,r("#login-email").focus()}function h(e){const t=r("[data-login-error]");r("[data-login-error-text]").textContent=e,t.hidden=!1}function g(e,t){try{const a=k(e,t);$(a);const o=r("[data-login-submit]");o&&(o.disabled=!0,o.innerHTML='<span class="spinner"></span>Signing in…'),window.location.href=L(a)||S(a)}catch(a){h(a.message)}}function A(){l(document,"click","[data-portal]",(e,t)=>{const a=t.dataset.portal,o=new URL(location.href);o.searchParams.set("portal",a),history.replaceState(null,"",o),m(a)}),l(document,"submit","[data-login-form]",(e,t)=>{e.preventDefault();const a=t.elements.namedItem("email").value.trim(),o=t.elements.namedItem("password").value;if(!a||!o){h("Enter your email and password.");return}g(a,o)}),l(document,"click","[data-demo]",(e,t)=>{const a=b.find(o=>o.email===t.dataset.demo);a&&(r("#login-email").value=a.email,r("#login-password").value=a.password,g(a.email,a.password))}),l(document,"click","[data-toggle-password]",(e,t)=>{const a=r("#login-password"),o=a.type==="password";a.type=o?"text":"password",t.setAttribute("aria-label",o?"Hide password":"Show password"),t.innerHTML=n(o?"Lock":"Eye",{size:16})}),l(document,"click","[data-theme-toggle]",()=>z(C()==="dark"?"light":"dark")),l(document,"click","[data-forgot]",()=>{const{root:e,close:t}=v.open({title:"Reset your password",size:"sm",body:i`
        <p class="m-0">In the live portal, we would email a password reset link to your registered address.</p>
        <div class="alert tone-blue section-gap">${s(n("Info",{size:18}))}<div class="alert-body">This is a demo, so no email is sent. Use one of the demo accounts on this page to sign in.</div></div>`,footer:i`<button type="button" class="btn btn-primary" data-close-forgot>Got it</button>`});e.querySelector("[data-close-forgot]").addEventListener("click",t)}),l(document,"click","[data-reset-demo]",async()=>{if(await y({title:"Reset demo data?",message:"This restores every student, course, invoice and message to the original demo data in this browser. You'll stay signed in.",confirmLabel:"Reset data",danger:!0}))try{await w(null),u("Demo data restored.",{type:"success"}),m(new URLSearchParams(location.search).get("portal")==="admin"?"admin":"student")}catch(t){u(t.message,{type:"danger"})}})}function E(){const e=d.get("portal")==="admin"||d.get("portal")==="staff"?"admin":"student";f().then(()=>{m(e),A(),document.body.classList.remove("is-booting")}).catch(t=>{document.body.innerHTML=i`<div class="boot-screen"><div class="empty-state"><p class="empty-title">The portal couldn't start</p><p class="empty-text">${t.message}</p></div></div>`})}E();

import"./modulepreload-polyfill.js";/* empty css      */import{b as z,g as P,r as o,i as p,h as i,t as F,s as N,bE as O,d as b,q as u,z as G,l as k,f as H,cs as R,A as T,o as f,B as w,cu as B,y as D,N as U,cv as Y,cw as _,cx as W,ad as j,ae as $,cy as K,e as E,bU as X}from"./portal-core.js";import"./vendor-icons.js";const J=["details","security","preferences"],I=["image/jpeg","image/png","image/webp","image/gif"],C=5,A=/^\+?[0-9][0-9\s-]{8,15}$/,L=[["assignment","Assignments","New assignments and deadline reminders","ClipboardList"],["grade","Grades","When a submission is graded","Award"],["exam","Exams","Exam schedules and admit cards","GraduationCap"],["result","Results & transcripts","Published results and issued transcripts","FileBadge"],["fee","Fees","Invoices, payment receipts and reminders","Wallet"],["leave","Leave","Decisions on your leave requests","CalendarX"],["message","Messages","Replies from instructors and offices","MessageSquare"],["forum","Forum","Replies to your forum threads","MessagesSquare"],["resource","Resources","New study material for your courses","FolderOpen"]];let n;z({id:"student-profile",portal:"student",watch:["users","files","enrollments","batches","courses","centers"],mount(e){n=e,V(),se(),S(),window.addEventListener("om-portal:theme",x)},update:()=>S(),unmount(){window.removeEventListener("om-portal:theme",x)}});const v=()=>b("users",n.user.id)||n.user,M=()=>document.documentElement.getAttribute("data-theme")==="dark"?"dark":"light";function Q(e,a="xl"){return e.avatarFileId&&b("files",e.avatarFileId)?i`<span class="avatar avatar-${o(a)}"><img data-file-src="${e.avatarFileId}" alt="${e.name}"></span>`:D({name:e.name,size:a})}function V(){const e=J.includes(P("tab"))?P("tab"):"details";n.root.innerHTML=i`
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
          <button type="button" class="tab" role="tab" data-tab="details">${o(p("UserRound",{size:15}))}Personal details</button>
          <button type="button" class="tab" role="tab" data-tab="security">${o(p("ShieldCheck",{size:15}))}Security</button>
          <button type="button" class="tab" role="tab" data-tab="preferences">${o(p("SlidersHorizontal",{size:15}))}Preferences</button>
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
              <div class="form-actions profile-form-actions"><button type="submit" class="btn btn-primary">${o(p("KeyRound",{size:16}))}Update password</button></div>
            </form>
          </div>
        </div>
        <div data-tab-panel="preferences" hidden>
          <div class="card-body stack-lg">
            <section>
              <h2 class="card-title">Appearance</h2>
              <p class="card-subtitle section-gap">Choose how the portal looks on this device and in your account.</p>
              <div class="theme-options" role="radiogroup" aria-label="Theme" data-theme-options>
                <button type="button" class="theme-option" role="radio" data-theme-pick="light"><span class="icon-tile icon-tile-sm tone-amber">${o(p("Sun",{size:16}))}</span><span><span class="theme-option-name">Light</span><span class="theme-option-hint">Bright surfaces, best in daylight</span></span></button>
                <button type="button" class="theme-option" role="radio" data-theme-pick="dark"><span class="icon-tile icon-tile-sm tone-navy">${o(p("Moon",{size:16}))}</span><span><span class="theme-option-name">Dark</span><span class="theme-option-hint">Easier on the eyes at night</span></span></button>
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
    </div>`,F(n.root,{active:e,onChange:a=>N("tab",a)})}function S(){var c;const e=v(),a=O(e.id,{activeOnly:!0}),t=b("centers",e.centerId),s=a.map(r=>({course:b("courses",r.courseId),batch:b("batches",r.batchId)})).filter(r=>r.course);u("[data-profile-card]",n.root).innerHTML=i`
    <div class="card-body profile-card-body">
      <div class="profile-photo">
        ${Q(e)}
        <label class="profile-photo-btn" aria-label="Change profile photo" title="Change photo">${o(p("Upload",{size:15}))}<input type="file" accept="${I.join(",")}" class="visually-hidden-input" data-photo></label>
      </div>
      <h2 class="profile-name-lg">${e.name}</h2>
      <p class="text-muted m-0">${e.rollNo||"—"}</p>
      <span class="badge tone-${o(e.status==="active"?"green":"rust")}">${e.status==="active"?"Active student":G(e.status)}</span>
      <p class="field-error" data-photo-error hidden></p>
    </div>
    <div class="card-body profile-card-meta">
      <dl class="kv-list">
        <dt>Center</dt><dd>${(t==null?void 0:t.name)||"—"}</dd>
        <dt>Admission</dt><dd>${k(e.admissionDate)}</dd>
        <dt>Email</dt><dd>${e.email?e.email.split("@").map(r=>i`${r}`).reduce((r,d)=>i`${r}${o("<wbr>@")}${d}`):"—"}</dd>
      </dl>
    </div>
    <div class="card-body profile-card-meta">
      <h3 class="drawer-section-title">Enrolled courses</h3>
      ${s.length?i`<ul class="list-plain stack-sm">${s.map(({course:r,batch:d})=>i`<li class="cell-user"><span class="icon-tile icon-tile-sm tone-${o(r.tone||"blue")}">${o(p("BookOpen",{size:15}))}</span><div class="cell-user-text"><span class="cell-title">${r.title}</span><span class="cell-sub">${(d==null?void 0:d.name)||""}</span></div></li>`)}</ul>`:H({icon:"BookOpen",title:"No active courses",text:"Your courses appear here after enrolment."})}
    </div>`,R(u("[data-profile-card]",n.root)),u("[data-details]",n.root).innerHTML=i`
    <div class="cluster-between section-gap">
      <div><h2 class="card-title">Personal details</h2><p class="card-subtitle">Contact the Admin office to correct your name, date of birth or other official details.</p></div>
      <button type="button" class="btn btn-outline btn-sm" data-act="edit">${o(p("Pencil",{size:15}))}Edit contact details</button>
    </div>
    <div class="grid grid-2">
      <div class="profile-section">
        <h3 class="drawer-section-title">Official record</h3>
        <dl class="kv-list">
          <dt>Full name</dt><dd>${e.name}</dd>
          <dt>Roll number</dt><dd>${e.rollNo||"—"}</dd>
          <dt>Date of birth</dt><dd>${k(e.dob)}</dd>
          <dt>Gender</dt><dd>${e.gender==="F"?"Female":e.gender==="M"?"Male":"—"}</dd>
          <dt>Qualification</dt><dd>${e.qualification||"—"}</dd>
          <dt>Guardian</dt><dd>${e.guardianName||"—"}</dd>
        </dl>
      </div>
      <div class="profile-section">
        <h3 class="drawer-section-title">Contact <span class="badge tone-blue">Editable</span></h3>
        <dl class="kv-list">
          <dt>Phone</dt><dd>${e.phone||"—"}</dd>
          <dt>Guardian phone</dt><dd>${e.guardianPhone||"—"}</dd>
          <dt>Address</dt><dd>${e.address||"—"}</dd>
          <dt>Email</dt><dd>${e.email?e.email.split("@").map(r=>i`${r}`).reduce((r,d)=>i`${r}${o("<wbr>@")}${d}`):"—"}</dd>
        </dl>
      </div>
    </div>`;const l=((c=e.prefs)==null?void 0:c.notify)||{};u("[data-prefs]",n.root).innerHTML=i`
    <div class="pref-row pref-head"><span>Type</span><span>In portal</span><span>Email</span></div>
    ${L.map(([r,d,g,y])=>{const m=l[r]||{},h=m.inApp!==!1,q=!!m.email;return i`<div class="pref-row">
        <span class="cell-user"><span class="icon-tile icon-tile-sm tone-slate">${o(p(y,{size:15}))}</span><span class="cell-user-text"><span class="cell-title">${d}</span><span class="cell-sub">${g}</span></span></span>
        <label class="pref-toggle"><span class="pref-toggle-label">In portal</span><input type="checkbox" class="toggle" data-pref="${r}" data-channel="inApp" ${o(h?"checked":"")} aria-label="${d} in portal"></label>
        <label class="pref-toggle"><span class="pref-toggle-label">Email</span><input type="checkbox" class="toggle" data-pref="${r}" data-channel="email" ${o(q?"checked":"")} aria-label="${d} by email"></label>
      </div>`})}`,x()}function x(){const e=M();T("[data-theme-pick]",n.root).forEach(a=>{a.setAttribute("aria-checked",String(a.dataset.themePick===e)),a.classList.toggle("is-active",a.dataset.themePick===e)})}async function Z(){const e=v(),a=await U.form({title:"Edit contact details",submitLabel:"Save changes",values:{phone:e.phone||"",guardianPhone:e.guardianPhone||"",address:e.address||""},fields:[{name:"phone",label:"Phone",type:"tel",required:!0,placeholder:"+91 98xxxxxxxx",autocomplete:"tel"},{name:"guardianPhone",label:"Guardian phone",type:"tel",placeholder:"+91 98xxxxxxxx"},{name:"address",label:"Address",type:"textarea",rows:3,required:!0,span:2}],validate:t=>{const s={};return A.test(t.phone.trim())||(s.phone="Enter a valid phone number (10 digits, optional +91)."),t.guardianPhone.trim()&&!A.test(t.guardianPhone.trim())&&(s.guardianPhone="Enter a valid phone number, or leave it blank."),t.address.trim().length<8?s.address="Enter your full address.":t.address.trim().length>300&&(s.address="Keep the address under 300 characters."),s}});a&&w(()=>Y(n.user,{phone:a.phone.trim(),guardianPhone:a.guardianPhone.trim(),address:a.address.trim()}),{success:"Contact details updated.",error:"Couldn't save your details"})}async function ee(e){const a=e.files[0];e.value="";const t=u("[data-photo-error]",n.root),s=l=>{t.hidden=!1,t.textContent=l};if(t.hidden=!0,!!a){if(!I.includes(a.type))return s("Choose a JPG, PNG, WebP or GIF image.");if(a.size>C*1024*1024)return s(`The photo must be ${C} MB or smaller.`);await w(()=>_(n.user,a),{success:"Profile photo updated.",error:"Couldn't update your photo"})}}async function ae(e){const a=j(e),t={};if(a.current||(t.current="Enter your current password."),a.next?a.next.length<6?t.next="The new password must be at least 6 characters.":a.next===a.current&&(t.next="Choose a password different from your current one."):t.next="Enter a new password.",a.confirm?a.next&&a.confirm!==a.next&&(t.confirm="The passwords don't match."):t.confirm="Re-enter the new password.",!$(e,t))return;const s=e.querySelector('button[type="submit"]');s.disabled=!0;try{await K(n.user,a.current,a.next),e.reset(),E("Password updated. Use it the next time you sign in.",{type:"success"})}catch(l){const c=X(l);/current password/i.test(c)?$(e,{current:c}):/at least 6/i.test(c)?$(e,{next:c}):E("Couldn't change your password: "+c,{type:"danger",duration:6e3})}finally{s.disabled=!1}}function te(e){document.documentElement.setAttribute("data-theme",e);try{localStorage.setItem("om-portal:theme",e)}catch{}window.dispatchEvent(new CustomEvent("om-portal:theme",{detail:e})),w(()=>W(v(),e),{success:`${e==="dark"?"Dark":"Light"} theme saved.`,error:"Couldn't save your theme"})}function se(){f(n.root,"click",'[data-act="edit"]',Z),f(n.root,"change","[data-photo]",(a,t)=>ee(t)),f(n.root,"click","[data-theme-pick]",(a,t)=>{var s;(t.dataset.themePick!==M()||((s=v().prefs)==null?void 0:s.theme)!==t.dataset.themePick)&&te(t.dataset.themePick)}),f(n.root,"change","[data-pref]",(a,t)=>{var d,g,y,m;const s=v(),l=t.dataset.pref,c={...((d=s.prefs)==null?void 0:d.notify)||{},[l]:{inApp:!0,...((y=(g=s.prefs)==null?void 0:g.notify)==null?void 0:y[l])||{},[t.dataset.channel]:t.checked}},r=((m=L.find(([h])=>h===l))==null?void 0:m[1])||l;w(()=>B(n.user,{notify:c}),{success:`${r} preference saved.`,error:"Couldn't save your preference"}).then(h=>{h||(t.checked=!t.checked)})});const e=u("[data-password-form]",n.root);e.addEventListener("submit",a=>{a.preventDefault(),ae(e)}),f(e,"change","[data-show-pw]",(a,t)=>T('input[name="current"], input[name="next"], input[name="confirm"]',e).forEach(s=>s.type=t.checked?"text":"password"))}

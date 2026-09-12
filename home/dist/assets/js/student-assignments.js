import"./modulepreload-polyfill.js";/* empty css      */import{b as J,g as D,G as Q,d as f,e as g,s as v,r as a,h as i,i as m,t as X,M as L,q as A,a as S,c as G,f as Z,l as K,I as T,o as w,F as ee,D as M,N as te,J as O,B as se,bQ as ae,bR as ie,bS as ne,bT as de,T as le,Y as oe,K as re,bU as ce,x as ue,bV as me}from"./portal-core.js";import"./vendor-icons.js";const C=["pending","submitted","graded","overdue"],$={pending:{label:"Pending",icon:"Clock",empty:"Nothing pending — you're all caught up."},submitted:{label:"Submitted",icon:"Send",empty:"Submitted work waiting to be graded appears here."},graded:{label:"Graded",icon:"BadgeCheck",empty:"Graded assignments with marks and feedback appear here."},overdue:{label:"Overdue",icon:"TriangleAlert",empty:"No overdue assignments. Keep it up!"}},be=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.jpg,.jpeg,.png",pe=/\.(pdf|docx?|pptx?|xlsx?|txt|zip|jpe?g|png)$/i,B=5;let r,F,p="";J({id:"student-assignments",portal:"student",watch:["assignments","submissions","enrollments","batches","courses","files","settings"],mount(e){r=e,p=D("course")||"",fe(),xe(),P();const s=e.params.get("id");s&&W(s)},update:()=>P()});const ge=e=>e==="overdue-allowed"?"overdue":e,q=e=>me(e.dueAt),R=e=>e.status!=="graded"&&(!q(e)||e.allowLate);function Y(){return ie(r.user.id).map(e=>{const s=ne(e,r.user.id),t=de(e.id,r.user.id)||null,d=f("courses",e.courseId)||le(f("batches",e.batchId)),o=t&&t.status==="graded"&&t.marks!=null&&e.maxMarks?Math.round(t.marks/e.maxMarks*1e3)/10:null;return{...e,status:s,bucket:ge(s),sub:t,course:d,pct:o,grade:o!=null?oe(o):null}}).sort((e,s)=>e.dueAt.localeCompare(s.dueAt))}const ve=e=>e.filter(s=>!p||s.courseId===p);function $e(){return(ue("settings").system||{}).maxUploadKB||2048}function fe(){const e=C.includes(D("tab"))?D("tab"):"pending",s=Q(r.user.id).map(t=>f("courses",t.courseId)).filter(Boolean);p&&!s.some(t=>t.id===p)&&(g("That course isn't one of your enrolments, so all assignments are shown.",{type:"warning"}),p="",v("course",null)),r.root.innerHTML=i`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Assignments</li></ol>
        <h1 class="page-title">Assignments</h1>
        <p class="page-subtitle">Submit your work, track deadlines and read your instructor's feedback.</p>
      </div>
      <div class="page-actions">
        <select class="form-control" data-course-filter aria-label="Filter by course">
          <option value="">All courses</option>
          ${s.map(t=>i`<option value="${t.id}" ${a(t.id===p?"selected":"")}>${t.title}</option>`)}
        </select>
      </div>
    </div>
    <div data-alert></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        ${C.map(t=>i`<button type="button" class="tab" role="tab" data-tab="${t}">${a(m($[t].icon,{size:15}))}${$[t].label} <span class="tab-count" data-count="${t}"></span></button>`)}
      </div>
      ${C.map(t=>i`<div data-tab-panel="${t}" ${a(t===e?"":"hidden")}><div class="card-body" data-list="${t}"></div></div>`)}
    </div>`,F=X(r.root,{active:e,onChange:t=>v("tab",t)})}function P(){const e=Y(),s=ve(e),t=n=>s.filter(l=>l.bucket===n),d=t("graded"),o=d.length?Math.round(d.reduce((n,l)=>n+(l.pct||0),0)/d.length):null,u=t("pending").filter(n=>L(n.dueAt)==="Today"||L(n.dueAt)==="Tomorrow");A("[data-kpis]",r.root).innerHTML=[S({icon:"Clock",label:"Pending",value:String(t("pending").length),tone:"amber"}),S({icon:"Send",label:"Awaiting grade",value:String(t("submitted").length),tone:"blue"}),S({icon:"BadgeCheck",label:"Graded",value:String(d.length),tone:"green"}),S({icon:"Award",label:"Average score",value:o==null?"—":o+"%",tone:o==null?"slate":"purple"})].join("");const c=t("overdue").filter(n=>n.allowLate);A("[data-alert]",r.root).innerHTML=u.length||c.length?i`<div class="alert tone-${a(c.length?"rust":"amber")} page-section" role="status">
        ${a(m("TriangleAlert",{size:18}))}
        <div class="alert-body"><p class="alert-title">${c.length?G(c.length,"overdue assignment")+" still accept late work":G(u.length,"assignment")+" due soon"}</p>${c.length?"Submit as soon as you can — late submissions are marked late.":"Don't miss the deadline: "+u.map(n=>n.title).join(", ")+"."}</div>
        <div class="alert-actions"><button type="button" class="btn btn-outline btn-sm" data-goto="${c.length?"overdue":"pending"}">View</button></div>
      </div>`:"";for(const n of C){const l=t(n);A(`[data-count="${n}"]`,r.root).textContent=l.length,A(`[data-list="${n}"]`,r.root).innerHTML=l.length?i`<div class="grid grid-2">${(n==="graded"||n==="submitted"?[...l].reverse():l).map(he)}</div>`:Z({icon:$[n].icon,title:e.length?`No ${$[n].label.toLowerCase()} assignments`:"No assignments yet",text:e.length?$[n].empty:"Assignments from your instructors will appear here."})}}function j(e){var s;return e.status==="overdue-allowed"?i`${M("overdue","Overdue")}<span class="badge tone-amber">Late allowed</span>`:e.status==="overdue"?M("overdue","Closed"):M(e.status,((s=$[e.bucket])==null?void 0:s.label)||e.status)}function he(e){var d,o,u,c,n,l;const s=((d=e.course)==null?void 0:d.tone)||"blue",t=(o=e.sub)==null?void 0:o.late;return i`
    <article class="card asg-card ${a(e.bucket==="overdue"?"is-overdue":"")}">
      <div class="card-body stack-sm">
        <div class="cluster-between asg-card-top">
          <span class="badge tone-${a(s)}">${((u=e.course)==null?void 0:u.code)||((c=e.course)==null?void 0:c.title)||"Course"}</span>
          <div class="cluster">${j(e)}${t?i`<span class="badge tone-amber">Late</span>`:a("")}</div>
        </div>
        <h3 class="asg-title">${e.title}</h3>
        <p class="text-sm text-muted m-0 asg-course">${((n=e.course)==null?void 0:n.title)||""}</p>
        <div class="asg-meta">
          <span>${a(m("CalendarClock",{size:14}))}Due ${K(e.dueAt)}${e.bucket==="pending"||e.bucket==="overdue"?i` · <span class="${a(e.bucket==="overdue"?"text-danger":"")}">${L(e.dueAt)}</span>`:a("")}</span>
          <span>${a(m("Target",{size:14}))}${e.maxMarks} marks</span>
        </div>
        ${e.bucket==="graded"?i`<div class="asg-score">
              <div><div class="asg-score-value">${e.sub.marks}<span class="text-muted">/${e.maxMarks}</span></div><div class="text-xs text-muted">${e.pct}%</div></div>
              <span class="asg-grade tone-${a(e.pct>=60?"green":e.pct>=40?"amber":"rust")}">${((l=e.grade)==null?void 0:l.grade)||"—"}</span>
            </div>`:a("")}
        ${e.bucket==="submitted"?i`<p class="text-xs text-muted m-0">Submitted ${T(e.sub.submittedAt)}</p>`:a("")}
      </div>
      <div class="card-footer">
        <button type="button" class="btn btn-ghost btn-sm" data-open="${e.id}">${a(m("Eye",{size:15}))}Details</button>
        ${R(e)?i`<button type="button" class="btn ${a(e.sub?"btn-outline":"btn-primary")} btn-sm" data-submit="${e.id}">${a(m(e.sub?"RefreshCw":"Upload",{size:15}))}${e.sub?"Resubmit":"Submit"}</button>`:a("")}
      </div>
    </article>`}function xe(){w(r.root,"click","[data-open]",(e,s)=>W(s.dataset.open)),w(r.root,"click","[data-submit]",(e,s)=>_(s.dataset.submit)),w(r.root,"click","[data-goto]",(e,s)=>F.setTab(s.dataset.goto)),w(r.root,"change","[data-course-filter]",(e,s)=>{p=s.value,v("course",p||null),P()})}function U(e){const s=Y().find(t=>t.id===e);return s||g("That assignment couldn't be found — it may have been removed or isn't for your batch.",{type:"warning"}),s}function H(e){const s=(e||[]).map(t=>f("files",t)||{id:t,name:"Missing file",size:0,missing:!0});return s.length?i`<div class="stack-sm">${s.map(t=>i`<div class="file-tile">
      <span class="icon-tile icon-tile-sm tone-blue">${a(m("Paperclip",{size:15}))}</span>
      <div class="file-tile-main"><div class="file-tile-name">${t.name}</div><div class="file-tile-meta">${t.missing?"No longer available":O(t.size)}</div></div>
      ${t.missing?a(""):i`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-file="${t.id}" aria-label="Download ${t.name}">${a(m("Download",{size:15}))}</button>`}
    </div>`)}</div>`:a("")}async function ye(e,s){const t=f("files",e);if(!t)return g("That file is no longer available.",{type:"warning"});s.disabled=!0;try{await re(t),g(`Downloading "${t.name}"`,{type:"success"})}catch(d){console.error(d),g(`Couldn't download "${t.name}": ${ce(d)}`,{type:"danger",duration:6e3})}finally{s.disabled=!1}}function W(e){var u,c,n,l,z,h;const s=U(e);if(!s)return;v("id",s.id);const t=s.sub,d=ee.open({title:"Assignment details",wide:!0,body:i`
      <div class="section-gap">
        <div class="cluster section-gap"><span class="badge tone-${a(((u=s.course)==null?void 0:u.tone)||"blue")}">${((c=s.course)==null?void 0:c.title)||"Course"}</span>${j(s)}</div>
        <div class="fw-700 text-lg text-title">${s.title}</div>
      </div>
      <dl class="kv-list drawer-section">
        <dt>Due</dt><dd>${T(s.dueAt)}${s.bucket==="pending"||s.bucket==="overdue"?i` <span class="text-muted text-sm">· ${L(s.dueAt)}</span>`:a("")}</dd>
        <dt>Maximum marks</dt><dd>${s.maxMarks}</dd>
        <dt>Late submissions</dt><dd>${s.allowLate?"Accepted (marked late)":"Not accepted"}</dd>
        <dt>Batch</dt><dd>${((n=f("batches",s.batchId))==null?void 0:n.name)||"—"}</dd>
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Instructions</h4>
        <p class="m-0 asg-text">${s.description||"No instructions were added."}</p>
      </div>
      ${(s.fileIds||[]).length?i`<div class="drawer-section"><h4 class="drawer-section-title">Attached by instructor</h4>${H(s.fileIds)}</div>`:a("")}
      ${t&&t.status==="graded"?i`<div class="drawer-section">
            <h4 class="drawer-section-title">Result</h4>
            <div class="asg-result">
              <div><div class="text-xs text-muted">Marks</div><div class="asg-score-value">${t.marks}<span class="text-muted">/${s.maxMarks}</span></div></div>
              <div><div class="text-xs text-muted">Percentage</div><div class="asg-score-value">${s.pct}%</div></div>
              <div><div class="text-xs text-muted">Grade</div><div class="asg-score-value">${((l=s.grade)==null?void 0:l.grade)||"—"}</div>${(z=s.grade)!=null&&z.label?i`<div class="text-xs text-muted">${s.grade.label}</div>`:a("")}</div>
            </div>
            <div class="progress tone-${a(s.pct>=60?"green":s.pct>=40?"amber":"rust")} section-gap"><span class="progress-bar pct-${a(Math.min(100,Math.round((s.pct||0)/5)*5))}"></span></div>
            ${t.feedback?i`<div class="alert tone-green">${a(m("MessageSquare",{size:18}))}<div class="alert-body"><p class="alert-title">Instructor feedback</p>${t.feedback}</div></div>`:i`<p class="text-muted m-0">No written feedback.</p>`}
            ${t.gradedAt?i`<p class="text-xs text-muted">Graded ${T(t.gradedAt)}</p>`:a("")}
          </div>`:a("")}
      <div class="drawer-section">
        <h4 class="drawer-section-title">My submission</h4>
        ${t?i`<div class="stack-sm">
              <div class="cluster">${a(M(t.status,t.status==="graded"?"Graded":"Submitted"))}${t.late?i`<span class="badge tone-amber">Late</span>`:a("")}<span class="text-sm text-muted">${T(t.submittedAt)}</span></div>
              ${t.text?i`<p class="m-0 asg-text">${t.text}</p>`:a("")}
              ${H(t.fileIds)}
            </div>`:i`<p class="text-muted m-0">${s.status==="overdue"?"The deadline has passed and this assignment no longer accepts submissions.":"You haven't submitted this assignment yet."}</p>`}
      </div>`,footer:i`
      <button type="button" class="btn btn-outline" data-d="close">Close</button>
      ${R(s)?i`<button type="button" class="btn btn-primary" data-d="submit">${a(m(t?"RefreshCw":"Upload",{size:16}))}${t?"Resubmit":"Submit assignment"}</button>`:a("")}`}),o=()=>{v("id",null),d.close()};d.root.querySelector('[data-d="close"]').addEventListener("click",o),d.root.querySelector("[data-drawer-close]").addEventListener("click",()=>v("id",null)),(h=d.root.querySelector('[data-d="submit"]'))==null||h.addEventListener("click",()=>{o(),_(s.id)}),w(d.root,"click","[data-file]",(k,b)=>ye(b.dataset.file,b))}async function _(e){var h;const s=U(e);if(!s)return;if(s.status==="graded")return g("This assignment has already been graded, so it can't be resubmitted.",{type:"info"});if(!R(s))return g("The deadline has passed and this assignment doesn't accept late submissions.",{type:"warning"});const t=s.sub,d=$e(),o=d>=1024?Math.round(d/1024*10)/10+" MB":d+" KB",u=q(s),c=i`
    <div class="asg-submit-head section-gap">
      <div><div class="text-muted text-sm">${((h=s.course)==null?void 0:h.title)||""}</div><div class="fw-600 text-title">${s.title}</div></div>
      <div class="text-right"><div class="text-muted text-sm">Due</div><div class="fw-600 text-title">${K(s.dueAt)}</div></div>
    </div>
    ${u?i`<div class="alert tone-amber section-gap">${a(m("TriangleAlert",{size:18}))}<div class="alert-body">The deadline has passed. Your work will be marked <strong>late</strong>.</div></div>`:a("")}
    ${t?i`<div class="alert tone-blue section-gap">${a(m("Info",{size:18}))}<div class="alert-body">You're replacing your earlier submission. ${(t.fileIds||[]).length?"Your previous files are kept unless you attach new ones.":""}</div></div>`:a("")}`,n=await te.form({title:t?"Resubmit assignment":"Submit assignment",submitLabel:t?"Resubmit":"Submit",columns:1,extraBodyHtml:c,fields:[{name:"text",label:"Your answer or notes",type:"textarea",rows:5,placeholder:"Write your answer, or a short note for your instructor…"},{name:"files",label:"Attach files",type:"file",multiple:!0,accept:be,help:`Up to ${B} files, ${o} each. PDF, Word, PowerPoint, Excel, text, ZIP or images.`}],values:{text:(t==null?void 0:t.text)||""},validate:k=>{const b={},x=Array.from(k.files||[]),V=((t==null?void 0:t.fileIds)||[]).length>0;!k.text.trim()&&!x.length&&!V&&(b.text="Write an answer or attach at least one file."),k.text.length>5e3&&(b.text="Keep your answer under 5,000 characters, or attach it as a file."),x.length>B&&(b.files=`Attach at most ${B} files.`);const E=x.find(y=>!pe.test(y.name)),I=x.find(y=>y.size>d*1024),N=x.find(y=>y.size===0);return E?b.files=`"${E.name}" isn't an accepted file type.`:I?b.files=`"${I.name}" is ${O(I.size)} — the limit is ${o} per file.`:N&&(b.files=`"${N.name}" is empty.`),b}});if(!n)return;const l=Array.from(n.files||[]);await se(()=>ae(r.user,s.id,{text:n.text.trim(),fileList:l.length?l:null}),{success:t?"Submission updated.":u?"Assignment submitted (marked late).":"Assignment submitted.",error:"Couldn't submit the assignment"})&&F.setTab("submitted")}

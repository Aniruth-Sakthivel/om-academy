import"./modulepreload-polyfill.js";/* empty css      */import{b as B,g as x,r as n,i,h as l,t as R,s as I,k as L,f as v,l as C,p as T,q as c,_ as N,a as m,I as E,c as H,H as G,j as A,cd as M,bW as W,u as Y,D as j,e as g,a0 as k,ce as q,o as h,d as p,cf as O,a1 as U,a7 as z,W as K,Y as _,v as J,T as Q}from"./portal-core.js";import"./vendor-icons.js";const V=["upcoming","results","transcripts"];let e,u;B({id:"student-exams",portal:"student",watch:["exams","marks","transcripts","attendanceSessions","invoices","payments","enrollments","settings","users"],mount(a){e=a,tt(),et(),w()},update:()=>w(),unmount(){u==null||u.destroy()}});const P=()=>p("users",e.user.id)||e.user,D=a=>{var t,s;return((t=p("courses",a.courseId))==null?void 0:t.title)||((s=Q(p("batches",a.batchId)))==null?void 0:s.title)||"—"};function X(){return z(e.user.id).filter(a=>a.status!=="published"&&a.date>=A())}function S(){return z(e.user.id,{publishedOnly:!0}).map(a=>{const t=K(a.id,e.user.id);if(!t)return null;const s=t.absent||t.marks==null?null:t.marks/a.maxMarks*100,r=s==null?null:_(s),d=!t.absent&&t.marks!=null&&t.marks>=(a.passMarks??0);return{...a,course:D(a),marks:t.marks,absent:t.absent,percent:s,grade:(r==null?void 0:r.grade)||"—",gradeLabel:(r==null?void 0:r.label)||"",result:t.absent?"absent":d?"pass":"fail"}}).filter(Boolean).sort((a,t)=>t.date.localeCompare(a.date))}const Z=()=>J("transcripts",a=>a.studentId===e.user.id).sort((a,t)=>t.issuedAt.localeCompare(a.issuedAt));function tt(){const a=V.includes(x("tab"))?x("tab"):"upcoming";e.root.innerHTML=l`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Exams &amp; Results</li></ol>
        <h1 class="page-title">Exams &amp; Results</h1>
        <p class="page-subtitle">Your exam schedule, admit cards, results and transcripts.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="marksheet">${n(i("Printer",{size:16}))}Print marksheet</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="upcoming">${n(i("CalendarClock",{size:15}))}Upcoming <span class="tab-count" data-count="upcoming"></span></button>
        <button type="button" class="tab" role="tab" data-tab="results">${n(i("Award",{size:15}))}Results <span class="tab-count" data-count="results"></span></button>
        <button type="button" class="tab" role="tab" data-tab="transcripts">${n(i("FileBadge",{size:15}))}Transcripts <span class="tab-count" data-count="transcripts"></span></button>
      </div>
      <div data-tab-panel="upcoming"><div class="card-body" data-upcoming></div></div>
      <div data-tab-panel="results" hidden><div data-results-table></div></div>
      <div data-tab-panel="transcripts" hidden><div class="card-body" data-transcripts></div></div>
    </div>`,R(e.root,{active:a,onChange:t=>I("tab",t)}),u=L(c("[data-results-table]",e.root),{rows:[],searchKeys:["title","course","cycle"],filters:[{key:"result",label:"Result",options:[["pass","Pass"],["fail","Fail"],["absent","Absent"]]}],columns:[{key:"title",label:"Exam",sortable:!0,render:t=>l`<div class="cell-user-text"><span class="cell-title">${t.cycle||t.title}</span><span class="cell-sub">${t.course}</span></div>`},{key:"date",label:"Date",sortable:!0,hideBelow:"md",render:t=>C(t.date)},{key:"marks",label:"Marks",sortable:!0,align:"right",render:t=>l`<span class="tabular fw-600">${t.absent?"AB":t.marks}</span><span class="text-muted"> / ${t.maxMarks}</span>`},{key:"percent",label:"%",sortable:!0,align:"right",render:t=>t.percent==null?"—":T(t.percent,1)},{key:"grade",label:"Grade",render:t=>l`<span class="exam-grade tone-${n(at(t))}">${t.grade}</span>`},{key:"result",label:"Result",render:t=>l`<span class="badge tone-${n(t.result==="pass"?"green":t.result==="fail"?"rust":"slate")}">${t.result==="pass"?"Pass":t.result==="fail"?"Fail":"Absent"}</span>`}],rowActions:[{label:"Print marksheet",icon:"Printer",onClick:t=>F([t],t.title)}],empty:v({icon:"Award",title:"No results yet",text:"Results appear here once your instructors publish them."})})}function at(a){return a.result!=="pass"?a.result==="fail"?"rust":"slate":a.percent>=80?"green":a.percent>=60?"blue":"amber"}function w(){const a=X(),t=S(),s=Z(),r=N(e.user.id),d=t.filter(o=>o.percent!=null),y=d.length?d.reduce((o,b)=>o+b.percent,0)/d.length:null,f=t.filter(o=>o.result==="pass").length;c("[data-kpis]",e.root).innerHTML=[m({icon:"CalendarClock",label:"Upcoming exams",value:String(a.length),tone:"blue"}),m({icon:"Award",label:"GPA (10-point)",value:r==null?"—":r.toFixed(2),tone:"purple"}),m({icon:"Target",label:"Average score",value:y==null?"—":T(y,1),tone:"green"}),m({icon:"CircleCheck",label:"Exams passed",value:t.length?`${f}/${t.length}`:"—",tone:t.length&&f<t.length?"amber":"slate"})].join(""),c('[data-count="upcoming"]',e.root).textContent=a.length,c('[data-count="results"]',e.root).textContent=t.length,c('[data-count="transcripts"]',e.root).textContent=s.length,c("[data-upcoming]",e.root).innerHTML=a.length?l`<div class="grid grid-2">${a.map(st)}</div>`:v({icon:"CalendarClock",title:"No upcoming exams",text:"When an exam is scheduled for your batch it will appear here with your admit card."}),u.update(t),c("[data-transcripts]",e.root).innerHTML=s.length?l`<div class="stack-sm">${s.map(o=>{var b,$;return l`
        <div class="file-tile">
          <span class="icon-tile tone-purple">${n(i("FileBadge",{size:18}))}</span>
          <div class="file-tile-main">
            <div class="file-tile-name">Academic transcript · ${o.serialNo}</div>
            <div class="file-tile-meta">Issued ${E(o.issuedAt)} · GPA ${((b=o.snapshot)==null?void 0:b.gpa)==null?"—":Number(o.snapshot.gpa).toFixed(2)} · ${H(((($=o.snapshot)==null?void 0:$.results)||[]).length,"result")}</div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" data-transcript="${o.id}">${n(i("Printer",{size:15}))}Print</button>
        </div>`})}</div>`:v({icon:"FileBadge",title:"No transcripts issued",text:"Transcripts are issued by the academy office. Ask the Admin office if you need one."})}function st(a){const t=G(a.date,A()),s=M(e.user.id,a),r=t===0?"Today":t===1?"Tomorrow":`${t} days to go`,d=new Date(a.date+"T00:00:00");return l`
    <div class="card exam-card">
      <div class="card-body stack-sm">
        <div class="exam-card-top">
          <div class="exam-date tone-${n(t<=3?"amber":"blue")}">
            <span class="exam-date-day">${String(d.getDate())}</span>
            <span class="exam-date-mon">${d.toLocaleString("en-IN",{month:"short"})}</span>
          </div>
          <div class="exam-card-main">
            <h3 class="card-title">${a.cycle||a.title}</h3>
            <p class="card-subtitle">${D(a)}</p>
          </div>
          <span class="badge tone-${n(t<=3?"amber":"blue")}">${r}</span>
        </div>
        <ul class="exam-meta">
          <li>${n(i("Calendar",{size:14}))}${W(a.date)}, ${C(a.date)}</li>
          <li>${n(i("Clock",{size:14}))}${Y(a.start,a.end)}</li>
          <li>${n(i("MapPin",{size:14}))}${a.room||"Room to be announced"}</li>
          <li>${n(i("Target",{size:14}))}Max ${a.maxMarks} · pass ${a.passMarks}</li>
        </ul>
        ${s.ok?l`<div class="alert tone-green">${n(i("BadgeCheck",{size:18}))}<div class="alert-body">You're eligible to sit this exam.</div></div>`:l`<div class="alert tone-rust">${n(i("Ban",{size:18}))}<div class="alert-body"><p class="alert-title">Not eligible yet</p>${s.reason}</div></div>`}
      </div>
      <div class="card-footer">
        <span class="text-sm text-muted">${j(a.status,a.status==="marks-entry"?"Marks entry":"Scheduled")}</span>
        ${s.ok?l`<button type="button" class="btn btn-primary btn-sm" data-admit="${a.id}">${n(i("Download",{size:15}))}Download admit card</button>`:l`<button type="button" class="btn btn-outline btn-sm" disabled>${n(i("Lock",{size:15}))}Admit card locked</button>`}
      </div>
    </div>`}function F(a,t){if(!a.length)return g("There are no published results to print yet.",{type:"info"});k(t?"Marksheet — "+t:"Statement of marks",q(P(),a.map(s=>({title:s.title,course:s.course,marks:s.marks,maxMarks:s.maxMarks,absent:s.absent}))))}function et(){h(e.root,"click",'[data-act="marksheet"]',()=>F(S())),h(e.root,"click","[data-admit]",(a,t)=>{const s=p("exams",t.dataset.admit);if(!s)return g("That exam couldn't be found.",{type:"warning"});const r=M(e.user.id,s);if(!r.ok)return g(r.reason,{type:"warning"});k("Admit card — "+s.title,O(s,P()))}),h(e.root,"click","[data-transcript]",(a,t)=>{const s=p("transcripts",t.dataset.transcript);if(!s||s.studentId!==e.user.id)return g("That transcript couldn't be found.",{type:"warning"});k("Transcript "+s.serialNo,U(s))})}

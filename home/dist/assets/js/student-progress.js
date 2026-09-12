import"./modulepreload-polyfill.js";/* empty css      */import{b as Q,r as c,i as f,h as d,k as V,f as g,l as C,p as v,q as b,a as k,cz as j,aH as X,aO as _,aM as J,aQ as Z,cA as tt,aN as et,o as st,a0 as at,e as nt,x as G,c8 as rt,j as L,_ as it,E as z,G as N,cB as lt,T as ot,aF as dt,bf as ct,bd as ut,aX as pt,a7 as mt,W as vt,d as ht,Y as gt,bR as bt,bT as ft,O as yt}from"./portal-core.js";import"./vendor-icons.js";let u,y,T=[],S=0;const R=()=>q();Q({id:"student-progress",portal:"student",watch:["attendanceSessions","assignments","submissions","exams","marks","enrollments","batches","settings"],mount(t){u=t,xt(),Mt(),H(),window.addEventListener("om-portal:theme",R)},update:()=>H(),unmount(){window.removeEventListener("om-portal:theme",R),K(),y==null||y.destroy()}});const m=()=>u.user.id,M=()=>(G("settings").attendance||{}).minPct??75,D=t=>String((t==null?void 0:t.title)||"Course").split(" — ")[0],E=t=>t.length?t.reduce((e,n)=>e+n,0)/t.length:null,$=t=>t==null?null:Math.round(t*10)/10,$t=t=>"pct-"+Math.max(0,Math.min(100,Math.round((Number(t)||0)/5)*5));function O(){return mt(m(),{publishedOnly:!0}).map(t=>{const e=vt(t.id,m()),n=ht("courses",t.courseId),s=e&&!e.absent&&e.marks!=null?e.marks/t.maxMarks*100:null,a=e?e.absent?"absent":e.marks>=(t.passMarks??0)?"pass":"fail":"pending";return{id:t.id,title:t.title,cycle:t.cycle,courseId:t.courseId,course:(n==null?void 0:n.title)||"—",courseShort:D(n),date:t.date,marks:e&&!e.absent?e.marks:null,absent:!!(e!=null&&e.absent),maxMarks:t.maxMarks,pct:s,grade:s==null?"—":gt(s).grade,result:a}})}function F(t){const e=L(),n={onTime:0,late:0,missing:0,upcoming:0,scores:[]};for(const s of bt(m())){if(t&&s.courseId!==t)continue;const a=ft(s.id,m());a?(a.late?n.late++:n.onTime++,a.status==="graded"&&a.marks!=null&&n.scores.push(a.marks/s.maxMarks*100)):yt(s.dueAt)<e?n.missing++:n.upcoming++}return n}function kt(t=6){const e=[],n=N(m());for(let s=t-1;s>=0;s--){const a=ct(ut(L(),-s));let l=0,i=0;for(const r of n)for(const p of pt(r.id,{from:a+"-01",to:a+"-31"})){const h=p.records[m()];!h||h==="E"||(i++,(h==="P"||h==="L")&&l++)}e.push({key:a,pct:i?$(l/i*100):null})}return e}const P=["Exams","Assignments","Attendance","On-time work","Syllabus covered"];function B(){const t=O();return N(m()).map(e=>{const n=ot(e),s=F(e.courseId),a=s.onTime+s.late+s.missing,l=E(t.filter(i=>i.courseId===e.courseId&&i.pct!=null).map(i=>i.pct));return{batch:e,course:n,name:D(n),values:{Exams:$(l),Assignments:$(E(s.scores)),Attendance:z(m(),e.id).pct,"On-time work":a?$(s.onTime/a*100):null,"Syllabus covered":dt(e)}}})}function Y(){const t=O(),e=it(m()),n=$(E(t.filter(i=>i.pct!=null).map(i=>i.pct))),s=z(m()),a=N(m()).map(i=>lt(m(),i.id)).filter(i=>i!=null),l=a.length?Math.max(...a):null;return{rows:t,gpa:e,overall:n,att:s,percentile:l}}function U(t,e){const n=[],s=[];for(const a of t)for(const l of P){const i=a.values[l];if(i==null||l==="Syllabus covered")continue;const r={label:l,course:a.name,value:i};i>=75?n.push(r):(i<65||l==="Attendance"&&i<M())&&s.push(r)}for(const a of e.rows)a.result==="fail"&&s.push({label:"Failed: "+a.cycle,course:a.courseShort,value:a.pct??0}),a.result==="absent"&&s.push({label:"Missed: "+a.cycle,course:a.courseShort,value:0});return n.sort((a,l)=>l.value-a.value),s.sort((a,l)=>a.value-l.value),{strengths:n.slice(0,5),improve:s.slice(0,5)}}function xt(){u.root.innerHTML=d`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Progress Reports</li></ol>
        <h1 class="page-title">Progress Reports</h1>
        <p class="page-subtitle">Your grades, attendance and coursework at a glance.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-outline" href="student-exams.html">${c(f("GraduationCap",{size:16}))}Exams &amp; results</a>
        <button type="button" class="btn btn-primary" data-act="report">${c(f("Printer",{size:16}))}Download progress report</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="grid grid-2 page-section">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Attendance trend</h3><p class="card-subtitle">Monthly attendance, last 6 months</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="trend"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Marks by exam</h3><p class="card-subtitle">Percentage scored in each published exam</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="marks"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Performance by course</h3><p class="card-subtitle">Exams, assignments, attendance, punctuality and syllabus (%)</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="radar"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Assignment completion</h3><p class="card-subtitle" data-asg-sub></p></div></div>
        <div class="card-body"><div class="chart-box" data-chart="donut"></div></div>
      </div>
    </div>
    <div class="grid grid-2 page-section">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Strengths</h3><p class="card-subtitle">Where you're scoring 75% or more</p></div><span class="icon-tile icon-tile-sm tone-green">${c(f("TrendingUp",{size:16}))}</span></div>
        <div data-strengths></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Areas to improve</h3><p class="card-subtitle">Below 65%, below the attendance minimum, or missed</p></div><span class="icon-tile icon-tile-sm tone-amber">${c(f("Target",{size:16}))}</span></div>
        <div data-improve></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div><h3 class="card-title">Results</h3><p class="card-subtitle">All published exam results</p></div></div>
      <div data-results></div>
    </div>`,y=V(b("[data-results]",u.root),{rows:[],searchKeys:["title","course"],filters:[{key:"result",label:"Result",options:[["pass","Pass"],["fail","Fail"],["absent","Absent"]]}],columns:[{key:"title",label:"Exam",sortable:!0,render:t=>d`<div class="cell-user-text"><span class="cell-title">${t.cycle||t.title}</span><span class="cell-sub">${t.course}</span></div>`},{key:"date",label:"Date",sortable:!0,hideBelow:"md",render:t=>C(t.date)},{key:"marks",label:"Marks",sortable:!0,align:"right",render:t=>d`<span class="tabular">${t.absent?"AB":t.marks==null?"—":`${t.marks} / ${t.maxMarks}`}</span>`},{key:"pct",label:"%",sortable:!0,align:"right",render:t=>d`<span class="tabular fw-600">${t.pct==null?"—":v(t.pct,1)}</span>`},{key:"grade",label:"Grade",render:t=>d`<span class="badge tone-${c(t.pct==null?"slate":t.pct>=75?"green":t.pct>=50?"blue":t.pct>=35?"amber":"rust")}">${t.grade}</span>`},{key:"result",label:"Result",render:t=>wt(t.result)}],rowActions:[{label:"View in Exams",icon:"Eye",onClick:t=>window.location.href="student-exams.html?id="+encodeURIComponent(t.id)}],empty:g({icon:"GraduationCap",title:"No published results yet",text:"Results show here as soon as your exams are published."})})}function wt(t){const e={pass:["green","Pass"],fail:["rust","Fail"],absent:["amber","Absent"],pending:["slate","Pending"]},[n,s]=e[t]||e.pending;return d`<span class="badge tone-${c(n)}">${s}</span>`}function H(){const t=Y(),e=M();b("[data-kpis]",u.root).innerHTML=[k({icon:"Award",label:"GPA (10-point scale)",value:t.gpa==null?"—":t.gpa.toFixed(2),tone:"blue"}),k({icon:"Target",label:"Overall exam score",value:t.overall==null?"—":v(t.overall,1),tone:t.overall==null?"slate":t.overall>=60?"green":"amber"}),k({icon:"CalendarCheck",label:`Attendance (min ${e}%)`,value:v(t.att.pct,1),tone:t.att.pct>=e?"green":t.att.pct>=e-10?"amber":"rust",href:"student-attendance.html"}),k({icon:"TrendingUp",label:"Batch percentile (anonymous)",value:t.percentile==null?"—":j(t.percentile),tone:"purple"})].join("");const n=B(),s=U(n,t);b("[data-strengths]",u.root).innerHTML=I(s.strengths,"green","TrendingUp",{icon:"Sparkles",title:"Keep going",text:"Strengths appear once you score 75% or more in an area."}),b("[data-improve]",u.root).innerHTML=I(s.improve,"amber","Target",{icon:"CircleCheck",title:"Nothing flagged",text:"No area is below 65% right now. Nice work!"}),y.update(t.rows),q()}function I(t,e,n,s){return t.length?d`<ul class="list-plain">${c(t.map(a=>d`
          <li class="list-row">
            <span class="icon-tile icon-tile-sm tone-${c(e)}">${c(f(n,{size:16}))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${a.label}</div>
              <div class="list-row-sub">${a.course}</div>
              <div class="progress progress-sm tone-${c(e)} prog-bar"><span class="progress-bar ${c($t(a.value))}"></span></div>
            </div>
            <span class="prog-value">${v(a.value,0)}</span>
          </li>`).join(""))}</ul>`:d`<div class="card-body">${c(g(s))}</div>`}function K(){T.forEach(t=>t.then(e=>e==null?void 0:e.destroy()).catch(()=>{})),T=[]}function x(t){const e=b(`[data-chart="${t}"]`,u.root);return e.innerHTML="",e}function w(t,e){const n=S;T.push(t.then(s=>n===S?s:(s==null||s.destroy(),null)).catch(s=>(console.error(s),e.innerHTML=d`<p class="text-muted text-sm m-0">This chart couldn't load. Try reloading the page.</p>`,null)))}function q(){K(),S++;const t=X(),e=M(),n=kt(6),s=x("trend");n.every(o=>o.pct==null)?s.innerHTML=g({icon:"CalendarCheck",title:"No attendance yet",text:"Your monthly trend appears once classes are marked."}):w(_(s,{series:[{name:"Attendance",data:n.map(o=>o.pct)},{name:`Minimum (${e}%)`,data:n.map(()=>e)}],categories:n.map(o=>J(o.key+"-01")),colors:[t.primary,t.danger],yFormatter:o=>o==null?"—":Math.round(o)+"%",height:250}),s);const a=O().filter(o=>o.pct!=null),l=x("marks");a.length?w(Z(l,{series:[{name:"Score",data:a.map(o=>Math.round(o.pct))}],categories:a.map(o=>`${o.cycle} · ${o.courseShort}`),colors:[t.primary],yFormatter:o=>Math.round(o)+"%",height:250}),l):l.innerHTML=g({icon:"ChartColumn",title:"No marks yet",text:"Published exam marks will be charted here."});const i=B(),r=x("radar");i.length?w(tt(r,{series:i.map(o=>({name:o.name,data:P.map(W=>Math.round(o.values[W]??0))})),categories:P,colors:t.series,height:280}),r):r.innerHTML=g({icon:"ChartPie",title:"No active courses",text:"Enrol in a course to see your performance profile."});const p=F(),h=p.onTime+p.late+p.missing+p.upcoming;b("[data-asg-sub]",u.root).textContent=h?`${h} assignments · ${p.onTime+p.late} submitted`:"No assignments yet";const A=x("donut");h?w(et(A,{series:[p.onTime,p.late,p.missing,p.upcoming],labels:["On time","Late","Missing","Not yet due"],colors:[t.success,t.warning,t.danger,t.slate],centerLabel:"Assignments",height:260}),A):A.innerHTML=g({icon:"ClipboardList",title:"No assignments yet",text:"Your submission record appears here."})}function Mt(){st(u.root,"click",'[data-act="report"]',()=>{try{at("Progress report — "+u.user.name,At())}catch(t){console.error(t),nt("Couldn't prepare the progress report. Please try again.",{type:"danger"})}})}function At(){const t=Y(),e=B(),n=U(e,t),s=F(),a=G("settings").institution||{name:"OM Academy"},l=rt(u.user),i=r=>r==null?"—":v(r,0);return d`
    <div class="print-sheet">
      <div class="print-head">
        <div class="print-brand">
          <span class="print-mark">OM</span>
          <div>
            <div class="print-org">${a.name}</div>
            ${a.address?d`<div class="print-org-sub">${a.address}</div>`:c("")}
            <div class="print-org-sub">${[a.phone,a.email].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div class="print-doc">
          <div class="print-doc-title">Progress report</div>
          <div class="print-meta">Generated ${C(L())}</div>
        </div>
      </div>
      <div class="print-grid">
        <div>
          <div class="print-label">Student</div>
          <div><strong>${u.user.name}</strong></div>
          ${u.user.rollNo?d`<div>Roll no. ${u.user.rollNo}</div>`:c("")}
          ${u.user.email?d`<div>${u.user.email}</div>`:c("")}
          ${l?d`<div>${l.name}</div>`:c("")}
        </div>
        <div>
          <div class="print-label">Summary</div>
          <div>GPA: <strong>${t.gpa==null?"—":t.gpa.toFixed(2)}</strong> / 10</div>
          <div>Overall exam score: <strong>${t.overall==null?"—":v(t.overall,1)}</strong></div>
          <div>Attendance: <strong>${v(t.att.pct,1)}</strong> (minimum ${M()}%)</div>
          <div>Batch percentile: <strong>${t.percentile==null?"—":j(t.percentile)}</strong></div>
        </div>
      </div>
      <table class="print-table">
        <thead><tr><th>Course</th><th class="num">Exams</th><th class="num">Assignments</th><th class="num">Attendance</th><th class="num">On-time work</th><th class="num">Syllabus</th></tr></thead>
        <tbody>${c(e.length?e.map(r=>{var p;return d`<tr><td>${((p=r.course)==null?void 0:p.title)||r.name}</td><td class="num">${i(r.values.Exams)}</td><td class="num">${i(r.values.Assignments)}</td><td class="num">${i(r.values.Attendance)}</td><td class="num">${i(r.values["On-time work"])}</td><td class="num">${i(r.values["Syllabus covered"])}</td></tr>`}).join(""):d`<tr><td colspan="6">No active courses.</td></tr>`)}</tbody>
      </table>
      <table class="print-table">
        <thead><tr><th>Examination</th><th>Date</th><th class="num">Marks</th><th class="num">%</th><th>Grade</th><th>Result</th></tr></thead>
        <tbody>${c(t.rows.length?t.rows.map(r=>d`<tr><td>${r.title}</td><td>${C(r.date)}</td><td class="num">${r.absent?"AB":r.marks==null?"—":`${r.marks} / ${r.maxMarks}`}</td><td class="num">${r.pct==null?"—":v(r.pct,1)}</td><td>${r.grade}</td><td>${r.result==="pass"?"Pass":r.result==="fail"?"Fail":r.result==="absent"?"Absent":"Pending"}</td></tr>`).join(""):d`<tr><td colspan="6">No published results yet.</td></tr>`)}</tbody>
      </table>
      <div class="print-grid">
        <div>
          <div class="print-label">Assignments</div>
          <div>On time: <strong>${s.onTime}</strong> · Late: <strong>${s.late}</strong> · Missing: <strong>${s.missing}</strong> · Not yet due: <strong>${s.upcoming}</strong></div>
          <div>Attendance: ${t.att.present} present (incl. ${t.att.late} late), ${t.att.absent} absent, ${t.att.excused} excused</div>
        </div>
        <div>
          <div class="print-label">Strengths</div>
          <div>${n.strengths.length?n.strengths.map(r=>`${r.label} (${r.course}) ${v(r.value,0)}`).join("; "):"—"}</div>
          <div class="print-label">Areas to improve</div>
          <div>${n.improve.length?n.improve.map(r=>`${r.label} (${r.course}) ${v(r.value,0)}`).join("; "):"None flagged"}</div>
        </div>
      </div>
      <div class="print-sign"><div>Class teacher</div><div>Center director</div></div>
      <div class="print-foot">Computer-generated progress report from the OM Academy portal. Batch percentile is anonymous and based on published results.</div>
    </div>`}

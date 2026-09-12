import"./modulepreload-polyfill.js";/* empty css      */import{b as B,r as i,h as d,i as u,c7 as V,c8 as W,q as l,w as F,j as v,l as y,H as z,a as $,p as j,ar as Y,aT as K,O as p,f as g,aV as w,d as T,c9 as I,a6 as x,M as X,m as Q,al as J,Y as Z,aS as _,bX as ee,aH as te,ca as se,o as E,B as G,cb as U,e as ae,N as ne,x as ie,aa as de,bR as oe,bS as re,a7 as O,cc as le,v as ce,W as ue}from"./portal-core.js";import"./vendor-icons.js";let o,k=[],N=0,C="";const R=()=>{C="",A()};B({id:"student-dashboard",portal:"student",watch:["attendanceSessions","assignments","submissions","exams","marks","invoices","payments","announcements","notifications","timetableSlots","enrollments","events","settings"],mount(e){o=e,be(),Te(),A(),window.addEventListener("om-portal:theme",R)},update:()=>A(),unmount(){window.removeEventListener("om-portal:theme",R),P()}});const me=()=>String(o.user.name||"there").trim().split(/\s+/)[0],L=()=>(ie("settings").attendance||{}).minPct??75,he=e=>String((e==null?void 0:e.title)||"Course").split(" — ")[0];function pe(){const e=w().getHours();return e<12?"Good morning":e<17?"Good afternoon":"Good evening"}function D(e){const s=L();return e>=s?"green":e>=s-10?"amber":"rust"}function ve(e){return e>=75?"green":e>=50?"blue":e>=35?"amber":"rust"}function be(){o.root.innerHTML=d`
    <div data-welcome></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="grid grid-main-side page-section">
      <div class="stack">
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Today's classes</h3><p class="card-subtitle" data-today-sub></p></div><a class="btn btn-ghost btn-sm" href="student-courses.html">Full timetable</a></div>
          <div data-today></div>
        </div>
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Upcoming deadlines</h3><p class="card-subtitle">Assignments and exams in the next 14 days</p></div><a class="btn btn-ghost btn-sm" href="student-calendar.html">Calendar</a></div>
          <div data-deadlines></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-header"><div><h3 class="card-title">Attendance</h3><p class="card-subtitle" data-att-sub></p></div><a class="btn btn-ghost btn-sm" href="student-attendance.html">Details</a></div>
          <div class="card-body">
            <div class="chart-box-sm" data-chart-att></div>
            <div data-att-stats></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Quick links</h3></div>
          <div class="card-body">
            <div class="dash-quick">
              ${i(f("student-fees.html","Wallet","Pay fees","amber"))}
              ${i(f("student-assignments.html","Upload","Submit assignment","purple"))}
              ${i(f("student-courses.html","CalendarClock","Timetable","blue"))}
              ${i(f("student-resources.html","FolderOpen","Resources","green"))}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Announcements</h3><p class="card-subtitle" data-ann-sub></p></div><a class="btn btn-ghost btn-sm" href="student-notifications.html">View all</a></div>
        <div data-announcements></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Recent grades</h3><p class="card-subtitle">Graded assignments and published exam results</p></div><a class="btn btn-ghost btn-sm" href="student-progress.html">Progress</a></div>
        <div data-grades></div>
      </div>
    </div>`}function f(e,s,t,a){return d`<a class="dash-quick-link" href="${e}"><span class="icon-tile icon-tile-sm tone-${i(a)}">${i(u(s,{size:16}))}</span><span>${t}</span></a>`}function A(){const e=V(o.user);ge(e),$e(e),fe(e.todaySessions),we(),xe(),Ce(),Ae(e.attendance)}function ge(e){const s=W(o.user);l("[data-welcome]",o.root).innerHTML=d`
    <div class="welcome-card page-section">
      <div class="dash-welcome-main">
        <h2>${pe()}, ${me()}</h2>
        <p>${F(v())}, ${y(v())} · ${(s==null?void 0:s.name)||"OM Academy"}</p>
        ${e.batches.length?d`<div class="dash-welcome-chips">${i(e.batches.map(t=>d`<span class="dash-welcome-chip">${t.name}</span>`).join(""))}</div>`:i("")}
      </div>
      <div class="dash-welcome-actions">
        <a class="btn dash-welcome-btn" href="student-assignments.html">${i(u("ClipboardList",{size:16}))}Assignments</a>
        <a class="btn dash-welcome-btn" href="student-calendar.html">${i(u("CalendarDays",{size:16}))}Calendar</a>
      </div>
    </div>`}function $e(e){const s=e.attendance;let t="None",a="slate";if(e.nextExam){const n=z(e.nextExam.date,v());t=n===0?"Today":n===1?"Tomorrow":`${n} days`,a=n<=7?"amber":"blue"}l("[data-kpis]",o.root).innerHTML=[$({icon:"CalendarCheck",label:`Attendance (min ${L()}%)`,value:j(s.pct,1),tone:D(s.pct),href:"student-attendance.html"}),$({icon:"ClipboardList",label:"Pending assignments",value:String(e.pendingAssignments),tone:e.pendingAssignments?"purple":"slate",href:"student-assignments.html"}),$({icon:"GraduationCap",label:e.nextExam?"Next exam in":"Next exam",value:t,tone:a,href:e.nextExam?`student-exams.html?id=${encodeURIComponent(e.nextExam.id)}`:"student-exams.html"}),$({icon:"Wallet",label:e.fees.overdue?"Fee balance (overdue)":"Fee balance",value:Y(e.fees.balance),tone:e.fees.overdue?"rust":e.fees.balance?"amber":"green",href:"student-fees.html"})].join("")}function fe(e){const s=v(),t=K(o.user).find(r=>r.type==="holiday"&&p(r.start)<=s&&p(r.end||r.start)>=s),a=l("[data-today-sub]",o.root),n=l("[data-today]",o.root);if(a.textContent=`${F(s)} · ${e.length===1?"1 class":e.length+" classes"}`,t){n.innerHTML=d`<div class="card-body">${i(g({icon:"CalendarX",title:t.title,text:"The academy is closed today. Enjoy the holiday!"}))}</div>`;return}if(!e.length){n.innerHTML=d`<div class="card-body">${i(g({icon:"Calendar",title:"No classes today",text:"Use the free time to revise or catch up on assignments."}))}</div>`;return}const c=w().getHours()*60+w().getMinutes();n.innerHTML=d`<ul class="list-plain">${i(e.map(r=>{var M,H,S;const h=T("users",r.instructorId),b=c>=I(r.end)?"done":c>=I(r.start)?"now":"next",m=b==="now"?d`<span class="badge tone-green">In progress</span>`:b==="done"?d`<span class="badge tone-slate">Done</span>`:d`<span class="badge tone-blue">Upcoming</span>`;return d`
          <li class="list-row ${i(b==="now"?"is-now":"")}">
            <div class="dash-time"><div class="dash-time-start">${x(r.start)}</div><div class="dash-time-end">${x(r.end)}</div></div>
            <span class="icon-tile icon-tile-sm tone-${i(((M=r.course)==null?void 0:M.tone)||"blue")}">${i(u("BookOpen",{size:16}))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${((H=r.course)==null?void 0:H.title)||"Class"}</div>
              <div class="list-row-sub">${[r.room?"Room "+r.room:null,h==null?void 0:h.name].filter(Boolean).join(" · ")||((S=r.batch)==null?void 0:S.name)||""}</div>
            </div>
            ${m}
          </li>`}).join(""))}</ul>`}function ye(){const e=o.user.id,s=v(),t=de(s,14),a=[];for(const n of oe(e)){const c=re(n,e);if(!["pending","overdue-allowed"].includes(c)||p(n.dueAt)>t)continue;const r=T("courses",n.courseId);a.push({kind:"Assignment",icon:"ClipboardList",tone:c==="overdue-allowed"?"rust":"purple",title:n.title,sub:`${he(r)} · due ${y(n.dueAt)}`,when:n.dueAt,overdue:c==="overdue-allowed",href:`student-assignments.html?id=${encodeURIComponent(n.id)}`})}for(const n of O(e))n.date<s||n.date>t||a.push({kind:"Exam",icon:"GraduationCap",tone:"amber",title:n.title,sub:`${y(n.date)} · ${x(n.start)}${n.room?" · Room "+n.room:""}`,when:n.date,overdue:!1,href:`student-exams.html?id=${encodeURIComponent(n.id)}`});return a.sort((n,c)=>p(n.when).localeCompare(p(c.when)))}function we(){const e=ye(),s=l("[data-deadlines]",o.root);if(!e.length){s.innerHTML=d`<div class="card-body">${i(g({icon:"CircleCheck",title:"You're all caught up",text:"No assignments or exams due in the next two weeks."}))}</div>`;return}s.innerHTML=d`<ul class="list-plain">${i(e.slice(0,6).map(t=>d`
          <li><a class="list-row" href="${t.href}">
            <span class="icon-tile icon-tile-sm tone-${i(t.tone)}">${i(u(t.icon,{size:16}))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${t.title}</div>
              <div class="list-row-sub">${t.kind} · ${t.sub}</div>
            </div>
            <span class="badge tone-${i(t.overdue?"rust":z(p(t.when),v())<=2?"amber":"slate")}">${X(t.when)}</span>
          </a></li>`).join(""))}</ul>`}function q(){return le(o.user).filter(e=>e.kind==="announcement")}function xe(){const e=q(),s=e.filter(a=>!a.readAt).length;l("[data-ann-sub]",o.root).textContent=s?`${s} unread`:"You're up to date";const t=l("[data-announcements]",o.root);if(!e.length){t.innerHTML=d`<div class="card-body">${i(g({icon:"Megaphone",title:"No announcements",text:"Notices from the academy will appear here."}))}</div>`;return}t.innerHTML=d`<ul class="list-plain">${i(e.slice(0,5).map(a=>d`
          <li class="list-row ${i(a.readAt?"":"is-unread")}">
            <span class="icon-tile icon-tile-sm tone-${i(a.priority==="high"||a.priority==="urgent"?"rust":"blue")}">${i(u("Megaphone",{size:16}))}</span>
            <button type="button" class="list-row-main dash-ann-open" data-ann-open="${a.id}">
              <span class="list-row-title">${a.title}</span>
              <span class="list-row-sub">${Q(a.createdAt)} · ${J(a.body,80)}</span>
            </button>
            ${a.readAt?i(""):d`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-ann-read="${a.id}" aria-label="Mark as read" title="Mark as read">${i(u("Check",{size:15}))}</button>`}
          </li>`).join(""))}</ul>`}function ke(){const e=o.user.id,s=[];for(const t of ce("submissions",a=>a.studentId===e&&a.status==="graded")){const a=T("assignments",t.assignmentId);a&&s.push({kind:"Assignment",icon:"ClipboardList",title:a.title,marks:t.marks,max:a.maxMarks,at:t.gradedAt||t.submittedAt,href:`student-assignments.html?id=${encodeURIComponent(a.id)}`})}for(const t of O(e,{publishedOnly:!0})){const a=ue(t.id,e);a&&s.push({kind:"Exam",icon:"GraduationCap",title:t.title,marks:a.absent?null:a.marks,absent:a.absent,max:t.maxMarks,at:t.publishedAt||t.date,href:`student-exams.html?id=${encodeURIComponent(t.id)}`})}return s.sort((t,a)=>String(a.at).localeCompare(String(t.at)))}function Ce(){const e=ke(),s=l("[data-grades]",o.root);if(!e.length){s.innerHTML=d`<div class="card-body">${i(g({icon:"Award",title:"No grades yet",text:"Grades appear here once your work is marked."}))}</div>`;return}s.innerHTML=d`<ul class="list-plain">${i(e.slice(0,6).map(t=>{const a=t.marks==null?null:t.marks/t.max*100,n=a==null?null:Z(a);return d`
          <li><a class="list-row" href="${t.href}">
            <span class="icon-tile icon-tile-sm tone-${i(t.kind==="Exam"?"amber":"purple")}">${i(u(t.icon,{size:16}))}</span>
            <div class="list-row-main">
              <div class="list-row-title">${t.title}</div>
              <div class="list-row-sub">${t.kind} · ${_(t.at)}</div>
            </div>
            <div class="dash-row-end">
              <span class="fw-600 text-title tabular">${t.absent?"Absent":`${t.marks}/${t.max}`}</span>
              ${n?d`<span class="badge tone-${i(ve(a))}">${n.grade}</span>`:d`<span class="badge tone-slate">—</span>`}
            </div>
          </a></li>`}).join(""))}</ul>`}function Ae(e){const s=D(e.pct),t=L(),a=ee(o.user.id);l("[data-att-sub]",o.root).textContent=`${e.total} classes marked · minimum ${t}%`,l("[data-att-stats]",o.root).innerHTML=d`
    <div class="dash-att-stats">
      <div class="dash-att-stat"><strong>${e.present-e.late}</strong><span>Present</span></div>
      <div class="dash-att-stat"><strong>${e.late}</strong><span>Late</span></div>
      <div class="dash-att-stat"><strong>${e.absent}</strong><span>Absent</span></div>
      <div class="dash-att-stat"><strong>${e.excused}</strong><span>Excused</span></div>
    </div>
    ${e.pct<t?d`<div class="alert tone-rust dash-att-alert">${i(u("TriangleAlert",{size:18}))}<div class="alert-body">Below the ${t}% minimum.${a?` Attend the next ${a} classes to get back on track.`:""}</div></div>`:i("")}`;const n=`${e.pct}|${s}`;if(n===C)return;C=n,P();const c=++N,r=l("[data-chart-att]",o.root);r.innerHTML="";const h=te(),b=s==="green"?h.success:s==="amber"?h.warning:h.danger;k.push(se(r,{series:[e.pct],labels:["Attendance"],colors:[b],height:220}).then(m=>c===N?m:(m==null||m.destroy(),null)).catch(m=>(console.error(m),r.innerHTML=d`<p class="text-muted text-sm m-0">The chart couldn't load. Your attendance is ${j(e.pct,1)}.</p>`,null)))}function P(){k.forEach(e=>e.then(s=>s==null?void 0:s.destroy()).catch(()=>{})),k=[]}function Te(){E(o.root,"click","[data-ann-read]",(e,s)=>{G(()=>U(o.user,s.dataset.annRead),{success:"Marked as read",error:"Couldn't mark it as read"})}),E(o.root,"click","[data-ann-open]",(e,s)=>Le(s.dataset.annOpen))}function Le(e){const s=q().find(n=>n.id===e);if(!s){ae("That announcement couldn't be found — it may have expired.",{type:"warning"});return}const t=s.priority==="high"||s.priority==="urgent",a=ne.open({title:s.title,size:"md",body:d`
      <div class="cluster section-gap">
        <span class="badge tone-${i(t?"rust":"blue")}">${t?"Important":"Announcement"}</span>
        <span class="text-muted text-sm">${y(s.createdAt)}</span>
      </div>
      <p class="dash-ann-body m-0">${s.body||""}</p>`,footer:d`<a class="btn btn-outline" href="student-notifications.html">All notifications</a><button type="button" class="btn btn-primary" data-m="close">Close</button>`});a.root.querySelector('[data-m="close"]').addEventListener("click",a.close),s.readAt||G(()=>U(o.user,s.id),{error:"Couldn't mark it as read"})}

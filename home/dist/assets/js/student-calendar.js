import"./modulepreload-polyfill.js";/* empty css      */import{b as V,bl as j,r as c,i as I,h as p,q as D,f as q,c3 as M,O as b,w as F,bk as J,o as S,A as K,e as Q,s as E,d as f,z as Z,bS as _,l as x,M as O,T as B,N as tt,c4 as et,aa as G,j as U,aV as at,a6 as k,G as st,v as nt,a5 as ot}from"./portal-core.js";import"./vendor-icons.js";const g=[{id:"class",label:"Classes",one:"Class",tone:"green",icon:"BookOpen"},{id:"exam",label:"Exams",one:"Exam",tone:"amber",icon:"GraduationCap"},{id:"deadline",label:"Deadlines",one:"Deadline",tone:"purple",icon:"ClipboardList"},{id:"event",label:"Events",one:"Event",tone:"blue",icon:"Megaphone"},{id:"holiday",label:"Holidays",one:"Holiday",tone:"rust",icon:"CalendarX"}],$=t=>g.some(e=>e.id===t.type)?t.type:"event",P=t=>g.find(e=>e.id===$(t));let r,i=null,T=0,v;const h=new Set(g.map(t=>t.id)),H=()=>Y();V({id:"student-calendar",portal:"student",watch:["events","assignments","submissions","exams","timetableSlots","enrollments","batches","settings"],async mount(t){r=t,v=window.matchMedia("(max-width: 640px)"),rt(),ct(),z(),await Y(),v.addEventListener("change",H);const e=t.params.get("id");e&&A(e)},update:()=>{z(),i&&(i.getEventSources().forEach(t=>t.remove()),i.addEventSource(w().map(j)))},unmount(){v==null||v.removeEventListener("change",H),T++,i==null||i.destroy(),i=null}});const dt=t=>String((t==null?void 0:t.title)||"Course").split(" — ")[0];function lt(t){const e=[],s=st(r.user.id),n=nt("timetableSlots",d=>s.some(u=>u.id===d.batchId)),o=U();for(let d=0;d<56;d++){const u=G(o,d);if(t.has(u))continue;const y=ot(u);for(const a of n){if(a.weekday!==y)continue;const l=s.find(C=>C.id===a.batchId),m=B(l);e.push({id:`cls-${a.id}-${u}`,title:dt(m)+" class",type:"class",start:`${u}T${a.start}`,end:`${u}T${a.end}`,allDay:!1,slotId:a.id,batchId:a.batchId})}}return e}function L(){const t=et(r.user),e=new Set;for(const s of t)if(s.type==="holiday")for(let n=b(s.start);n<=b(s.end||s.start);n=G(n,1))e.add(n);return[...t,...lt(e)]}const w=()=>L().filter(t=>h.has($(t))),R=t=>M(t.allDay||/^\d{4}-\d{2}-\d{2}$/.test(t.start)?b(t.start):t.start).getTime();function it(t,e=10){const s=U(),n=at().getTime();return t.filter(o=>o.allDay||/^\d{4}-\d{2}-\d{2}$/.test(o.start)?b(o.end||o.start)>=s:M(o.end||o.start).getTime()>=n).sort((o,d)=>R(o)-R(d)).slice(0,e)}function W(t){return t.allDay||/^\d{4}-\d{2}-\d{2}$/.test(t.start)?"All day":t.end?`${k(t.start)} – ${k(t.end)}`:k(t.start)}function rt(){r.root.innerHTML=p`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Event Calendar</li></ol>
        <h1 class="page-title">Event Calendar</h1>
        <p class="page-subtitle">Classes, exams, deadlines, events and holidays in one place.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-outline" href="student-courses.html">${c(I("CalendarClock",{size:16}))}Weekly timetable</a>
      </div>
    </div>
    <div class="card page-section">
      <div class="card-body cal-toolbar">
        <div class="cal-legend" role="group" aria-label="Show event types" data-filters></div>
        <button type="button" class="btn btn-ghost btn-sm" data-act="all">Show all</button>
      </div>
    </div>
    <div class="grid grid-main-side">
      <div class="card">
        <div class="card-body"><div data-cal></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Coming up</h3><p class="card-subtitle">Next 10 items</p></div></div>
        <div data-agenda></div>
      </div>
    </div>`}function z(){const t=L();D("[data-filters]",r.root).innerHTML=g.map(e=>p`<button type="button" class="chip cal-legend-item cal-filter" data-type="${e.id}" aria-pressed="${h.has(e.id)?"true":"false"}"><span class="dot tone-${c(e.tone)}"></span>${e.label}<span class="cal-filter-count">${t.filter(s=>$(s)===e.id).length}</span></button>`).join(""),X(t.filter(e=>h.has($(e))))}function X(t){const e=it(t),s=D("[data-agenda]",r.root);if(!e.length){s.innerHTML=p`<div class="card-body">${c(q({icon:"CalendarDays",title:"Nothing coming up",text:h.size<g.length?"Try showing more event types.":"No upcoming items on your calendar."}))}</div>`;return}s.innerHTML=p`<ul class="list-plain">${c(e.map(n=>{const o=P(n),d=M(b(n.start));return p`
          <li><button type="button" class="list-row cal-agenda-row" data-open="${n.id}">
            <span class="cal-agenda-date tone-${c(o.tone)}"><strong>${d.getDate()}</strong><span>${d.toLocaleString("en-IN",{month:"short"})}</span></span>
            <span class="list-row-main">
              <span class="list-row-title">${n.title}</span>
              <span class="list-row-sub">${o.one} · ${F(b(n.start)).slice(0,3)} · ${W(n)}</span>
            </span>
            ${c(I("ChevronRight",{size:16,cls:"text-muted"}))}
          </button></li>`}).join(""))}</ul>`}async function Y(){const t=++T;i==null||i.destroy(),i=null;const e=D("[data-cal]",r.root);e.innerHTML="";try{const s=await J(e,{events:w(),onEventClick:n=>A(n.id),mobile:v.matches});if(t!==T){s.destroy();return}i=s}catch(s){console.error(s),e.innerHTML=q({icon:"CalendarX",title:"The calendar couldn't load",text:"Check your connection and reload the page. The agenda still lists what's coming up."})}}function ct(){S(r.root,"click",".cal-filter",(t,e)=>{const s=e.dataset.type;h.has(s)?h.delete(s):h.add(s),N()}),S(r.root,"click",'[data-act="all"]',()=>{g.forEach(t=>h.add(t.id)),N()}),S(r.root,"click","[data-open]",(t,e)=>A(e.dataset.open))}function N(){K(".cal-filter",r.root).forEach(t=>t.setAttribute("aria-pressed",String(h.has(t.dataset.type)))),X(w()),i&&(i.getEventSources().forEach(t=>t.remove()),i.addEventSource(w().map(j)))}function A(t){var y;const e=L().find(a=>a.id===t);if(!e){Q("That calendar item couldn't be found — it may have been removed.",{type:"warning"}),E("id",null);return}E("id",t);const s=P(e),n=[];let o=null,d=e.description||"";if(e.type==="exam"){const a=f("exams",t.replace(/^ex-/,"")),l=f("courses",a==null?void 0:a.courseId);n.push(["Course",(l==null?void 0:l.title)||"—"],["Room",(a==null?void 0:a.room)||"—"],["Max marks",a?String(a.maxMarks):"—"],["Status",a?Z(a.status):"—"]),a&&(o={href:`student-exams.html?id=${encodeURIComponent(a.id)}`,label:"Open in Exams"}),d=d||"Report 30 minutes early with your admit card and photo ID."}else if(e.type==="deadline"){const a=f("assignments",t.replace(/^dl-/,"")),l=f("courses",a==null?void 0:a.courseId),m=a?_(a,r.user.id):null,C={graded:"Graded",submitted:"Submitted",pending:"Not submitted",overdue:"Overdue (closed)","overdue-allowed":"Overdue — late submission allowed"};n.push(["Course",(l==null?void 0:l.title)||"—"],["Due",a?`${x(a.dueAt)} · ${O(a.dueAt)}`:"—"],["Max marks",a?String(a.maxMarks):"—"],["Your status",C[m]||"—"]),a&&(o={href:`student-assignments.html?id=${encodeURIComponent(a.id)}`,label:m==="pending"||m==="overdue-allowed"?"Submit assignment":"Open assignment"}),d=d||(a==null?void 0:a.description)||""}else if(e.type==="class"){const a=f("timetableSlots",e.slotId),l=f("batches",e.batchId),m=f("users",a==null?void 0:a.instructorId);n.push(["Course",((y=B(l))==null?void 0:y.title)||"—"],["Batch",(l==null?void 0:l.name)||"—"],["Room",(a==null?void 0:a.room)||"—"],["Instructor",(m==null?void 0:m.name)||"—"]),o={href:"student-courses.html",label:"Courses & schedule"}}else{const a=e.centerId?f("centers",e.centerId):null;n.push(["Where",(a==null?void 0:a.name)||"All centers"]),e.end&&b(e.end)!==b(e.start)&&n.push(["Until",x(e.end)])}const u=tt.open({title:e.title,size:"md",body:p`
      <div class="cluster section-gap">
        <span class="badge tone-${c(s.tone)}">${s.one}</span>
        <span class="text-muted text-sm">${O(e.start)}</span>
      </div>
      <dl class="kv-list">
        <dt>Date</dt><dd>${F(b(e.start))}, ${x(e.start)}</dd>
        <dt>Time</dt><dd>${W(e)}</dd>
        ${c(n.map(([a,l])=>p`<dt>${a}</dt><dd>${l}</dd>`).join(""))}
      </dl>
      ${d?p`<p class="text-muted cal-modal-desc">${d}</p>`:c("")}`,footer:p`
      <button type="button" class="btn btn-outline" data-m="close">Close</button>
      ${o?p`<a class="btn btn-primary" href="${o.href}">${o.label}${c(I("ArrowRight",{size:16}))}</a>`:c("")}`});u.root.querySelector('[data-m="close"]').addEventListener("click",()=>{u.close(),E("id",null)})}

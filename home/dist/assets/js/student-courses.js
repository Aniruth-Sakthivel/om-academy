import"./modulepreload-polyfill.js";/* empty css      */import{b as U,g as j,r as l,i as u,h as d,t as K,s as k,c5 as G,q as b,a as S,f as E,aR as H,j as I,l as v,aa as N,c as _,a5 as W,u as q,bl as Q,c6 as X,o as A,e as C,F as J,D as ee,y as te,d as $,N as se,B as ae,ah as oe,bt as ne,bE as le,v as ie,aF as de}from"./portal-core.js";import"./vendor-icons.js";const re=["courses","timetable"],ce=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],ue=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],pe=[1,2,3,4,5,6,0];let c,m=null,B=null,Z=!1;U({id:"student-courses",portal:"student",watch:["enrollments","batches","courses","timetableSlots","users","centers"],mount(t){c=t,me(),$e(),z();const s=t.params.get("id");s&&O(s)},update:()=>z(),unmount(){Z=!0,m==null||m.destroy(),m=null}});const P=t=>"pct-"+Math.min(100,Math.max(0,Math.round((Number(t)||0)/5)*5));function R(){return le(c.user.id,{activeOnly:!0}).map(t=>{const s=$("batches",t.batchId);if(!s)return null;const o=$("courses",s.courseId)||{title:"Course",tone:"blue",syllabus:[]},a=ie("timetableSlots",n=>n.batchId===s.id).sort((n,e)=>(n.weekday+6)%7-(e.weekday+6)%7||n.start.localeCompare(e.start));return{enr:t,batch:s,course:o,center:$("centers",s.centerId),instructors:(s.instructorIds||[]).map(n=>$("users",n)).filter(Boolean),slots:a,progress:de(s)}}).filter(Boolean)}function V(t){if(!t.length)return"Schedule to be announced";const s=[...new Set(t.map(a=>ue[a.weekday]))].join(", "),o=[...new Set(t.map(a=>q(a.start,a.end)))].join(" / ");return`${s} · ${o}`}function me(){const t=re.includes(j("tab"))?j("tab"):"courses";c.root.innerHTML=d`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Courses &amp; Schedule</li></ol>
        <h1 class="page-title">Courses &amp; Schedule</h1>
        <p class="page-subtitle">Your enrolled courses, syllabus progress and weekly classes.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="ics">${l(u("CalendarClock",{size:16}))}Download .ics</button>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="courses">${l(u("BookOpen",{size:15}))}My courses <span class="tab-count" data-count="courses"></span></button>
        <button type="button" class="tab" role="tab" data-tab="timetable">${l(u("CalendarDays",{size:15}))}Weekly timetable</button>
      </div>
      <div data-tab-panel="courses"><div class="card-body" data-courses></div></div>
      <div data-tab-panel="timetable" hidden>
        <div class="card-body stack">
          <div class="cluster-between">
            <p class="text-sm text-muted m-0" data-week-label></p>
            <div class="cal-legend" data-legend></div>
          </div>
          <div class="tt-week" data-week></div>
          <div class="tt-daylist" data-daylist></div>
        </div>
      </div>
    </div>`,K(c.root,{active:t,onChange:s=>{k("tab",s),s==="timetable"&&requestAnimationFrame(()=>m==null?void 0:m.updateSize())}})}function z(){const t=R(),s=t.reduce((e,i)=>e+i.slots.length,0),o=t.length?Math.round(t.reduce((e,i)=>e+i.progress,0)/t.length):0,a=G(c.user.id).length;b("[data-kpis]",c.root).innerHTML=[S({icon:"BookOpen",label:"Active courses",value:String(t.length),tone:"blue"}),S({icon:"ListChecks",label:"Average syllabus progress",value:o+"%",tone:"green"}),S({icon:"CalendarClock",label:"Classes per week",value:String(s),tone:"purple"}),S({icon:"Clock",label:"Classes today",value:String(a),tone:a?"amber":"slate"})].join(""),b('[data-count="courses"]',c.root).textContent=t.length,b("[data-courses]",c.root).innerHTML=t.length?d`<div class="grid grid-2">${t.map(be)}</div>`:E({icon:"BookOpen",title:"No active courses",text:"Courses appear here once the front office enrols you in a batch."}),b("[data-legend]",c.root).innerHTML=d`${t.map(e=>d`<span class="cal-legend-item"><span class="dot tone-${l(e.course.tone||"blue")} course-dot"></span>${e.course.code||e.course.title}</span>`)}`;const n=H(I());b("[data-week-label]",c.root).textContent=`Week of ${v(n)} – ${v(N(n,6))}`,b("[data-daylist]",c.root).innerHTML=he(t),ge(t)}function be(t){var y;const{batch:s,course:o,center:a,instructors:n,slots:e,progress:i}=t,p=o.tone||"blue",h=(s.moduleIds||[]).length,g=(s.completedModuleIds||[]).length;return d`
    <article class="card course-card">
      <div class="card-header">
        <div class="cluster course-card-head">
          <span class="icon-tile tone-${l(p)}">${l(u("BookOpen",{size:20}))}</span>
          <div class="course-card-titles">
            <h3 class="card-title">${o.title}</h3>
            <p class="card-subtitle">${s.name} · ${s.code}</p>
          </div>
        </div>
        <span class="badge tone-${l(p)}">${o.body||"Course"}</span>
      </div>
      <div class="card-body stack">
        <dl class="kv-list">
          <dt>Center</dt><dd>${(a==null?void 0:a.name)||"—"}</dd>
          <dt>Instructor</dt><dd>${n.map(f=>f.name).join(", ")||"To be assigned"}</dd>
          <dt>Schedule</dt><dd>${V(e)}</dd>
          <dt>Room</dt><dd>${s.room||((y=e[0])==null?void 0:y.room)||"—"}</dd>
          <dt>Duration</dt><dd>${v(s.startDate)} – ${v(s.endDate)}</dd>
        </dl>
        <div class="stack-sm">
          <div class="cluster-between"><span class="text-sm fw-600 text-title">Syllabus progress</span><span class="text-sm fw-700 text-title">${i}%</span></div>
          <div class="progress tone-${l(p)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${i}" aria-label="Syllabus progress"><span class="progress-bar ${l(P(i))}"></span></div>
          <span class="text-xs text-muted">${g} of ${_(h,"module")} completed</span>
        </div>
      </div>
      <div class="card-footer">
        <div class="cluster">
          <a class="btn btn-ghost btn-sm" href="student-resources.html?course=${o.id}">${l(u("FolderOpen",{size:15}))}Resources</a>
          <a class="btn btn-ghost btn-sm" href="student-assignments.html?course=${o.id}">${l(u("ClipboardList",{size:15}))}Assignments</a>
        </div>
        <button type="button" class="btn btn-outline btn-sm" data-open="${s.id}">View details${l(u("ChevronRight",{size:15}))}</button>
      </div>
    </article>`}function he(t){const s=t.flatMap(a=>a.slots.map(n=>({...n,c:a})));if(!s.length)return E({icon:"CalendarDays",title:"No classes scheduled",text:"Your weekly classes appear here once your batch timetable is published."});const o=W(I());return d`<div class="stack">${pe.map(a=>{const n=s.filter(e=>e.weekday===a).sort((e,i)=>e.start.localeCompare(i.start));return d`
      <section class="tt-day ${l(a===o?"is-today":"")}">
        <h4 class="drawer-section-title">${ce[a]}${a===o?d` <span class="badge tone-blue">Today</span>`:l("")}</h4>
        ${n.length?d`<ul class="list-plain tt-day-list">${n.map(e=>d`<li class="list-row tt-slot" data-open="${e.batchId}">
                <span class="icon-tile icon-tile-sm tone-${l(e.c.course.tone||"blue")}">${l(u("Clock",{size:15}))}</span>
                <div class="list-row-main"><div class="list-row-title">${e.c.course.title}</div><div class="list-row-sub">${q(e.start,e.end)} · ${e.room||e.c.batch.room||"—"}</div></div>
                ${l(u("ChevronRight",{size:16}))}
              </li>`)}</ul>`:d`<p class="text-sm text-muted m-0">No classes</p>`}
      </section>`})}</div>`}function ve(t){const s=H(I());return t.flatMap(o=>o.slots.map(a=>{const n=N(s,(a.weekday+6)%7);return{id:"cls-"+a.id,title:`${o.course.code||o.course.title} · ${a.room||o.batch.room||""}`,type:"class",start:`${n}T${a.start}`,end:`${n}T${a.end}`,description:o.course.title,batchId:o.batch.id}}))}function ge(t){const s=ve(t),o=b("[data-week]",c.root);if(m){m.removeAllEvents(),m.addEventSource(s.map(Q));return}if(B)return;if(!s.length){o.innerHTML=E({icon:"CalendarDays",title:"No classes scheduled",text:"Your weekly classes appear here once your batch timetable is published."});return}const a=s.reduce((e,i)=>i.start.slice(11)<e?i.start.slice(11):e,"23:59"),n=s.reduce((e,i)=>i.end.slice(11)>e?i.end.slice(11):e,"00:00");B=X(o,{events:s,slotMin:String(Math.max(6,Number(a.slice(0,2))-1)).padStart(2,"0")+":00:00",slotMax:String(Math.min(23,Number(n.slice(0,2))+2)).padStart(2,"0")+":00:00",businessHours:{daysOfWeek:[1,2,3,4,5,6],startTime:"09:00",endTime:"18:00"},onEventClick:e=>{var i;return O((i=e.extendedProps.raw)==null?void 0:i.batchId)}}).then(e=>{if(Z)return e.destroy();m=e}).catch(e=>{console.error(e),o.innerHTML=E({icon:"TriangleAlert",title:"The timetable couldn't load",text:"Reload the page to try again. The day-by-day list below still shows your classes."})})}function $e(){A(c.root,"click","[data-open]",(t,s)=>O(s.dataset.open)),A(c.root,"click",'[data-act="ics"]',()=>we())}function O(t){var L;const s=R(),o=s.find(r=>r.batch.id===t)||s.find(r=>r.course.id===t);if(!o){C("That course couldn't be found among your enrolments.",{type:"warning"});return}k("id",o.batch.id);const{batch:a,course:n,center:e,instructors:i,slots:p,progress:h}=o,g=n.tone||"blue",y=new Set(a.completedModuleIds||[]),f=(n.syllabus||[]).filter(r=>!(a.moduleIds||[]).length||a.moduleIds.includes(r.id)),w=J.open({title:"Course details",wide:!0,body:d`
      <div class="cluster section-gap">
        <span class="icon-tile tone-${l(g)}">${l(u("BookOpen",{size:20}))}</span>
        <div class="course-card-titles">
          <div class="fw-700 text-lg text-title">${n.title}</div>
          <div class="text-sm text-muted">${a.name}</div>
        </div>
      </div>
      <div class="cluster section-gap"><span class="badge tone-${l(g)}">${n.body||"Course"}</span>${n.category?d`<span class="chip">${n.category}</span>`:l("")}${l(ee(a.status||"active",a.status==="active"?"In progress":a.status))}</div>
      ${n.description?d`<p class="text-muted section-gap">${n.description}</p>`:l("")}
      <dl class="kv-list drawer-section">
        <dt>Batch code</dt><dd>${a.code}</dd>
        <dt>Center</dt><dd>${(e==null?void 0:e.name)||"—"}${e!=null&&e.address?d`<div class="text-xs text-muted">${e.address}</div>`:l("")}</dd>
        <dt>Schedule</dt><dd>${V(p)}</dd>
        <dt>Room</dt><dd>${a.room||"—"}</dd>
        <dt>Starts</dt><dd>${v(a.startDate)}</dd>
        <dt>Ends</dt><dd>${v(a.endDate)}</dd>
      </dl>
      <div class="drawer-section">
        <div class="cluster-between"><h4 class="drawer-section-title">Syllabus</h4><span class="text-sm fw-700 text-title">${h}% complete</span></div>
        <div class="progress tone-${l(g)} section-gap"><span class="progress-bar ${l(P(h))}"></span></div>
        ${f.length?d`<ol class="list-plain syllabus-list">${f.map((r,D)=>{const T=y.has(r.id);return d`<li class="syllabus-item ${l(T?"is-done":"")}">
                <span class="icon-tile icon-tile-sm tone-${l(T?"green":"slate")}">${l(u(T?"Check":"Clock",{size:15}))}</span>
                <div class="list-row-main"><div class="fw-600 text-title">Module ${D+1}: ${r.title}</div><div class="text-xs text-muted">${T?"Completed":"Upcoming"}</div></div>
              </li>`})}</ol>`:d`<p class="text-muted m-0">The syllabus hasn't been published yet.</p>`}
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Instructor</h4>
        ${i.length?d`<div class="stack-sm">${i.map(r=>d`<div class="file-tile">
                ${te({name:r.name,size:"md"})}
                <div class="file-tile-main"><div class="file-tile-name">${r.name}</div><div class="file-tile-meta">${r.designation||"Faculty"}${r.email?" · "+r.email:""}</div></div>
                <button type="button" class="btn btn-outline btn-sm" data-message="${r.id}">${l(u("MessageSquare",{size:15}))}Message</button>
              </div>`)}</div>`:d`<p class="text-muted m-0">An instructor will be assigned soon.</p>`}
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Quick links</h4>
        <div class="grid grid-3 course-links">
          <a class="file-tile" href="student-resources.html?course=${n.id}"><span class="icon-tile icon-tile-sm tone-blue">${l(u("FolderOpen",{size:16}))}</span><span class="file-tile-name">Resources</span></a>
          <a class="file-tile" href="student-forum.html?course=${n.id}"><span class="icon-tile icon-tile-sm tone-purple">${l(u("MessagesSquare",{size:16}))}</span><span class="file-tile-name">Forum</span></a>
          <a class="file-tile" href="student-assignments.html?course=${n.id}"><span class="icon-tile icon-tile-sm tone-amber">${l(u("ClipboardList",{size:16}))}</span><span class="file-tile-name">Assignments</span></a>
        </div>
      </div>`,footer:d`<button type="button" class="btn btn-outline" data-d="close">Close</button>`}),Y=()=>{k("id",null),w.close()};w.root.querySelector('[data-d="close"]').addEventListener("click",Y),(L=w.root.querySelector("[data-drawer-close]"))==null||L.addEventListener("click",()=>k("id",null)),A(w.root,"click","[data-message]",(r,D)=>ye(D.dataset.message,n))}async function ye(t,s){const o=$("users",t);if(!o)return C("That instructor couldn't be found.",{type:"warning"});const a=await se.form({title:"Message "+o.name,submitLabel:"Send message",columns:1,fields:[{name:"subject",label:"Subject",required:!0,placeholder:"e.g. Doubt about module 3"},{name:"body",label:"Message",type:"textarea",rows:5,required:!0,placeholder:"Write your question…"}],values:{subject:s.title+" — question"},validate:n=>{const e={};return n.subject.trim()?n.subject.trim().length>120&&(e.subject="Keep the subject under 120 characters."):e.subject="Enter a subject.",n.body.trim().length<5&&(e.body="Write a message of at least 5 characters."),e}});a&&await ae(()=>oe(c.user,{subject:a.subject.trim(),category:"academic",participants:[{type:"user",id:t}],body:a.body.trim()}),{success:`Message sent to ${o.name}. Replies appear under Notifications → Messages.`,error:"Couldn't send the message"})}const x=t=>String(t||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/([,;])/g,"\\$1"),M=t=>t.replace(/-/g,""),F=t=>t.replace(":","")+"00";function fe(t){const s=[];let o=t;for(;o.length>74;)s.push(o.slice(0,74)),o=" "+o.slice(74);return s.push(o),s.join(`\r
`)}function we(){var n;const t=R().filter(e=>e.slots.length);if(!t.length)return C("There are no scheduled classes to export yet.",{type:"info"});const s=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z"),o=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//OM Academy//Student Portal//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:OM Academy classes","X-WR-TIMEZONE:Asia/Kolkata","BEGIN:VTIMEZONE","TZID:Asia/Kolkata","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:+0530","TZOFFSETTO:+0530","TZNAME:IST","END:STANDARD","END:VTIMEZONE"];for(const e of t)for(const i of e.slots){let p=e.batch.startDate;for(;W(p)!==i.weekday;)p=N(p,1);p>e.batch.endDate||o.push("BEGIN:VEVENT",`UID:${i.id}-${e.batch.id}@omacademy.in`,`DTSTAMP:${s}`,`DTSTART;TZID=Asia/Kolkata:${M(p)}T${F(i.start)}`,`DTEND;TZID=Asia/Kolkata:${M(p)}T${F(i.end)}`,`RRULE:FREQ=WEEKLY;BYDAY=${["SU","MO","TU","WE","TH","FR","SA"][i.weekday]};UNTIL=${M(e.batch.endDate)}T235959`,`SUMMARY:${x(e.course.title)}`,`LOCATION:${x([i.room||e.batch.room,(n=e.center)==null?void 0:n.name].filter(Boolean).join(", "))}`,`DESCRIPTION:${x(`${e.batch.name}
Instructor: ${e.instructors.map(h=>h.name).join(", ")||"TBA"}`)}`,"END:VEVENT")}o.push("END:VCALENDAR");const a=o.map(fe).join(`\r
`)+`\r
`;ne("om-academy-timetable.ics",new Blob([a],{type:"text/calendar;charset=utf-8"})),C("Timetable downloaded — open it to add your classes to your calendar.",{type:"success"})}

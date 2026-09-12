import"./modulepreload-polyfill.js";/* empty css      */import{b as U,g as L,r as i,i as u,h as l,t as D,s as v,af as A,q as d,a8 as K,A as z,f as M,al as I,I as B,m as j,y as T,d as g,cs as W,J as q,l as G,a6 as Y,e as F,B as f,ai as J,o as h,cb as C,ct as X,K as _,ae as S,ak as Q,N as V,x as Z,ah as ee,cc as te,z as N,v as ae,G as se}from"./portal-core.js";import"./vendor-icons.js";const ne=["notifications","messages"],oe={announcement:{icon:"Megaphone",tone:"purple",label:"Announcements"},assignment:{icon:"ClipboardList",tone:"blue",label:"Assignments"},grade:{icon:"Award",tone:"green",label:"Grades"},exam:{icon:"GraduationCap",tone:"navy",label:"Exams"},result:{icon:"Award",tone:"green",label:"Results"},transcript:{icon:"FileBadge",tone:"purple",label:"Transcripts"},fee:{icon:"Wallet",tone:"amber",label:"Fees"},leave:{icon:"CalendarX",tone:"rust",label:"Leave"},message:{icon:"MessageSquare",tone:"blue",label:"Messages"},forum:{icon:"MessagesSquare",tone:"navy",label:"Forum"},resource:{icon:"FolderOpen",tone:"green",label:"Resources"},enrollment:{icon:"BookOpen",tone:"blue",label:"Enrolment"},direct:{icon:"Bell",tone:"slate",label:"From the office"}},E=e=>oe[e]||{icon:"Bell",tone:"slate",label:N(e||"Other")};let s,b={read:"all",type:""},p=null;U({id:"student-notifications",portal:"student",watch:["notifications","announcements","threads","messages","users","files"],mount(e){s=e;const a=ne.includes(L("tab"))?L("tab"):"notifications";p=a==="messages"?e.params.get("id"):null,ce(a),be(),$(),p&&x(p)},update:()=>$()});const H=()=>te(s.user).map(e=>({...e,type:e.kind==="announcement"?"announcement":e.type||"direct"})),ie=e=>{var a;return((a=g("users",e))==null?void 0:a.name)||"Unknown user"},re={accountant:"Accounts office",admin:"Admin office",teacher:"Instructors"};function R(e){var t;const a=(t=e.readAt)==null?void 0:t[s.user.id];return!a||a<e.lastMessageAt}function w(e){return e.participants.filter(t=>!(t.type==="user"&&t.id===s.user.id)).map(t=>t.type==="role"?re[t.id]||N(t.id):ie(t.id)).join(", ")||"Just you"}const O=e=>ae("messages",a=>a.threadId===e).sort((a,t)=>a.sentAt.localeCompare(t.sentAt));function le(){return[...[...new Set(se(s.user.id).flatMap(t=>t.instructorIds||[]))].map(t=>g("users",t)).filter(Boolean).map(t=>[`user:${t.id}`,`${t.name} — Instructor`]),["role:accountant","Accounts office (fees, scholarships)"],["role:admin","Admin office (certificates, transcripts, general)"]]}function ce(e){s.root.innerHTML=l`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Notifications</li></ol>
        <h1 class="page-title">Notifications &amp; Messages</h1>
        <p class="page-subtitle">Updates from the academy and conversations with your instructors and offices.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="mark-all">${i(u("CheckCheck",{size:16}))}Mark all read</button>
        <button type="button" class="btn btn-primary" data-act="new-message">${i(u("SquarePen",{size:16}))}New message</button>
      </div>
    </div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="notifications">${i(u("Bell",{size:15}))}Notifications <span class="tab-count" data-count="notifications"></span></button>
        <button type="button" class="tab" role="tab" data-tab="messages">${i(u("MessageSquare",{size:15}))}Messages <span class="tab-count" data-count="messages"></span></button>
      </div>
      <div data-tab-panel="notifications">
        <div class="notif-toolbar">
          <div class="segmented" role="group" aria-label="Filter by read state" data-read-filter>
            <button type="button" data-read="all" aria-pressed="true">All</button>
            <button type="button" data-read="unread" aria-pressed="false">Unread</button>
          </div>
          <select class="form-control form-control-sm notif-type-select" data-type-filter aria-label="Filter by type"></select>
        </div>
        <ul class="list-plain" data-feed></ul>
      </div>
      <div data-tab-panel="messages" hidden>
        <div class="chat-layout">
          <div class="chat-list" data-thread-list></div>
          <div class="chat-pane">
            <div data-chat-body></div>
            <form class="chat-compose" data-compose hidden novalidate>
              <label class="btn btn-ghost btn-icon chat-attach" aria-label="Attach a file">${i(u("Paperclip",{size:17}))}<input type="file" name="file" class="visually-hidden-input" data-attach></label>
              <div class="chat-compose-main">
                <textarea class="form-control" name="body" rows="1" placeholder="Write a reply…" aria-label="Reply"></textarea>
                <div class="chat-attach-chip" data-attach-chip hidden></div>
                <p class="field-error" data-error-for="body" hidden></p>
              </div>
              <button type="submit" class="btn btn-primary btn-icon" aria-label="Send">${i(u("Send",{size:17}))}</button>
            </form>
          </div>
        </div>
      </div>
    </div>`,D(s.root,{active:e,onChange:a=>{v("tab",a),a!=="messages"?v("id",null):p&&v("id",p)}})}function $(){const e=H(),a=e.filter(o=>!o.readAt).length,t=A(s.user);d('[data-count="notifications"]',s.root).textContent=a?a+" new":e.length,d('[data-count="messages"]',s.root).textContent=K(s.user)||t.length,d('[data-act="mark-all"]',s.root).disabled=!a;const c=d("[data-type-filter]",s.root),n=[...new Set(e.map(o=>o.type))].sort();b.type&&!n.includes(b.type)&&(b.type=""),c.innerHTML=l`<option value="">All types</option>${n.map(o=>l`<option value="${o}" ${i(o===b.type?"selected":"")}>${E(o).label}</option>`)}`,z("[data-read]",s.root).forEach(o=>o.setAttribute("aria-pressed",String(o.dataset.read===b.read)));const r=e.filter(o=>(b.read==="unread"?!o.readAt:!0)&&(!b.type||o.type===b.type));d("[data-feed]",s.root).innerHTML=r.length?l`${r.map(de)}`:l`<li>${M(e.length?{icon:"Inbox",title:b.read==="unread"?"You're all caught up":"Nothing matches this filter",text:"Try a different filter to see older notifications."}:{icon:"Bell",title:"No notifications yet",text:"Updates about assignments, fees, exams and announcements will appear here."})}</li>`,ue(t),k()}function de(e){const a=E(e.type),t=e.link;return l`
    <li class="list-row notif-row ${i(e.readAt?"":"is-unread")}">
      <span class="icon-tile icon-tile-sm tone-${i(e.priority==="high"?"rust":a.tone)}">${i(u(a.icon,{size:16}))}</span>
      <div class="list-row-main">
        <div class="notif-row-title">${e.title}${e.priority==="high"?l` <span class="badge tone-rust">Important</span>`:i("")}</div>
        ${e.body?l`<div class="list-row-sub notif-row-body">${I(e.body,220)}</div>`:i("")}
        <div class="notif-row-meta">${a.label} · <time datetime="${e.createdAt}" title="${B(e.createdAt)}">${j(e.createdAt)}</time></div>
      </div>
      <div class="notif-row-actions">
        ${t?l`<a class="btn btn-soft btn-sm" href="${t}" data-open="${e.id}">Open${i(u("ArrowRight",{size:14}))}</a>`:i("")}
        ${e.readAt?i(""):l`<button type="button" class="btn btn-ghost btn-sm btn-icon" data-read-one="${e.id}" aria-label="Mark as read" title="Mark as read">${i(u("Check",{size:16}))}</button>`}
      </div>
    </li>`}function ue(e){const a=d("[data-thread-list]",s.root);a.innerHTML=e.length?l`${e.map(t=>{const c=O(t.id).at(-1),n=R(t),r=w(t);return l`
          <button type="button" class="chat-thread-item ${i(t.id===p?"is-active":"")} ${i(n?"is-unread":"")}" data-thread="${t.id}">
            ${T({name:r,size:"md"})}
            <span class="chat-thread-main">
              <span class="chat-thread-top"><span class="chat-thread-subject">${t.subject||"Conversation"}</span><span class="chat-thread-time">${j(t.lastMessageAt)}</span></span>
              <span class="chat-thread-preview">${r}${c?" · "+(c.senderId===s.user.id?"You: ":"")+I(c.body,60):""}</span>
            </span>
            ${n?l`<span class="dot tone-blue" aria-label="Unread"></span>`:i("")}
          </button>`})}`:M({icon:"MessageSquare",title:"No conversations",text:"Message your instructor or the academy office.",actionLabel:"New message",actionAttrs:'data-act="new-message"'})}function k(){const e=d("[data-chat-body]",s.root),a=d("[data-compose]",s.root),t=p?g("threads",p):null,c=t&&A(s.user).some(m=>m.id===t.id);if(!t||!c){a.hidden=!0,e.innerHTML=l`<div class="chat-empty">${M({icon:"MessagesSquare",title:"Select a conversation",text:"Pick a conversation on the left, or start a new one."})}</div>`;return}const n=O(t.id),r=t.status==="closed";a.hidden=r,e.innerHTML=l`
    <div class="chat-pane-head">
      <div class="cell-user">
        <button type="button" class="btn btn-ghost btn-icon btn-sm chat-back" data-act="back" aria-label="Back to conversations">${i(u("ArrowLeft",{size:16}))}</button>
        ${T({name:w(t),size:"md"})}
        <div class="cell-user-text"><span class="cell-title">${t.subject||"Conversation"}</span><span class="cell-sub">${w(t)}</span></div>
      </div>
      ${me(t)}
    </div>
    <div class="chat-messages" data-chat-messages>
      ${n.length?n.map(pe):l`<p class="text-muted text-center m-0">No messages yet.</p>`}
      ${r?l`<div class="alert tone-slate">${i(u("Lock",{size:16}))}<div class="alert-body">This conversation was closed by the office. Start a new message if you need more help.</div></div>`:i("")}
    </div>`;const o=d("[data-chat-messages]",e);o.scrollTop=o.scrollHeight,W(e)}const me=e=>l`<span class="badge tone-${i(e.status==="closed"?"slate":"green")}">${e.status==="closed"?"Closed":"Open"}</span>`;function pe(e){const a=e.senderId===s.user.id,t=g("users",e.senderId),c=(e.fileIds||[]).map(n=>g("files",n)).filter(Boolean);return l`
    <div class="msg ${i(a?"is-mine":"")}">
      ${T({name:(t==null?void 0:t.name)||"?",size:"sm"})}
      <div class="msg-col">
        ${a?i(""):l`<div class="msg-sender">${(t==null?void 0:t.name)||"Academy staff"}</div>`}
        <div class="msg-bubble">${e.body}</div>
        ${c.map(n=>l`<button type="button" class="msg-file" data-file="${n.id}">${i(u(/^image\//.test(n.mime)?"FileImage":"FileText",{size:15}))}<span class="truncate">${n.name}</span><span class="text-xs text-muted">${q(n.size)}</span></button>`)}
        <div class="msg-meta" title="${B(e.sentAt)}">${G(e.sentAt)} · ${Y(e.sentAt)}</div>
      </div>
    </div>`}function x(e){const a=g("threads",e);if(!a||!A(s.user).some(t=>t.id===e)){F("That conversation couldn't be found.",{type:"warning"}),p=null,v("id",null),k();return}p=e,v("id",e),d(".chat-layout",s.root).classList.add("has-active"),z("[data-thread]",s.root).forEach(t=>t.classList.toggle("is-active",t.dataset.thread===e)),k(),R(a)&&f(()=>J(s.user,e),{error:"Couldn't mark the conversation as read"})}function be(){h(s.root,"click","[data-read]",(n,r)=>{b.read=r.dataset.read,$()}),h(s.root,"change","[data-type-filter]",(n,r)=>{b.type=r.value,$()}),h(s.root,"click","[data-read-one]",(n,r)=>f(()=>C(s.user,r.dataset.readOne),{error:"Couldn't mark as read"})),h(s.root,"click","[data-open]",(n,r)=>{const o=H().find(m=>m.id===r.dataset.open);o&&!o.readAt&&(n.preventDefault(),C(s.user,o.id).catch(()=>{}).finally(()=>window.location.href=r.getAttribute("href")))}),h(s.root,"click",'[data-act="mark-all"]',()=>f(()=>X(s.user),{success:"All notifications marked as read.",error:"Couldn't mark all as read"})),h(s.root,"click",'[data-act="new-message"]',he),h(s.root,"click","[data-thread]",(n,r)=>x(r.dataset.thread)),h(s.root,"click",'[data-act="back"]',()=>{d(".chat-layout",s.root).classList.remove("has-active")}),h(s.root,"click","[data-file]",(n,r)=>f(()=>_(r.dataset.file),{error:"Couldn't download the attachment"}));const e=d("[data-compose]",s.root),a=d("[data-attach-chip]",e),t=d("[data-attach]",e),c=e.elements.namedItem("body");t.addEventListener("change",()=>{const n=t.files[0];a.hidden=!n,a.innerHTML=n?l`${i(u("Paperclip",{size:13}))}<span class="truncate">${n.name}</span><span class="text-muted">${q(n.size)}</span><button type="button" class="link-btn" data-clear-attach aria-label="Remove attachment">${i(u("X",{size:13}))}</button>`:""}),h(e,"click","[data-clear-attach]",()=>{t.value="",a.hidden=!0,a.innerHTML=""}),c.addEventListener("keydown",n=>{n.key==="Enter"&&!n.shiftKey&&(n.preventDefault(),e.requestSubmit())}),e.addEventListener("submit",async n=>{n.preventDefault();const r=c.value.trim(),o=t.files;if(!r)return S(e,{body:"Write a message before sending."});if(S(e,{}),!p)return F("Choose a conversation first.",{type:"warning"});const m=e.querySelector('button[type="submit"]');m.disabled=!0;const y=await f(()=>Q(s.user,p,{body:r,fileList:o.length?o:null}),{error:"Couldn't send your message"});m.disabled=!1,y&&(c.value="",t.value="",a.hidden=!0,a.innerHTML="",c.focus())})}async function he(){const e=le(),a=await V.form({title:"New message",submitLabel:"Send message",columns:1,fields:[{name:"to",label:"To",type:"select",required:!0,placeholder:"Choose a recipient",options:e},{name:"subject",label:"Subject",required:!0,placeholder:"e.g. Doubt about Module 3"},{name:"body",label:"Message",type:"textarea",rows:5,required:!0,placeholder:"Write your message…"},{name:"file",label:"Attachment (optional)",type:"file",help:"Max 2 MB."}],validate:o=>{const m={};(!o.to||!e.some(([P])=>P===o.to))&&(m.to="Choose who should receive this message."),o.subject.trim()?o.subject.trim().length>120&&(m.subject="Keep the subject under 120 characters."):m.subject="Add a short subject.",o.body.trim()||(m.body="Write your message.");const y=(Z("settings").system||{}).maxUploadKB||2048;return o.file&&o.file.size>y*1024&&(m.file=`The attachment must be ${Math.round(y/1024)} MB or smaller.`),m}});if(!a)return;const[t,c]=a.to.split(":"),n=t==="role"?c==="accountant"?"fees":"general":"academic",r=await f(()=>ee(s.user,{subject:a.subject.trim(),category:n,participants:[{type:t,id:c}],body:a.body.trim(),fileList:a.file?[a.file]:null}),{success:"Message sent.",error:"Couldn't send your message"});r&&(d('[data-tab="messages"]',s.root).click(),x(r.id))}

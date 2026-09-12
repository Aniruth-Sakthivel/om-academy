import"./modulepreload-polyfill.js";/* empty css      */import{b as U,g as W,G as K,d as f,r as o,i as c,h as n,q as p,cj as B,f as P,ck as H,y as I,m as S,aq as q,e as y,s as g,F as V,B as $,cl as Y,I as O,c as F,al as j,o as v,cm as _,ae as x,cn as J,co as Q,N,cp as X,cq as Z,x as ee,cr as te}from"./portal-core.js";import"./vendor-icons.js";const R=[["spam","Spam or advertising"],["abuse","Abusive or disrespectful"],["off-topic","Off-topic"],["cheating","Sharing exam answers / cheating"],["other","Something else"]];let i,d="general",A="",h=null;U({id:"student-forum",portal:"student",watch:["forumThreads","forumPosts","settings","enrollments","users"],mount(e){i=e;const t=W("scope");t&&L().some(r=>r.id===t)&&(d=t),oe(),ue(),T();const s=e.params.get("id");s&&M(s)},update:()=>T()});function L(){const e=[...new Set(K(i.user.id).map(t=>t.courseId))].map(t=>f("courses",t)).filter(Boolean);return[{id:"general",label:"General",sub:"Everyone at OM Academy",icon:"Globe",tone:"blue"},...e.map(t=>({id:t.id,label:t.title,sub:t.code||"Course",icon:"BookOpen",tone:t.tone||"green"}))]}const C=e=>e==="general"?{type:"general"}:{type:"course",id:e},se=e=>{var t;return e.scope.type==="general"?"General":((t=f("courses",e.scope.id))==null?void 0:t.title)||"Course"},z=()=>(ee("settings").system||{}).studentForumPosting!==!1,b=e=>{var t;return((t=f("users",e))==null?void 0:t.name)||"Former member"},D=e=>{const t=f("users",e);return!t||t.role==="student"?o(""):n`<span class="badge tone-navy">${t.role==="teacher"?"Instructor":"Staff"}</span>`};function E(e){return!e||e.hidden?!1:e.scope.type==="general"||L().some(t=>t.id===e.scope.id)}function ae(){const e=C(d),t=A.trim().toLowerCase();return B(e.type,e.id).filter(s=>!t||s.title.toLowerCase().includes(t)||(s.body||"").toLowerCase().includes(t)||(s.tags||[]).some(r=>r.toLowerCase().includes(t)))}function oe(){i.root.innerHTML=n`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Discussion Forum</li></ol>
        <h1 class="page-title">Discussion Forum</h1>
        <p class="page-subtitle">Ask questions, share work and help your classmates.</p>
      </div>
      <div class="page-actions" data-actions></div>
    </div>
    <div data-posting-alert></div>
    <div class="grid grid-side-main forum-layout">
      <div class="card forum-scopes">
        <div class="card-header"><h2 class="card-title">Boards</h2></div>
        <div class="list-plain" data-scopes></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div><h2 class="card-title" data-scope-title></h2><p class="card-subtitle" data-scope-sub></p></div>
          <div class="search-field forum-search">
            ${o(c("Search",{size:15}))}
            <input type="search" class="form-control form-control-sm" placeholder="Search threads" data-search aria-label="Search threads">
          </div>
        </div>
        <ul class="list-plain" data-threads></ul>
      </div>
    </div>`}function T(){const e=L();e.some(a=>a.id===d)||(d="general");const t=z();p("[data-actions]",i.root).innerHTML=n`<button type="button" class="btn btn-primary" data-act="new" ${o(t?"":"disabled")}>${o(c("Plus",{size:16}))}New thread</button>`,p("[data-posting-alert]",i.root).innerHTML=t?"":n`<div class="alert tone-amber page-section">${o(c("Lock",{size:18}))}<div class="alert-body"><p class="alert-title">Posting is paused</p>The academy has temporarily turned off new threads from students. You can still read and like posts.</div></div>`,p("[data-scopes]",i.root).innerHTML=n`${e.map(a=>{const l=B(C(a.id).type,C(a.id).id).length;return n`<button type="button" class="list-row forum-scope ${o(a.id===d?"is-active":"")}" data-scope="${a.id}" aria-pressed="${a.id===d?"true":"false"}">
      <span class="icon-tile icon-tile-sm tone-${o(a.tone)}">${o(c(a.icon,{size:16}))}</span>
      <span class="list-row-main"><span class="list-row-title">${a.label}</span><span class="list-row-sub">${a.sub}</span></span>
      <span class="tab-count">${l}</span>
    </button>`})}`;const s=e.find(a=>a.id===d);p("[data-scope-title]",i.root).textContent=s.label,p("[data-scope-sub]",i.root).textContent=d==="general"?"Open to every student and instructor":"Only students and instructors of this course";const r=ae();p("[data-threads]",i.root).innerHTML=r.length?n`${r.map(re)}`:n`<li>${P(A?{icon:"Search",title:"No threads match your search",text:"Try different words, or clear the search."}:{icon:"MessagesSquare",title:"No threads here yet",text:t?"Start the first discussion on this board.":"Nothing has been posted on this board yet.",actionLabel:t?"Start a thread":void 0,actionAttrs:'data-act="new"'})}</li>`,h&&G()}function re(e){const t=H(e.id),s=t.at(-1);return n`
    <li>
      <button type="button" class="list-row forum-thread ${o(e.pinned?"is-pinned":"")}" data-thread="${e.id}">
        ${I({name:b(e.authorId),size:"md"})}
        <span class="list-row-main">
          <span class="forum-thread-title">
            ${e.pinned?n`<span class="forum-flag tone-amber" title="Pinned">${o(c("Pin",{size:13}))}</span>`:o("")}
            ${e.locked?n`<span class="forum-flag tone-slate" title="Locked">${o(c("Lock",{size:13}))}</span>`:o("")}
            <span class="forum-thread-text">${e.title}</span>
            ${e.solvedPostId?n`<span class="badge tone-green">${o(c("CircleCheck",{size:12}))}Solved</span>`:o("")}
          </span>
          <span class="list-row-sub">${b(e.authorId)} · ${s?"last reply "+S(s.createdAt)+" by "+b(s.authorId):"posted "+S(e.createdAt||e.lastPostAt)}</span>
          ${(e.tags||[]).length?n`<span class="cluster forum-tags">${e.tags.map(r=>n`<span class="chip">#${r}</span>`)}</span>`:o("")}
        </span>
        <span class="forum-stats">
          <span title="Replies">${o(c("MessageSquare",{size:14}))}${q(t.length)}</span>
          <span title="Views">${o(c("Eye",{size:14}))}${q(e.views||0)}</span>
        </span>
      </button>
    </li>`}function M(e){const t=f("forumThreads",e);if(!E(t)){y("That thread couldn't be found. It may have been removed.",{type:"warning"}),g("id",null);return}t.scope.type==="course"&&d!==t.scope.id?(d=t.scope.id,g("scope",d)):t.scope.type==="general"&&d!=="general"&&(d="general",g("scope",null)),g("id",e);const s=V.open({title:"Discussion",wide:!0,body:n`<div data-thread-body></div>`,footer:n`<form class="forum-reply" data-reply-form novalidate>
      <div class="forum-reply-main">
        <textarea class="form-control" name="body" rows="2" placeholder="Write a reply…" aria-label="Your reply"></textarea>
        <p class="field-error" data-error-for="body" hidden></p>
      </div>
      <button type="submit" class="btn btn-primary">${o(c("Send",{size:15}))}Reply</button>
    </form><div data-reply-locked hidden></div>`});h={id:e,d:s};const r=new MutationObserver(()=>{s.root.isConnected||(r.disconnect(),(h==null?void 0:h.d)===s&&(h=null),g("id",null))});r.observe(document.body,{childList:!0}),ie(s),G(),$(()=>Y(i.user,e),{error:"Couldn't update the view count"})}function G(){const{id:e,d:t}=h,s=f("forumThreads",e),r=p("[data-thread-body]",t.root);if(!E(s)){r.innerHTML=P({icon:"Ban",title:"This thread is no longer available",text:"It may have been hidden by a moderator."}),p("[data-reply-form]",t.root).hidden=!0;return}const a=H(e),l=s.authorId===i.user.id,u=a.find(k=>k.id===s.solvedPostId);r.innerHTML=n`
    <div class="forum-op">
      <div class="cluster forum-op-badges">
        <span class="chip">${se(s)}</span>
        ${s.pinned?n`<span class="badge tone-amber">${o(c("Pin",{size:12}))}Pinned</span>`:o("")}
        ${s.locked?n`<span class="badge tone-slate">${o(c("Lock",{size:12}))}Locked</span>`:o("")}
        ${s.solvedPostId?n`<span class="badge tone-green">${o(c("CircleCheck",{size:12}))}Solved</span>`:o("")}
      </div>
      <h2 class="forum-op-title">${s.title}</h2>
      <div class="cell-user">
        ${I({name:b(s.authorId),size:"sm"})}
        <div class="cell-user-text"><span class="cell-title">${b(s.authorId)} ${D(s.authorId)}</span><span class="cell-sub" title="${O(s.createdAt)}">${S(s.createdAt||s.lastPostAt)} · ${F(s.views||0,"view")}</span></div>
      </div>
      <div class="forum-body">${s.body}</div>
      ${(s.tags||[]).length?n`<div class="cluster">${s.tags.map(k=>n`<span class="chip">#${k}</span>`)}</div>`:o("")}
    </div>
    ${u?n`<div class="alert tone-green section-gap">${o(c("CircleCheck",{size:18}))}<div class="alert-body"><p class="alert-title">Accepted answer by ${b(u.authorId)}</p>${j(u.body,200)}</div></div>`:o("")}
    <h3 class="drawer-section-title">${F(a.length,"reply","replies")}</h3>
    ${a.length?n`<div class="stack forum-posts">${a.map(k=>ne(k,s,l))}</div>`:P({icon:"MessageSquare",title:"No replies yet",text:s.locked?"This thread is locked.":"Be the first to reply."})}`;const m=p("[data-reply-form]",t.root),w=p("[data-reply-locked]",t.root);m.hidden=!!s.locked,w.hidden=!s.locked,w.innerHTML=s.locked?n`<div class="alert tone-slate w-100">${o(c("Lock",{size:16}))}<div class="alert-body">This thread is locked by a moderator — new replies are turned off.</div></div>`:""}function ne(e,t,s){const r=(e.likes||[]).includes(i.user.id),a=e.authorId===i.user.id,l=(e.reports||[]).some(m=>m.by===i.user.id),u=t.solvedPostId===e.id;return n`
    <article class="forum-post ${o(u?"is-accepted":"")}">
      <div class="cluster-between">
        <div class="cell-user">
          ${I({name:b(e.authorId),size:"sm"})}
          <div class="cell-user-text"><span class="cell-title">${b(e.authorId)} ${D(e.authorId)}</span><span class="cell-sub" title="${O(e.createdAt)}">${S(e.createdAt)}${e.editedAt?" · edited":""}</span></div>
        </div>
        ${u?n`<span class="badge tone-green">${o(c("CircleCheck",{size:12}))}Accepted answer</span>`:o("")}
      </div>
      <div class="forum-body">${e.body}</div>
      <div class="forum-post-actions">
        <button type="button" class="btn btn-ghost btn-sm ${o(r?"is-liked":"")}" data-like="${e.id}" aria-pressed="${r?"true":"false"}">${o(c("ThumbsUp",{size:14}))}${r?"Liked":"Like"}${(e.likes||[]).length?" · "+e.likes.length:""}</button>
        ${s&&!a&&!t.locked?n`<button type="button" class="btn btn-ghost btn-sm" data-solve="${e.id}">${o(c(u?"RotateCcw":"CircleCheck",{size:14}))}${u?"Unmark solution":"Mark as solution"}</button>`:o("")}
        ${a?o(""):l?n`<span class="text-xs text-muted forum-reported">${o(c("Flag",{size:13}))}Reported</span>`:n`<button type="button" class="btn btn-ghost btn-sm" data-report="${e.id}">${o(c("Flag",{size:14}))}Report</button>`}
      </div>
    </article>`}function ie(e){v(e.root,"click","[data-like]",(r,a)=>$(()=>_(i.user,a.dataset.like),{error:"Couldn't update your like"})),v(e.root,"click","[data-solve]",(r,a)=>le(h.id,a.dataset.solve)),v(e.root,"click","[data-report]",(r,a)=>de(a.dataset.report));const t=p("[data-reply-form]",e.root),s=t.elements.namedItem("body");t.addEventListener("submit",async r=>{r.preventDefault();const a=s.value.trim();if(!a)return x(t,{body:"Write a reply before posting."});if(a.length>4e3)return x(t,{body:"Keep replies under 4,000 characters."});x(t,{});const l=f("forumThreads",h.id);if(!l||l.locked)return y("This thread is locked — replies are turned off.",{type:"warning"});const u=t.querySelector('button[type="submit"]');u.disabled=!0;const m=await $(()=>J(i.user,h.id,a),{success:"Reply posted.",error:"Couldn't post your reply"});if(u.disabled=!1,m){s.value="";const w=p(".drawer-body",e.root);w.scrollTop=w.scrollHeight}})}function le(e,t){const s=f("forumThreads",e);if(!s)return y("That thread no longer exists.",{type:"warning"});const r=s.solvedPostId===t?null:t;$(()=>Q(i.user,e,r),{success:r?"Marked as the solution.":"Solution unmarked.",error:"Couldn't update the solution"})}async function de(e){var a;const t=f("forumPosts",e);if(!t||t.hidden)return y("That post couldn't be found.",{type:"warning"});const s=await N.form({title:"Report post",submitLabel:"Send report",columns:1,size:"sm",extraBodyHtml:n`<p class="text-muted text-sm m-0 section-gap">Moderators will review this post. The author won't see who reported it.</p>`,fields:[{name:"reason",label:"Reason",type:"select",required:!0,placeholder:"Choose a reason",options:R},{name:"details",label:"Details (optional)",type:"textarea",rows:3,placeholder:"Anything the moderators should know"}],validate:l=>{const u={};return l.reason||(u.reason="Choose a reason."),l.reason==="other"&&!l.details.trim()&&(u.details="Tell the moderators what's wrong."),u}});if(!s)return;const r=((a=R.find(([l])=>l===s.reason))==null?void 0:a[1])||s.reason;$(()=>X(i.user,e,s.details.trim()?`${r}: ${s.details.trim()}`:r),{success:"Thanks — the moderators have been notified.",error:"Couldn't report the post"})}async function ce(){if(!z())return y("Posting new threads is turned off right now.",{type:"warning"});const e=L(),t=await N.form({title:"Start a new thread",submitLabel:"Post thread",columns:1,values:{scope:d},fields:[{name:"scope",label:"Board",type:"select",required:!0,options:e.map(a=>[a.id,a.label])},{name:"title",label:"Title",required:!0,placeholder:"Summarise your question in one line"},{name:"body",label:"Details",type:"textarea",rows:6,required:!0,placeholder:"Add context, what you've tried, screenshots described in words…"},{name:"tags",label:"Tags (optional)",placeholder:"e.g. excel, practical",help:"Separate tags with commas. Up to 5."}],validate:a=>{const l={};return e.some(m=>m.id===a.scope)||(l.scope="Choose a board."),a.title.trim().length<5?l.title="Write a title of at least 5 characters.":a.title.trim().length>140&&(l.title="Keep the title under 140 characters."),a.body.trim().length<10&&(l.body="Add a few more details (at least 10 characters)."),a.tags.split(",").map(m=>m.trim()).filter(Boolean).length>5&&(l.tags="Use at most 5 tags."),l}});if(!t)return;if(!z())return y("Posting new threads was turned off while you were writing.",{type:"warning"});const s=[...new Set(t.tags.split(",").map(a=>a.trim().toLowerCase().replace(/^#/,"")).filter(Boolean))].slice(0,5),r=await $(()=>te(i.user,{scope:C(t.scope),title:t.title.trim(),body:t.body.trim(),tags:s}),{success:"Thread posted.",error:"Couldn't post your thread"});r&&(d=t.scope,g("scope",d==="general"?null:d),T(),M(r.id))}function ue(){v(i.root,"click",'[data-act="new"]',ce),v(i.root,"click","[data-scope]",(t,s)=>{d=s.dataset.scope,g("scope",d==="general"?null:d),T()}),v(i.root,"click","[data-thread]",(t,s)=>M(s.dataset.thread));const e=Z(t=>{A=t,T()},150);v(i.root,"input","[data-search]",(t,s)=>e(s.value))}

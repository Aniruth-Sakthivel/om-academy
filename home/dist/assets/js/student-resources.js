import"./modulepreload-polyfill.js";/* empty css      */import{b as P,g as v,e as m,cC as O,d as b,G as B,s as p,r as n,i as c,h as r,q as h,a as w,c as k,f as y,l as N,o as u,A as I,B as x,cD as D,K as j,bU as z,N as V,J as E,cE as G,cq as K}from"./portal-core.js";import"./vendor-icons.js";const g={pdf:{label:"PDF",icon:"FileText",tone:"rust"},doc:{label:"Document",icon:"FileText",tone:"blue"},slides:{label:"Slides",icon:"Presentation",tone:"amber"},"video-link":{label:"Video",icon:"Video",tone:"purple"},link:{label:"Link",icon:"Link",tone:"green"}},H="om-portal:ui:resources-view";let s;const o={search:"",course:"",kind:"",view:"grid"};P({id:"student-resources",portal:"student",watch:["resources","files","enrollments","batches","courses"],mount(e){s=e,o.course=v("course")||"",o.kind=g[v("type")]?v("type"):"",o.search=v("q")||"";try{o.view=localStorage.getItem(H)==="list"?"list":"grid"}catch{}_(),Y(),f();const t=e.params.get("id");if(t){const i=L().find(a=>a.id===t);i?S(i)&&q(i.id):m("That resource couldn't be found.",{type:"warning"})}},update:()=>f()});function L(){return O(s.user.id).map(e=>{var a;const t=e.fileId?b("files",e.fileId):null,i=b("courses",e.courseId);return{...e,file:t,course:i,uploader:b("users",e.uploadedBy),module:(a=i==null?void 0:i.syllabus)==null?void 0:a.find(d=>d.id===e.moduleId),kindInfo:g[e.kind]||g.doc}}).sort((e,t)=>{var i,a;return(((i=t.file)==null?void 0:i.uploadedAt)||"").localeCompare(((a=e.file)==null?void 0:a.uploadedAt)||"")||e.title.localeCompare(t.title)})}const S=e=>!!e.file&&(e.file.mime==="application/pdf"||/\.pdf$/i.test(e.file.name)),$=e=>!e.fileId&&!!e.url;function R(e){const t=o.search.trim().toLowerCase();return e.filter(i=>{var a,d,l;return(!o.course||i.courseId===o.course)&&(!o.kind||i.kind===o.kind)&&(!t||[i.title,(a=i.course)==null?void 0:a.title,(d=i.file)==null?void 0:d.name,(l=i.module)==null?void 0:l.title].some(T=>String(T||"").toLowerCase().includes(t)))})}function _(){const e=B(s.user.id).map(t=>b("courses",t.courseId)).filter(Boolean);o.course&&!e.some(t=>t.id===o.course)&&(m("That course isn't one of your enrolments, so all resources are shown.",{type:"warning"}),o.course="",p("course",null)),s.root.innerHTML=r`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Resources</li></ol>
        <h1 class="page-title">Resources</h1>
        <p class="page-subtitle">Notes, slides, question banks and recorded sessions for your courses.</p>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="card-header res-toolbar">
        <div class="cluster res-filters">
          <div class="search-field">
            ${n(c("Search",{size:15}))}
            <input type="search" class="form-control form-control-sm" placeholder="Search resources" aria-label="Search resources" data-search value="${o.search}">
          </div>
          <select class="form-control form-control-sm" data-filter="course" aria-label="Filter by course">
            <option value="">Course: All</option>
            ${e.map(t=>r`<option value="${t.id}" ${n(t.id===o.course?"selected":"")}>${t.title}</option>`)}
          </select>
          <select class="form-control form-control-sm" data-filter="kind" aria-label="Filter by type">
            <option value="">Type: All</option>
            ${Object.entries(g).map(([t,i])=>r`<option value="${t}" ${n(t===o.kind?"selected":"")}>${i.label}</option>`)}
          </select>
        </div>
        <div class="cluster">
          <span class="text-sm text-muted" data-total></span>
          <div class="segmented" role="group" aria-label="View">
            <button type="button" data-view="grid" aria-selected="${String(o.view==="grid")}" aria-label="Grid view">${n(c("LayoutGrid",{size:15}))}<span class="hide-sm">Grid</span></button>
            <button type="button" data-view="list" aria-selected="${String(o.view==="list")}" aria-label="List view">${n(c("List",{size:15}))}<span class="hide-sm">List</span></button>
          </div>
        </div>
      </div>
      <div data-results></div>
    </div>`}function f(){const e=L(),t=R(e),i=d=>e.filter(l=>l.kind===d).length;h("[data-kpis]",s.root).innerHTML=[w({icon:"FolderOpen",label:"All resources",value:String(e.length),tone:"blue"}),w({icon:"FileText",label:"PDFs & documents",value:String(i("pdf")+i("doc")),tone:"rust"}),w({icon:"Presentation",label:"Slides",value:String(i("slides")),tone:"amber"}),w({icon:"CirclePlay",label:"Videos & links",value:String(i("video-link")+i("link")),tone:"purple"})].join(""),h("[data-total]",s.root).textContent=k(t.length,"item");const a=h("[data-results]",s.root);if(!e.length){a.innerHTML=y({icon:"FolderOpen",title:"No resources yet",text:"Study material shared by your instructors will appear here."});return}if(!t.length){a.innerHTML=y({icon:"Search",title:"No matching resources",text:"Try a different search term or clear the filters.",actionLabel:"Clear filters",actionAttrs:"data-clear"});return}a.innerHTML=o.view==="grid"?r`<div class="card-body"><div class="grid grid-3">${t.map(U)}</div></div>`:r`<ul class="list-plain">${t.map(W)}</ul>`}function A(e){var t,i;return[((t=e.course)==null?void 0:t.code)||((i=e.course)==null?void 0:i.title),e.kindInfo.label,e.file?E(e.file.size||e.sizeBytes):$(e)?"Online":null].filter(Boolean).join(" · ")}function C(e,t){const i=a=>t?n(""):r`<span>${a}</span>`;return $(e)?r`<a class="btn btn-outline btn-sm" href="${e.url}" target="_blank" rel="noopener noreferrer" data-open-link="${e.id}">${n(c("ExternalLink",{size:15}))}${i("Open")}</a>`:e.fileId?r`
    ${S(e)?r`<button type="button" class="btn btn-ghost btn-sm" data-preview="${e.id}" aria-label="Preview ${e.title}">${n(c("Eye",{size:15}))}${i("Preview")}</button>`:n("")}
    <button type="button" class="btn btn-outline btn-sm" data-download="${e.id}" aria-label="Download ${e.title}">${n(c("Download",{size:15}))}${i("Download")}</button>`:r`<span class="text-xs text-muted">No file attached</span>`}function U(e){return r`
    <article class="res-tile">
      <div class="res-tile-top">
        <span class="icon-tile tone-${n(e.kindInfo.tone)}">${n(c(e.kindInfo.icon,{size:20}))}</span>
        <span class="badge tone-${n(e.kindInfo.tone)}">${e.kindInfo.label}</span>
      </div>
      <h3 class="res-tile-title">${e.title}</h3>
      <p class="file-tile-meta m-0">${A(e)}</p>
      <p class="file-tile-meta m-0">${e.module?"Module: "+e.module.title+" · ":""}${k(e.downloads||0,$(e)?"view":"download")}</p>
      <div class="res-tile-actions">${C(e,!1)}</div>
    </article>`}function W(e){var t;return r`
    <li class="list-row">
      <span class="icon-tile icon-tile-sm tone-${n(e.kindInfo.tone)}">${n(c(e.kindInfo.icon,{size:16}))}</span>
      <div class="list-row-main">
        <div class="list-row-title">${e.title}</div>
        <div class="list-row-sub">${A(e)}${(t=e.file)!=null&&t.uploadedAt?" · "+N(e.file.uploadedAt):""} · ${k(e.downloads||0,$(e)?"view":"download")}</div>
      </div>
      <div class="cluster res-row-actions">${C(e,!0)}</div>
    </li>`}function Y(){const e=K(()=>{p("q",o.search.trim()||null),f()},150);u(s.root,"input","[data-search]",(t,i)=>{o.search=i.value,e()}),u(s.root,"change","[data-filter]",(t,i)=>{o[i.dataset.filter]=i.value,p(i.dataset.filter==="kind"?"type":"course",i.value||null),f()}),u(s.root,"click","[data-view]",(t,i)=>{o.view=i.dataset.view,I("[data-view]",s.root).forEach(a=>a.setAttribute("aria-selected",String(a===i)));try{localStorage.setItem(H,o.view)}catch{}f()}),u(s.root,"click","[data-clear]",()=>{Object.assign(o,{search:"",course:"",kind:""}),["q","course","type"].forEach(t=>p(t,null)),h("[data-search]",s.root).value="",I("[data-filter]",s.root).forEach(t=>t.value=""),f()}),u(s.root,"click","[data-download]",(t,i)=>M(i.dataset.download,i)),u(s.root,"click","[data-preview]",(t,i)=>q(i.dataset.preview)),u(s.root,"click","[data-open-link]",(t,i)=>x(()=>D(s.user,i.dataset.openLink)))}function F(e){const t=L().find(i=>i.id===e);return t||m("That resource is no longer available — it may have been removed.",{type:"warning"}),t}async function M(e,t){const i=F(e);if(!i)return;if(!i.file)return m(`The file for "${i.title}" is missing. Ask your instructor to upload it again.`,{type:"warning"});const a=t==null?void 0:t.innerHTML;t&&(t.disabled=!0,t.innerHTML='<span class="spinner"></span>');try{await j(i.fileId),await x(()=>D(s.user,i.id),{success:`Downloading "${i.file.name}"`})}catch(d){console.error(d),m(`Couldn't download "${i.file.name}": ${z(d)}`,{type:"danger",duration:6e3})}finally{t&&t.isConnected&&(t.disabled=!1,t.innerHTML=a)}}async function q(e){const t=F(e);if(!t)return;if(!S(t))return m("Only PDF files can be previewed. Download the file to open it.",{type:"info"});p("id",t.id);const i=V.open({title:t.title,size:"xl",body:r`<div class="pdf-frame" data-frame><div class="pdf-loading"><span class="spinner"></span>Loading preview…</div></div>`,footer:r`
      <span class="text-sm text-muted res-preview-meta">${t.file.name} · ${E(t.file.size)}</span>
      <span data-newtab-slot></span>
      <button type="button" class="btn btn-primary" data-dl>${n(c("Download",{size:16}))}Download</button>`}),a=()=>p("id",null);i.root.querySelector("[data-modal-close]").addEventListener("click",a),i.root.addEventListener("mousedown",l=>l.target===i.root&&a()),i.root.querySelector("[data-dl]").addEventListener("click",l=>M(t.id,l.currentTarget));const d=i.root.querySelector("[data-frame]");try{const l=await G(t.fileId);if(!l)throw new Error("File not found.");if(!l.startsWith("blob:")&&!(await fetch(l,{method:"HEAD"})).ok)throw new Error("Could not load "+t.file.name);d.innerHTML=r`<iframe class="pdf-preview" src="${l}" title="Preview of ${t.title}"></iframe>`,i.root.querySelector("[data-newtab-slot]").outerHTML=r`<a class="btn btn-outline" href="${l}" target="_blank" rel="noopener noreferrer">${n(c("ExternalLink",{size:16}))}Open in new tab</a>`}catch(l){console.error(l),d.innerHTML=y({icon:"TriangleAlert",title:"The preview couldn't load",text:z(l)+" You can still try downloading the file."})}}

import"./modulepreload-polyfill.js";/* empty css      */import{b as V,g as R,r as s,i as p,h as n,t as W,s as Z,k as q,f as I,a0 as P,aZ as j,l as $,M as B,ar as o,D,a_ as A,q as v,a$ as z,I as O,aU as M,be as _,a as x,bE as J,d as h,aa as Q,o as N,e as f,b1 as ee,b5 as te,bb as U,cg as ae,F as se,aK as K,x as ne,N as Y,ae as F,ch as ie,bU as oe,ci as le,v as de}from"./portal-core.js";import"./vendor-icons.js";const re=["invoices","payments","structure"],ce=[{id:"upi",label:"UPI",hint:"GPay, PhonePe, Paytm",icon:"Smartphone"},{id:"card",label:"Card",hint:"Debit or credit card",icon:"CreditCard"},{id:"netbanking",label:"Net banking",hint:"All major banks",icon:"Building2"}];let c,k,w;V({id:"student-fees",portal:"student",watch:["invoices","payments","feeStructures","enrollments","settings"],mount(t){c=t,pe(),me(),H();const e=t.params.get("id");e&&L(e)},update:()=>H(),unmount(){k==null||k.destroy(),w==null||w.destroy()}});function G(){return le(c.user.id).map(t=>{const e=K(t.id);return{...t,description:t.items.map(a=>a.label).join(", "),paid:e,balance:Math.max(0,t.total-e),state:U(t)}})}function ue(){return de("payments",t=>t.studentId===c.user.id).sort((t,e)=>e.paidAt.localeCompare(t.paidAt)).map(t=>{var e;return{...t,invoiceNumber:((e=h("invoices",t.invoiceId))==null?void 0:e.number)||"—"}})}const T=t=>t.balance>0&&t.state!=="cancelled"&&t.state!=="draft";function pe(){const t=re.includes(R("tab"))?R("tab"):"invoices";c.root.innerHTML=n`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Fees &amp; Payments</li></ol>
        <h1 class="page-title">Fees &amp; Payments</h1>
        <p class="page-subtitle">Your invoices, payments and fee schedule.</p>
      </div>
      <div class="page-actions" data-actions></div>
    </div>
    <div data-alert></div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="invoices">${s(p("Receipt",{size:15}))}Invoices <span class="tab-count" data-count="invoices"></span></button>
        <button type="button" class="tab" role="tab" data-tab="payments">${s(p("History",{size:15}))}Payment history <span class="tab-count" data-count="payments"></span></button>
        <button type="button" class="tab" role="tab" data-tab="structure">${s(p("Layers",{size:15}))}Fee structure</button>
      </div>
      <div data-tab-panel="invoices"><div data-invoices-table></div></div>
      <div data-tab-panel="payments" hidden><div data-payments-table></div></div>
      <div data-tab-panel="structure" hidden><div class="card-body" data-structure></div></div>
    </div>`,W(c.root,{active:t,onChange:e=>Z("tab",e)}),k=q(v("[data-invoices-table]",c.root),{rows:[],searchKeys:["number","description"],filters:[{key:"state",label:"Status",options:[["issued","Due"],["partial","Partly paid"],["overdue","Overdue"],["paid","Paid"],["cancelled","Cancelled"]]}],columns:[{key:"number",label:"Invoice",sortable:!0,render:e=>n`<div class="cell-user-text"><span class="cell-title">${e.number}</span><span class="cell-sub">${e.description}</span></div>`},{key:"dueDate",label:"Due date",sortable:!0,render:e=>n`${$(e.dueDate)}${T(e)?n`<div class="cell-sub ${s(e.state==="overdue"?"text-danger":"")}">${B(e.dueDate)}</div>`:s("")}`},{key:"total",label:"Amount",sortable:!0,align:"right",render:e=>n`<span class="money">${o(e.total)}</span>`},{key:"balance",label:"Balance",sortable:!0,align:"right",hideBelow:"md",render:e=>n`<span class="money fw-600">${o(e.balance)}</span>`},{key:"state",label:"Status",render:e=>D(e.state,A(e.state))}],rowActions:[{label:"View details",icon:"Eye",onClick:e=>L(e.id)},{label:"Pay now",icon:"CreditCard",hidden:e=>!T(e),onClick:e=>C(e.id)},{label:"Print invoice",icon:"Printer",onClick:e=>P("Invoice "+e.number,j(e))}],onRowClick:e=>L(e.id),empty:I({icon:"Receipt",title:"No invoices yet",text:"Invoices appear here once you're enrolled in a course."})}),w=q(v("[data-payments-table]",c.root),{rows:[],searchKeys:["receiptNo","invoiceNumber","reference"],columns:[{key:"receiptNo",label:"Receipt",render:e=>n`<span class="cell-title">${e.receiptNo}</span>`},{key:"invoiceNumber",label:"Invoice",hideBelow:"md"},{key:"paidAt",label:"Date",sortable:!0,render:e=>O(e.paidAt)},{key:"method",label:"Method",render:e=>M(e.method)},{key:"amount",label:"Amount",sortable:!0,align:"right",render:e=>n`<span class="money fw-600">${o(e.amount)}</span>`},{key:"status",label:"Status",render:e=>D(e.status,e.status==="success"?"Successful":"Failed")}],rowActions:[{label:"Print receipt",icon:"Printer",hidden:e=>e.status!=="success",onClick:e=>P("Receipt "+e.receiptNo,z(e))}],empty:I({icon:"History",title:"No payments yet",text:"Payments you make will be listed here with their receipts."})})}function H(){const t=G(),e=ue(),a=_(c.user.id),i=t.filter(r=>r.state==="overdue"),l=t.filter(T).sort((r,d)=>r.dueDate.localeCompare(d.dueDate))[0];v("[data-actions]",c.root).innerHTML=n`
    <button type="button" class="btn btn-outline" data-act="statement">${s(p("Download",{size:16}))}Statement</button>
    ${l?n`<button type="button" class="btn btn-primary" data-act="pay" data-id="${l.id}">${s(p("CreditCard",{size:16}))}Pay ${o(l.balance)}</button>`:s("")}`,v("[data-alert]",c.root).innerHTML=i.length?n`<div class="alert tone-rust page-section" role="alert">
        ${s(p("TriangleAlert",{size:18}))}
        <div class="alert-body"><p class="alert-title">${o(i.reduce((r,d)=>r+d.balance,0))} is overdue</p>Clear ${i.length===1?"invoice "+i[0].number:i.length+" invoices"} to avoid late fees and keep your exam eligibility.</div>
        <div class="alert-actions"><button type="button" class="btn btn-danger btn-sm" data-act="pay" data-id="${i[0].id}">Pay now</button></div>
      </div>`:"",v("[data-kpis]",c.root).innerHTML=[x({icon:"Receipt",label:"Total fees",value:o(a.total),tone:"blue"}),x({icon:"CircleCheck",label:"Paid so far",value:o(a.paid),tone:"green"}),x({icon:"Wallet",label:"Balance due",value:o(a.balance),tone:a.balance?"amber":"slate"}),x({icon:"TriangleAlert",label:"Overdue",value:o(a.overdue),tone:a.overdue?"rust":"slate"})].join(""),v('[data-count="invoices"]',c.root).textContent=t.length,v('[data-count="payments"]',c.root).textContent=e.length,k.update(t),w.update(e),v("[data-structure]",c.root).innerHTML=be()}function be(){const t=J(c.user.id,{activeOnly:!0});return t.length?n`<div class="grid grid-2">${s(t.map(e=>{const a=h("batches",e.batchId),i=h("courses",e.courseId),l=h("feeStructures",(a==null?void 0:a.feeStructureId)||(i==null?void 0:i.feeStructureId));if(!l)return"";const r=l.components.reduce((d,u)=>d+u.amount,0);return n`
          <div class="card">
            <div class="card-header"><div><h3 class="card-title">${i==null?void 0:i.title}</h3><p class="card-subtitle">${a==null?void 0:a.name}</p></div><span class="badge tone-${s((i==null?void 0:i.tone)||"blue")}">${i==null?void 0:i.body}</span></div>
            <div class="card-body stack-sm">
              <table class="money-table">
                ${s(l.components.map(d=>n`<tr><td>${d.label}</td><td>${o(d.amount)}</td></tr>`).join(""))}
                <tr class="is-total"><td>Course fee</td><td>${o(r)}</td></tr>
              </table>
              <div class="divider"></div>
              <h4 class="drawer-section-title">Installment schedule</h4>
              <ul class="timeline">
                ${s(l.installments.map(d=>n`<li class="timeline-item"><span class="timeline-dot"></span><div><div class="timeline-title">${d.label} — ${o(Math.round(r*d.pct/100))}</div><div class="timeline-meta">${d.pct}% · due ${$(Q(e.enrolledAt.slice(0,10),d.dueOffsetDays))}</div></div></li>`).join(""))}
              </ul>
              ${l.lateFee?n`<p class="text-sm text-muted m-0">Late fee of ${o(l.lateFee.amount)} applies ${l.lateFee.graceDays} days after the due date.</p>`:s("")}
            </div>
          </div>`}).join(""))}</div>`:I({icon:"Layers",title:"No active enrolments",text:"Your course fee structure appears here after enrolment."})}function me(){N(c.root,"click",'[data-act="pay"]',(t,e)=>C(e.dataset.id)),N(c.root,"click",'[data-act="statement"]',()=>{const t=G();if(!t.length)return f("There are no invoices to export yet.",{type:"info"});ee("om-academy-fee-statement.csv",t,[{key:"number",label:"Invoice"},{key:"description",label:"Description"},{label:"Issued",value:e=>$(e.issuedAt)},{label:"Due",value:e=>$(e.dueDate)},{key:"total",label:"Amount (INR)"},{key:"paid",label:"Paid (INR)"},{key:"balance",label:"Balance (INR)"},{label:"Status",value:e=>A(e.state)}]),f("Statement downloaded.",{type:"success"})})}function L(t){var u,m;const e=h("invoices",t);if(!e||e.studentId!==c.user.id){f("That invoice couldn't be found.",{type:"warning"});return}const a=te(e),i=U(e),l=ae(e.id),r=a.balance>0&&i!=="cancelled",d=se.open({title:"Invoice details",body:n`
      <div class="cluster-between section-gap">
        <div><div class="text-muted text-sm">Invoice</div><div class="fw-700 text-lg text-title">${e.number}</div></div>
        ${s(D(i,A(i)))}
      </div>
      <dl class="kv-list drawer-section">
        <dt>Issued</dt><dd>${$(e.issuedAt)}</dd>
        <dt>Due date</dt><dd>${$(e.dueDate)}${r?n` <span class="text-muted text-sm">· ${B(e.dueDate)}</span>`:s("")}</dd>
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Charges</h4>
        <table class="money-table">
          ${s(e.items.map(b=>n`<tr><td>${b.label}</td><td>${o(b.amount)}</td></tr>`).join(""))}
          ${a.discount?n`<tr><td>Discount${(u=e.discount)!=null&&u.reason?" · "+e.discount.reason:""}</td><td>− ${o(a.discount)}</td></tr>`:s("")}
          ${a.lateFee?n`<tr><td>Late fee</td><td>${o(a.lateFee)}</td></tr>`:s("")}
          ${a.tax?n`<tr><td>GST</td><td>${o(a.tax)}</td></tr>`:s("")}
          <tr class="is-total"><td>Total</td><td>${o(a.total)}</td></tr>
          <tr><td>Paid</td><td>${o(a.paid)}</td></tr>
          <tr class="is-total"><td>Balance due</td><td>${o(a.balance)}</td></tr>
        </table>
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Payments</h4>
        ${l.length?n`<div class="stack-sm">${s(l.map(b=>n`<div class="file-tile"><span class="icon-tile icon-tile-sm tone-green">${s(p("CircleCheck",{size:16}))}</span><div class="file-tile-main"><div class="file-tile-name">${o(b.amount)} · ${M(b.method)}</div><div class="file-tile-meta">${b.receiptNo} · ${O(b.paidAt)}</div></div><button type="button" class="btn btn-ghost btn-sm btn-icon" data-receipt="${b.id}" aria-label="Print receipt">${s(p("Printer",{size:15}))}</button></div>`).join(""))}</div>`:n`<p class="text-muted m-0">No payments against this invoice yet.</p>`}
      </div>`,footer:n`
      <button type="button" class="btn btn-outline" data-d="print">${s(p("Printer",{size:16}))}Print</button>
      ${r?n`<button type="button" class="btn btn-primary" data-d="pay">${s(p("CreditCard",{size:16}))}Pay ${o(a.balance)}</button>`:s("")}`});d.root.querySelector('[data-d="print"]').addEventListener("click",()=>P("Invoice "+e.number,j(e))),(m=d.root.querySelector('[data-d="pay"]'))==null||m.addEventListener("click",()=>{d.close(),C(e.id)}),N(d.root,"click","[data-receipt]",(b,S)=>{const g=h("payments",S.dataset.receipt);g&&P("Receipt "+g.receiptNo,z(g))})}function C(t){const e=h("invoices",t);if(!e)return f("That invoice couldn't be found.",{type:"warning"});const a=Math.max(0,e.total-K(e.id));if(a<=0)return f("This invoice is already fully paid.",{type:"info"});const i=(ne("settings").fees||{}).allowPartial!==!1,l=Y.open({title:"Pay fees",size:"md",body:n`
      <div class="pay-summary">
        <div><div class="text-muted text-sm">Invoice ${e.number}</div><div class="fw-600 text-title">${e.items.map(u=>u.label).join(", ")}</div></div>
        <div class="text-right"><div class="text-muted text-sm">Balance due</div><div class="pay-amount">${o(a)}</div></div>
      </div>
      <form data-pay-form class="stack" novalidate>
        <div class="form-field">
          <label class="form-label" for="pay-amount">Amount to pay (₹)</label>
          <input id="pay-amount" class="form-control" name="amount" type="number" min="1" max="${a}" step="1" value="${a}" ${s(i?"":"readonly")}>
          <p class="field-help">${i?"You can pay part of the balance now and the rest later.":"This invoice must be paid in full."}</p>
          <p class="field-error" data-error-for="amount" hidden></p>
        </div>
        <fieldset class="pay-methods">
          <legend class="form-label">Payment method</legend>
          ${s(ce.map((u,m)=>n`<label class="pay-method"><input type="radio" name="method" value="${u.id}" ${s(m===0?"checked":"")}><span class="pay-method-ico">${s(p(u.icon,{size:20}))}</span><span><span class="pay-method-name">${u.label}</span><span class="pay-method-hint">${u.hint}</span></span></label>`).join(""))}
        </fieldset>
        <div class="alert tone-blue">${s(p("ShieldCheck",{size:18}))}<div class="alert-body">Demo checkout — no card, UPI or bank details are collected. Choose the outcome you want to simulate.</div></div>
      </form>`,footer:n`
      <button type="button" class="btn btn-outline" data-sim="failure">Simulate failure</button>
      <button type="button" class="btn btn-primary" data-sim="success">${s(p("Lock",{size:15}))}<span data-pay-label>Pay ${o(a)}</span></button>`}),r=l.root.querySelector("[data-pay-form]"),d=r.elements.namedItem("amount");d.addEventListener("input",()=>{l.root.querySelector("[data-pay-label]").textContent="Pay "+o(Number(d.value)||0)}),l.root.querySelectorAll("[data-sim]").forEach(u=>u.addEventListener("click",async()=>{var E;const m=Math.round(Number(d.value));if(!Number.isFinite(m)||m<1||m>a){F(r,{amount:`Enter an amount between ₹1 and ${o(a)}.`});return}F(r,{});const b=((E=r.querySelector('input[name="method"]:checked'))==null?void 0:E.value)||"upi",S=u.dataset.sim;l.root.querySelectorAll("[data-sim]").forEach(y=>y.disabled=!0);const g=u.innerHTML;u.innerHTML='<span class="spinner"></span>Processing…',await new Promise(y=>setTimeout(y,900));try{const y=await ie(c.user,t,m,b,S);l.close(),ve(y,t)}catch(y){u.innerHTML=g,l.root.querySelectorAll("[data-sim]").forEach(X=>X.disabled=!1),l.root.querySelector(".modal-body").insertAdjacentHTML("afterbegin",n`<div class="alert tone-rust section-gap" role="alert">${s(p("CircleX",{size:18}))}<div class="alert-body">${oe(y)}</div></div>`)}}))}function ve(t,e){var l,r;const a=t.status==="success",i=Y.open({title:a?"Payment successful":"Payment failed",size:"sm",body:n`
      <div class="text-center">
        <div class="result-icon tone-${s(a?"green":"rust")}">${s(p(a?"CircleCheck":"CircleX",{size:30}))}</div>
        <p class="fw-700 text-title text-lg m-0">${a?o(t.amount)+" received":"The payment didn't go through"}</p>
        <p class="text-muted">${a?`Receipt ${t.receiptNo} · ${M(t.method)}`:"This was a simulated failure. No money was deducted — you can try again."}</p>
      </div>`,footer:a?n`<button type="button" class="btn btn-outline" data-r="print">${s(p("Printer",{size:16}))}Print receipt</button><button type="button" class="btn btn-primary" data-r="done">Done</button>`:n`<button type="button" class="btn btn-outline" data-r="done">Close</button><button type="button" class="btn btn-primary" data-r="retry">Try again</button>`});i.root.querySelector('[data-r="done"]').addEventListener("click",i.close),(l=i.root.querySelector('[data-r="print"]'))==null||l.addEventListener("click",()=>P("Receipt "+t.receiptNo,z(t))),(r=i.root.querySelector('[data-r="retry"]'))==null||r.addEventListener("click",()=>{i.close(),C(e)}),a?f("Payment successful — receipt "+t.receiptNo,{type:"success"}):f("Payment failed (simulated). No money was deducted.",{type:"danger"})}

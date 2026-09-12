/*
Author       : OM Academy
Description  : Student → Fees & Payments (reference page for the student portal).
               Pattern: mount() renders the layout once and creates the tables; refresh() repaints KPIs/alerts and
               calls table.update(), so search/paging survive live updates from other tabs.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, modal, drawer, dataTable, badge, statCard, emptyState, tabs, printDoc, downloadCsv, setSearchParam, getSearchParam, showErrors } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, date, dateTime, dueIn } from "../core/format.js";
import { invoiceDoc, receiptDoc, invoiceBreakdown, invoiceStatusLabel, paymentMethodLabel } from "../core/docs.js";
import { addDays } from "../core/clock.js";
import { friendlyMessage } from "../core/errors.js";

const TABS = ["invoices", "payments", "structure"];
const METHODS = [
  { id: "upi", label: "UPI", hint: "GPay, PhonePe, Paytm", icon: "Smartphone" },
  { id: "card", label: "Card", hint: "Debit or credit card", icon: "CreditCard" },
  { id: "netbanking", label: "Net banking", hint: "All major banks", icon: "Building2" },
];

let ctx;
let invoicesTable;
let paymentsTable;

boot({
  id: "student-fees",
  portal: "student",
  watch: ["invoices", "payments", "feeStructures", "enrollments", "settings"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openInvoice(id);
  },
  update: () => refresh(),
  unmount() {
    invoicesTable?.destroy();
    paymentsTable?.destroy();
  },
});

/* ---------- data ---------- */

function invoiceRows() {
  return sel.invoicesForStudent(ctx.user.id).map((inv) => {
    const paid = sel.paidAmount(inv.id);
    return { ...inv, description: inv.items.map((i) => i.label).join(", "), paid, balance: Math.max(0, inv.total - paid), state: sel.invoiceStatus(inv) };
  });
}

function paymentRows() {
  return store
    .where("payments", (p) => p.studentId === ctx.user.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map((p) => ({ ...p, invoiceNumber: store.byId("invoices", p.invoiceId)?.number || "—" }));
}

const payable = (row) => row.balance > 0 && row.state !== "cancelled" && row.state !== "draft";

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "invoices";
  ctx.root.innerHTML = html`
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
        <button type="button" class="tab" role="tab" data-tab="invoices">${raw(icon("Receipt", { size: 15 }))}Invoices <span class="tab-count" data-count="invoices"></span></button>
        <button type="button" class="tab" role="tab" data-tab="payments">${raw(icon("History", { size: 15 }))}Payment history <span class="tab-count" data-count="payments"></span></button>
        <button type="button" class="tab" role="tab" data-tab="structure">${raw(icon("Layers", { size: 15 }))}Fee structure</button>
      </div>
      <div data-tab-panel="invoices"><div data-invoices-table></div></div>
      <div data-tab-panel="payments" hidden><div data-payments-table></div></div>
      <div data-tab-panel="structure" hidden><div class="card-body" data-structure></div></div>
    </div>`;

  tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });

  invoicesTable = dataTable(qs("[data-invoices-table]", ctx.root), {
    rows: [],
    searchKeys: ["number", "description"],
    filters: [{ key: "state", label: "Status", options: [["issued", "Due"], ["partial", "Partly paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"]] }],
    columns: [
      { key: "number", label: "Invoice", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.number}</span><span class="cell-sub">${r.description}</span></div>` },
      { key: "dueDate", label: "Due date", sortable: true, render: (r) => html`${date(r.dueDate)}${payable(r) ? html`<div class="cell-sub ${raw(r.state === "overdue" ? "text-danger" : "")}">${dueIn(r.dueDate)}</div>` : raw("")}` },
      { key: "total", label: "Amount", sortable: true, align: "right", render: (r) => html`<span class="money">${money(r.total)}</span>` },
      { key: "balance", label: "Balance", sortable: true, align: "right", hideBelow: "md", render: (r) => html`<span class="money fw-600">${money(r.balance)}</span>` },
      { key: "state", label: "Status", render: (r) => badge(r.state, invoiceStatusLabel(r.state)) },
    ],
    rowActions: [
      { label: "View details", icon: "Eye", onClick: (r) => openInvoice(r.id) },
      { label: "Pay now", icon: "CreditCard", hidden: (r) => !payable(r), onClick: (r) => payFlow(r.id) },
      { label: "Print invoice", icon: "Printer", onClick: (r) => printDoc("Invoice " + r.number, invoiceDoc(r)) },
    ],
    onRowClick: (r) => openInvoice(r.id),
    empty: emptyState({ icon: "Receipt", title: "No invoices yet", text: "Invoices appear here once you're enrolled in a course." }),
  });

  paymentsTable = dataTable(qs("[data-payments-table]", ctx.root), {
    rows: [],
    searchKeys: ["receiptNo", "invoiceNumber", "reference"],
    columns: [
      { key: "receiptNo", label: "Receipt", render: (r) => html`<span class="cell-title">${r.receiptNo}</span>` },
      { key: "invoiceNumber", label: "Invoice", hideBelow: "md" },
      { key: "paidAt", label: "Date", sortable: true, render: (r) => dateTime(r.paidAt) },
      { key: "method", label: "Method", render: (r) => paymentMethodLabel(r.method) },
      { key: "amount", label: "Amount", sortable: true, align: "right", render: (r) => html`<span class="money fw-600">${money(r.amount)}</span>` },
      { key: "status", label: "Status", render: (r) => badge(r.status, r.status === "success" ? "Successful" : "Failed") },
    ],
    rowActions: [{ label: "Print receipt", icon: "Printer", hidden: (r) => r.status !== "success", onClick: (r) => printDoc("Receipt " + r.receiptNo, receiptDoc(r)) }],
    empty: emptyState({ icon: "History", title: "No payments yet", text: "Payments you make will be listed here with their receipts." }),
  });
}

function refresh() {
  const rows = invoiceRows();
  const pays = paymentRows();
  const s = sel.feeSummary(ctx.user.id);
  const overdue = rows.filter((r) => r.state === "overdue");
  const nextDue = rows.filter(payable).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  qs("[data-actions]", ctx.root).innerHTML = html`
    <button type="button" class="btn btn-outline" data-act="statement">${raw(icon("Download", { size: 16 }))}Statement</button>
    ${nextDue ? html`<button type="button" class="btn btn-primary" data-act="pay" data-id="${nextDue.id}">${raw(icon("CreditCard", { size: 16 }))}Pay ${money(nextDue.balance)}</button>` : raw("")}`;

  qs("[data-alert]", ctx.root).innerHTML = overdue.length
    ? html`<div class="alert tone-rust page-section" role="alert">
        ${raw(icon("TriangleAlert", { size: 18 }))}
        <div class="alert-body"><p class="alert-title">${money(overdue.reduce((t, r) => t + r.balance, 0))} is overdue</p>Clear ${overdue.length === 1 ? "invoice " + overdue[0].number : overdue.length + " invoices"} to avoid late fees and keep your exam eligibility.</div>
        <div class="alert-actions"><button type="button" class="btn btn-danger btn-sm" data-act="pay" data-id="${overdue[0].id}">Pay now</button></div>
      </div>`
    : "";

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "Receipt", label: "Total fees", value: money(s.total), tone: "blue" }),
    statCard({ icon: "CircleCheck", label: "Paid so far", value: money(s.paid), tone: "green" }),
    statCard({ icon: "Wallet", label: "Balance due", value: money(s.balance), tone: s.balance ? "amber" : "slate" }),
    statCard({ icon: "TriangleAlert", label: "Overdue", value: money(s.overdue), tone: s.overdue ? "rust" : "slate" }),
  ].join("");

  qs('[data-count="invoices"]', ctx.root).textContent = rows.length;
  qs('[data-count="payments"]', ctx.root).textContent = pays.length;
  invoicesTable.update(rows);
  paymentsTable.update(pays);
  qs("[data-structure]", ctx.root).innerHTML = structureHtml();
}

function structureHtml() {
  const enrollments = sel.studentEnrollments(ctx.user.id, { activeOnly: true });
  if (!enrollments.length) return emptyState({ icon: "Layers", title: "No active enrolments", text: "Your course fee structure appears here after enrolment." });
  return html`<div class="grid grid-2">${raw(
    enrollments
      .map((enr) => {
        const batch = store.byId("batches", enr.batchId);
        const course = store.byId("courses", enr.courseId);
        const fs = store.byId("feeStructures", batch?.feeStructureId || course?.feeStructureId);
        if (!fs) return "";
        const total = fs.components.reduce((t, c) => t + c.amount, 0);
        return html`
          <div class="card">
            <div class="card-header"><div><h3 class="card-title">${course?.title}</h3><p class="card-subtitle">${batch?.name}</p></div><span class="badge tone-${raw(course?.tone || "blue")}">${course?.body}</span></div>
            <div class="card-body stack-sm">
              <table class="money-table">
                ${raw(fs.components.map((c) => html`<tr><td>${c.label}</td><td>${money(c.amount)}</td></tr>`).join(""))}
                <tr class="is-total"><td>Course fee</td><td>${money(total)}</td></tr>
              </table>
              <div class="divider"></div>
              <h4 class="drawer-section-title">Installment schedule</h4>
              <ul class="timeline">
                ${raw(fs.installments.map((i) => html`<li class="timeline-item"><span class="timeline-dot"></span><div><div class="timeline-title">${i.label} — ${money(Math.round((total * i.pct) / 100))}</div><div class="timeline-meta">${i.pct}% · due ${date(addDays(enr.enrolledAt.slice(0, 10), i.dueOffsetDays))}</div></div></li>`).join(""))}
              </ul>
              ${fs.lateFee ? html`<p class="text-sm text-muted m-0">Late fee of ${money(fs.lateFee.amount)} applies ${fs.lateFee.graceDays} days after the due date.</p>` : raw("")}
            </div>
          </div>`;
      })
      .join("")
  )}</div>`;
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="pay"]', (e, btn) => payFlow(btn.dataset.id));
  on(ctx.root, "click", '[data-act="statement"]', () => {
    const rows = invoiceRows();
    if (!rows.length) return toast("There are no invoices to export yet.", { type: "info" });
    downloadCsv("om-academy-fee-statement.csv", rows, [
      { key: "number", label: "Invoice" },
      { key: "description", label: "Description" },
      { label: "Issued", value: (r) => date(r.issuedAt) },
      { label: "Due", value: (r) => date(r.dueDate) },
      { key: "total", label: "Amount (INR)" },
      { key: "paid", label: "Paid (INR)" },
      { key: "balance", label: "Balance (INR)" },
      { label: "Status", value: (r) => invoiceStatusLabel(r.state) },
    ]);
    toast("Statement downloaded.", { type: "success" });
  });
}

function openInvoice(id) {
  const inv = store.byId("invoices", id);
  if (!inv || inv.studentId !== ctx.user.id) {
    toast("That invoice couldn't be found.", { type: "warning" });
    return;
  }
  const b = invoiceBreakdown(inv);
  const state = sel.invoiceStatus(inv);
  const pays = sel.paymentsForInvoice(inv.id);
  const canPay = b.balance > 0 && state !== "cancelled";
  const d = drawer.open({
    title: "Invoice details",
    body: html`
      <div class="cluster-between section-gap">
        <div><div class="text-muted text-sm">Invoice</div><div class="fw-700 text-lg text-title">${inv.number}</div></div>
        ${raw(badge(state, invoiceStatusLabel(state)))}
      </div>
      <dl class="kv-list drawer-section">
        <dt>Issued</dt><dd>${date(inv.issuedAt)}</dd>
        <dt>Due date</dt><dd>${date(inv.dueDate)}${canPay ? html` <span class="text-muted text-sm">· ${dueIn(inv.dueDate)}</span>` : raw("")}</dd>
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Charges</h4>
        <table class="money-table">
          ${raw(inv.items.map((i) => html`<tr><td>${i.label}</td><td>${money(i.amount)}</td></tr>`).join(""))}
          ${b.discount ? html`<tr><td>Discount${inv.discount?.reason ? " · " + inv.discount.reason : ""}</td><td>− ${money(b.discount)}</td></tr>` : raw("")}
          ${b.lateFee ? html`<tr><td>Late fee</td><td>${money(b.lateFee)}</td></tr>` : raw("")}
          ${b.tax ? html`<tr><td>GST</td><td>${money(b.tax)}</td></tr>` : raw("")}
          <tr class="is-total"><td>Total</td><td>${money(b.total)}</td></tr>
          <tr><td>Paid</td><td>${money(b.paid)}</td></tr>
          <tr class="is-total"><td>Balance due</td><td>${money(b.balance)}</td></tr>
        </table>
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Payments</h4>
        ${pays.length
          ? html`<div class="stack-sm">${raw(pays.map((p) => html`<div class="file-tile"><span class="icon-tile icon-tile-sm tone-green">${raw(icon("CircleCheck", { size: 16 }))}</span><div class="file-tile-main"><div class="file-tile-name">${money(p.amount)} · ${paymentMethodLabel(p.method)}</div><div class="file-tile-meta">${p.receiptNo} · ${dateTime(p.paidAt)}</div></div><button type="button" class="btn btn-ghost btn-sm btn-icon" data-receipt="${p.id}" aria-label="Print receipt">${raw(icon("Printer", { size: 15 }))}</button></div>`).join(""))}</div>`
          : html`<p class="text-muted m-0">No payments against this invoice yet.</p>`}
      </div>`,
    footer: html`
      <button type="button" class="btn btn-outline" data-d="print">${raw(icon("Printer", { size: 16 }))}Print</button>
      ${canPay ? html`<button type="button" class="btn btn-primary" data-d="pay">${raw(icon("CreditCard", { size: 16 }))}Pay ${money(b.balance)}</button>` : raw("")}`,
  });
  d.root.querySelector('[data-d="print"]').addEventListener("click", () => printDoc("Invoice " + inv.number, invoiceDoc(inv)));
  d.root.querySelector('[data-d="pay"]')?.addEventListener("click", () => {
    d.close();
    payFlow(inv.id);
  });
  on(d.root, "click", "[data-receipt]", (e, btn) => {
    const p = store.byId("payments", btn.dataset.receipt);
    if (p) printDoc("Receipt " + p.receiptNo, receiptDoc(p));
  });
}

/* ---------- mock checkout ---------- */

function payFlow(invoiceId) {
  const inv = store.byId("invoices", invoiceId);
  if (!inv) return toast("That invoice couldn't be found.", { type: "warning" });
  const balance = Math.max(0, inv.total - sel.paidAmount(inv.id));
  if (balance <= 0) return toast("This invoice is already fully paid.", { type: "info" });
  const allowPartial = (store.get("settings").fees || {}).allowPartial !== false;

  const m = modal.open({
    title: "Pay fees",
    size: "md",
    body: html`
      <div class="pay-summary">
        <div><div class="text-muted text-sm">Invoice ${inv.number}</div><div class="fw-600 text-title">${inv.items.map((i) => i.label).join(", ")}</div></div>
        <div class="text-right"><div class="text-muted text-sm">Balance due</div><div class="pay-amount">${money(balance)}</div></div>
      </div>
      <form data-pay-form class="stack" novalidate>
        <div class="form-field">
          <label class="form-label" for="pay-amount">Amount to pay (₹)</label>
          <input id="pay-amount" class="form-control" name="amount" type="number" min="1" max="${balance}" step="1" value="${balance}" ${raw(allowPartial ? "" : "readonly")}>
          <p class="field-help">${allowPartial ? "You can pay part of the balance now and the rest later." : "This invoice must be paid in full."}</p>
          <p class="field-error" data-error-for="amount" hidden></p>
        </div>
        <fieldset class="pay-methods">
          <legend class="form-label">Payment method</legend>
          ${raw(METHODS.map((mt, i) => html`<label class="pay-method"><input type="radio" name="method" value="${mt.id}" ${raw(i === 0 ? "checked" : "")}><span class="pay-method-ico">${raw(icon(mt.icon, { size: 20 }))}</span><span><span class="pay-method-name">${mt.label}</span><span class="pay-method-hint">${mt.hint}</span></span></label>`).join(""))}
        </fieldset>
        <div class="alert tone-blue">${raw(icon("ShieldCheck", { size: 18 }))}<div class="alert-body">Demo checkout — no card, UPI or bank details are collected. Choose the outcome you want to simulate.</div></div>
      </form>`,
    footer: html`
      <button type="button" class="btn btn-outline" data-sim="failure">Simulate failure</button>
      <button type="button" class="btn btn-primary" data-sim="success">${raw(icon("Lock", { size: 15 }))}<span data-pay-label>Pay ${money(balance)}</span></button>`,
  });

  const form = m.root.querySelector("[data-pay-form]");
  const amountInput = form.elements.namedItem("amount");
  amountInput.addEventListener("input", () => {
    m.root.querySelector("[data-pay-label]").textContent = "Pay " + money(Number(amountInput.value) || 0);
  });

  m.root.querySelectorAll("[data-sim]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const amount = Math.round(Number(amountInput.value));
      if (!Number.isFinite(amount) || amount < 1 || amount > balance) {
        showErrors(form, { amount: `Enter an amount between ₹1 and ${money(balance)}.` });
        return;
      }
      showErrors(form, {});
      const method = form.querySelector('input[name="method"]:checked')?.value || "upi";
      const outcome = btn.dataset.sim;
      m.root.querySelectorAll("[data-sim]").forEach((b) => (b.disabled = true));
      const original = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>Processing…`;
      await new Promise((r) => setTimeout(r, 900));
      try {
        const payment = await services.payInvoiceOnline(ctx.user, invoiceId, amount, method, outcome);
        m.close();
        showResult(payment, invoiceId);
      } catch (err) {
        btn.innerHTML = original;
        m.root.querySelectorAll("[data-sim]").forEach((b) => (b.disabled = false));
        m.root.querySelector(".modal-body").insertAdjacentHTML("afterbegin", html`<div class="alert tone-rust section-gap" role="alert">${raw(icon("CircleX", { size: 18 }))}<div class="alert-body">${friendlyMessage(err)}</div></div>`);
      }
    })
  );
}

function showResult(payment, invoiceId) {
  const ok = payment.status === "success";
  const m = modal.open({
    title: ok ? "Payment successful" : "Payment failed",
    size: "sm",
    body: html`
      <div class="text-center">
        <div class="result-icon tone-${raw(ok ? "green" : "rust")}">${raw(icon(ok ? "CircleCheck" : "CircleX", { size: 30 }))}</div>
        <p class="fw-700 text-title text-lg m-0">${ok ? money(payment.amount) + " received" : "The payment didn't go through"}</p>
        <p class="text-muted">${ok ? `Receipt ${payment.receiptNo} · ${paymentMethodLabel(payment.method)}` : "This was a simulated failure. No money was deducted — you can try again."}</p>
      </div>`,
    footer: ok
      ? html`<button type="button" class="btn btn-outline" data-r="print">${raw(icon("Printer", { size: 16 }))}Print receipt</button><button type="button" class="btn btn-primary" data-r="done">Done</button>`
      : html`<button type="button" class="btn btn-outline" data-r="done">Close</button><button type="button" class="btn btn-primary" data-r="retry">Try again</button>`,
  });
  m.root.querySelector('[data-r="done"]').addEventListener("click", m.close);
  m.root.querySelector('[data-r="print"]')?.addEventListener("click", () => printDoc("Receipt " + payment.receiptNo, receiptDoc(payment)));
  m.root.querySelector('[data-r="retry"]')?.addEventListener("click", () => {
    m.close();
    payFlow(invoiceId);
  });
  if (ok) toast("Payment successful — receipt " + payment.receiptNo, { type: "success" });
  else toast("Payment failed (simulated). No money was deducted.", { type: "danger" });
}

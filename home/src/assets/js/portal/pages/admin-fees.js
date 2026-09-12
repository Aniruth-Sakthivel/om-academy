/*
Author       : OM Academy
Description  : Staff → Fees & Payments (reference page for the admin portal).
               KPIs, collections + dues-aging charts, invoices (permission-gated row actions, bulk reminders),
               payments, fee structures. Every mutation goes through services via errors.run().
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import { html, raw, on, qs, toast, modal, drawer, dataTable, badge, statCard, emptyState, tabs, printDoc, downloadCsv, setSearchParam, getSearchParam, confirm, avatar } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { money, moneyShort, date, dateTime, dueIn, monthYear, pct } from "../core/format.js";
import { invoiceDoc, receiptDoc, invoiceBreakdown, invoiceStatusLabel, paymentMethodLabel, PAYMENT_METHODS } from "../core/docs.js";
import { today, addDays } from "../core/clock.js";
import { areaChart, barChart, palette } from "../core/charts.js";
import { run } from "../core/errors.js";

const TABS = ["invoices", "payments", "structures"];

let ctx;
let invTable;
let payTable;
// Live chart instances (Promises, since ApexCharts loads lazily). Created once, then updated in place.
let revChart = null;
let agingChart = null;

boot({
  id: "admin-fees",
  portal: "admin",
  perm: ["fees.view"],
  watch: ["invoices", "payments", "feeStructures", "users", "enrollments", "batches"],
  mount(c) {
    ctx = c;
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) openInvoice(id);
  },
  // Redraw charts only when money data changed, so unrelated live updates don't make them flicker.
  update: (changed) => refresh({ charts: changed.has("payments") || changed.has("invoices") }),
  unmount() {
    invTable?.destroy();
    payTable?.destroy();
    destroyCharts();
  },
});

/* ---------- data ---------- */

const userById = (id) => store.byId("users", id);

function invoiceRows() {
  return store
    .get("invoices")
    .map((inv) => {
      const st = userById(inv.studentId);
      const paid = sel.paidAmount(inv.id);
      return { ...inv, studentName: st?.name || "—", rollNo: st?.rollNo || "", centerId: st?.centerId || "", description: inv.items.map((i) => i.label).join(", "), paid, balance: Math.max(0, inv.total - paid), state: sel.invoiceStatus(inv) };
    })
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

function paymentRows() {
  return store
    .get("payments")
    .map((p) => ({ ...p, studentName: userById(p.studentId)?.name || "—", invoiceNumber: store.byId("invoices", p.invoiceId)?.number || "—", recorder: p.recordedBy ? userById(p.recordedBy)?.name || "Staff" : "Online" }))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

const open = (r) => r.balance > 0 && r.state !== "cancelled" && r.state !== "draft";

function kpis() {
  const month = today().slice(0, 7);
  const success = store.where("payments", (p) => p.status === "success");
  const collectedMonth = success.filter((p) => p.paidAt.slice(0, 7) === month).reduce((t, p) => t + p.amount, 0);
  const live = store.where("invoices", (i) => i.status !== "cancelled" && i.status !== "draft");
  const billed = live.reduce((t, i) => t + i.total, 0);
  const paid = live.reduce((t, i) => t + sel.paidAmount(i.id), 0);
  const overdue = sel.overdueInvoices();
  const overdueAmt = overdue.reduce((t, i) => t + Math.max(0, i.total - sel.paidAmount(i.id)), 0);
  return { collectedMonth, outstanding: Math.max(0, billed - paid), overdueAmt, overdueCount: overdue.length, rate: billed ? (paid / billed) * 100 : 0 };
}

/* ---------- layout ---------- */

function renderLayout() {
  const active = TABS.includes(getSearchParam("tab")) ? getSearchParam("tab") : "invoices";
  const canManage = ctx.can("invoices.manage");
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="admin-dashboard.html">Dashboard</a></li><li>Fees &amp; Payments</li></ol>
        <h1 class="page-title">Fees &amp; Payments</h1>
        <p class="page-subtitle">Invoices, collections and fee structures across all centers.</p>
      </div>
      <div class="page-actions">
        <button type="button" class="btn btn-outline" data-act="export">${raw(icon("Download", { size: 16 }))}Export</button>
        ${canManage ? html`<button type="button" class="btn btn-outline" data-act="bulk">${raw(icon("Layers", { size: 16 }))}Bulk invoice</button>` : raw("")}
        ${canManage ? html`<button type="button" class="btn btn-primary" data-act="new">${raw(icon("Plus", { size: 16 }))}New invoice</button>` : raw("")}
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="grid grid-main-side page-section">
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Collections</h3><p class="card-subtitle">Successful payments, last 6 months</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart-revenue></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div><h3 class="card-title">Overdue by age</h3><p class="card-subtitle">Outstanding balance past due date</p></div></div>
        <div class="card-body"><div class="chart-box" data-chart-aging></div></div>
      </div>
    </div>
    <div class="card">
      <div class="tabs" data-tab-list role="tablist">
        <button type="button" class="tab" role="tab" data-tab="invoices">${raw(icon("Receipt", { size: 15 }))}Invoices <span class="tab-count" data-count="invoices"></span></button>
        <button type="button" class="tab" role="tab" data-tab="payments">${raw(icon("History", { size: 15 }))}Payments <span class="tab-count" data-count="payments"></span></button>
        <button type="button" class="tab" role="tab" data-tab="structures">${raw(icon("Layers", { size: 15 }))}Fee structures</button>
      </div>
      <div data-tab-panel="invoices"><div data-inv-table></div></div>
      <div data-tab-panel="payments" hidden><div data-pay-table></div></div>
      <div data-tab-panel="structures" hidden><div class="card-body" data-structures></div></div>
    </div>`;

  tabs(ctx.root, { active, onChange: (id) => setSearchParam("tab", id) });

  const centers = store.get("centers");
  invTable = dataTable(qs("[data-inv-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["number", "studentName", "rollNo", "description"],
    filters: [
      { key: "state", label: "Status", options: [["issued", "Due"], ["partial", "Partly paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"]] },
      { key: "centerId", label: "Center", options: centers.map((c) => [c.id, c.name]) },
    ],
    columns: [
      { key: "number", label: "Invoice", sortable: true, render: (r) => html`<div class="cell-user-text"><span class="cell-title">${r.number}</span><span class="cell-sub">${r.description}</span></div>` },
      { key: "studentName", label: "Student", sortable: true, render: (r) => html`<div class="cell-user">${raw(avatar({ name: r.studentName, size: "sm" }))}<div class="cell-user-text"><span class="cell-title">${r.studentName}</span><span class="cell-sub">${r.rollNo}</span></div></div>` },
      { key: "dueDate", label: "Due", sortable: true, hideBelow: "md", render: (r) => html`${date(r.dueDate)}${open(r) ? html`<div class="cell-sub ${raw(r.state === "overdue" ? "text-danger" : "")}">${dueIn(r.dueDate)}</div>` : raw("")}` },
      { key: "total", label: "Amount", sortable: true, align: "right", render: (r) => html`<span class="money">${money(r.total)}</span>` },
      { key: "balance", label: "Balance", sortable: true, align: "right", render: (r) => html`<span class="money fw-600">${money(r.balance)}</span>` },
      { key: "state", label: "Status", render: (r) => badge(r.state, invoiceStatusLabel(r.state)) },
    ],
    rowActions: [
      { label: "View details", icon: "Eye", onClick: (r) => openInvoice(r.id) },
      { label: "Record payment", icon: "IndianRupee", perm: "payments.record", hidden: (r) => !open(r), onClick: (r) => recordPaymentFlow(r.id) },
      { label: "Send reminder", icon: "BellRing", perm: "fees.remind", hidden: (r) => !open(r), onClick: (r) => remind([r.id]) },
      { label: "Apply discount", icon: "Receipt", perm: "fees.waive", hidden: (r) => !open(r), onClick: (r) => discountFlow(r.id) },
      { label: "Print invoice", icon: "Printer", onClick: (r) => printDoc("Invoice " + r.number, invoiceDoc(r)) },
      { label: "Cancel invoice", icon: "Ban", perm: "invoices.manage", danger: true, hidden: (r) => r.paid > 0 || r.state === "cancelled", onClick: (r) => cancelFlow(r.id) },
    ],
    bulkActions: ctx.can("fees.remind") ? [{ id: "remind", label: "Send reminders", onClick: (rows) => remind(rows.filter(open).map((r) => r.id)) }] : [],
    onRowClick: (r) => openInvoice(r.id),
    empty: emptyState({ icon: "Receipt", title: "No invoices match", text: "Try a different search or clear the filters." }),
  });

  payTable = dataTable(qs("[data-pay-table]", ctx.root), {
    rows: [],
    can: ctx.can,
    searchKeys: ["receiptNo", "studentName", "invoiceNumber", "reference"],
    filters: [
      { key: "method", label: "Method", options: Object.entries(PAYMENT_METHODS) },
      { key: "status", label: "Status", options: [["success", "Successful"], ["failed", "Failed"]] },
    ],
    columns: [
      { key: "receiptNo", label: "Receipt", render: (r) => html`<span class="cell-title">${r.receiptNo}</span>` },
      { key: "studentName", label: "Student", sortable: true },
      { key: "invoiceNumber", label: "Invoice", hideBelow: "md" },
      { key: "paidAt", label: "Date", sortable: true, render: (r) => dateTime(r.paidAt) },
      { key: "method", label: "Method", hideBelow: "md", render: (r) => html`${paymentMethodLabel(r.method)}<div class="cell-sub">${r.recorder}</div>` },
      { key: "amount", label: "Amount", sortable: true, align: "right", render: (r) => html`<span class="money fw-600">${money(r.amount)}</span>` },
      { key: "status", label: "Status", render: (r) => badge(r.status, r.status === "success" ? "Successful" : "Failed") },
    ],
    rowActions: [
      { label: "Print receipt", icon: "Printer", hidden: (r) => r.status !== "success", onClick: (r) => printDoc("Receipt " + r.receiptNo, receiptDoc(r)) },
      { label: "View invoice", icon: "Eye", onClick: (r) => openInvoice(r.invoiceId) },
    ],
    empty: emptyState({ icon: "History", title: "No payments match", text: "Try a different search or clear the filters." }),
  });
}

function refresh({ charts = true } = {}) {
  const k = kpis();
  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "IndianRupee", label: "Collected this month", value: money(k.collectedMonth), tone: "green" }),
    statCard({ icon: "Wallet", label: "Outstanding", value: money(k.outstanding), tone: "amber" }),
    statCard({ icon: "TriangleAlert", label: `Overdue · ${k.overdueCount} invoices`, value: money(k.overdueAmt), tone: k.overdueAmt ? "rust" : "slate", href: "admin-fees.html?tab=invoices" }),
    statCard({ icon: "Target", label: "Collection rate", value: pct(k.rate, 1), tone: "blue" }),
  ].join("");

  const inv = invoiceRows();
  const pays = paymentRows();
  qs('[data-count="invoices"]', ctx.root).textContent = inv.length;
  qs('[data-count="payments"]', ctx.root).textContent = pays.length;
  invTable.update(inv);
  payTable.update(pays);
  qs("[data-structures]", ctx.root).innerHTML = structuresHtml();
  if (charts || !revChart) renderCharts();
}

function destroyCharts() {
  [revChart, agingChart].forEach((p) => p?.then((c) => c?.destroy()).catch(() => {}));
  revChart = null;
  agingChart = null;
}

// First call creates the charts; later calls update their data in place (smooth, no destroy/re-create flicker).
function renderCharts() {
  const rev = sel.revenueByMonth(6);
  const revSeries = [{ name: "Collected", data: rev.map((r) => r.total) }];
  const revCats = rev.map((r) => monthYear(r.month + "-01"));
  const agingSeries = [{ name: "Overdue", data: Object.values(sel.duesAging()) }];

  if (!revChart) {
    revChart = areaChart(qs("[data-chart-revenue]", ctx.root), { series: revSeries, categories: revCats, yFormatter: moneyShort, tooltipFormatter: money, height: 250 });
  } else {
    revChart.then((c) => c?.updateOptions({ series: revSeries, xaxis: { categories: revCats } }, false, false)).catch(() => {});
  }

  if (!agingChart) {
    agingChart = barChart(qs("[data-chart-aging]", ctx.root), { series: agingSeries, categories: ["0–15 days", "16–30 days", "31–60 days", "60+ days"], colors: [palette().gold], yFormatter: moneyShort, height: 250 });
  } else {
    agingChart.then((c) => c?.updateSeries(agingSeries, false)).catch(() => {});
  }
}

function structuresHtml() {
  const list = store.get("feeStructures");
  if (!list.length) return emptyState({ icon: "Layers", title: "No fee structures", text: "Fee structures define course fees and installments." });
  const canEdit = ctx.can("feeStructures.manage");
  return html`<div class="grid grid-2">${raw(
    list
      .map((fs) => {
        const course = store.byId("courses", fs.courseId);
        const total = fs.components.reduce((t, c) => t + c.amount, 0);
        return html`
          <div class="card">
            <div class="card-header">
              <div><h3 class="card-title">${course?.title || fs.name}</h3><p class="card-subtitle">${fs.name}</p></div>
              ${canEdit ? html`<button type="button" class="btn btn-outline btn-sm" data-edit-fs="${fs.id}">${raw(icon("Pencil", { size: 14 }))}Edit</button>` : raw("")}
            </div>
            <div class="card-body">
              <table class="money-table">
                ${raw(fs.components.map((c) => html`<tr><td>${c.label}</td><td>${money(c.amount)}</td></tr>`).join(""))}
                <tr class="is-total"><td>Total${fs.gstPct ? " + " + fs.gstPct + "% GST" : ""}</td><td>${money(total)}</td></tr>
              </table>
              <div class="cluster section-gap">${raw(fs.installments.map((i) => html`<span class="chip">${i.label}: ${i.pct}% · +${i.dueOffsetDays}d</span>`).join(""))}</div>
            </div>
          </div>`;
      })
      .join("")
  )}</div>`;
}

/* ---------- actions ---------- */

function wire() {
  on(ctx.root, "click", '[data-act="new"]', () => newInvoiceFlow());
  on(ctx.root, "click", '[data-act="bulk"]', () => bulkInvoiceFlow());
  on(ctx.root, "click", '[data-act="export"]', () => exportCsv());
  on(ctx.root, "click", "[data-edit-fs]", (e, btn) => editStructureFlow(btn.dataset.editFs));
}

function exportCsv() {
  const rows = invoiceRows();
  if (!rows.length) return toast("There are no invoices to export.", { type: "info" });
  downloadCsv(`om-academy-invoices-${today()}.csv`, rows, [
    { key: "number", label: "Invoice" },
    { key: "studentName", label: "Student" },
    { key: "rollNo", label: "Roll no." },
    { key: "description", label: "Description" },
    { label: "Issued", value: (r) => date(r.issuedAt) },
    { label: "Due", value: (r) => date(r.dueDate) },
    { key: "total", label: "Amount (INR)" },
    { key: "paid", label: "Paid (INR)" },
    { key: "balance", label: "Balance (INR)" },
    { label: "Status", value: (r) => invoiceStatusLabel(r.state) },
  ]);
  toast(`Exported ${rows.length} invoices.`, { type: "success" });
}

async function newInvoiceFlow() {
  const students = store.where("users", (u) => u.role === "student" && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const data = await modal.form({
    title: "New invoice",
    submitLabel: "Create invoice",
    fields: [
      { name: "studentId", label: "Student", type: "select", required: true, placeholder: "Select a student", options: students.map((s) => [s.id, `${s.name} — ${s.rollNo}`]), span: 2 },
      { name: "label", label: "Description", required: true, placeholder: "e.g. Exam re-appear fee", span: 2 },
      { name: "amount", label: "Amount (₹)", type: "number", min: 1, step: 1, required: true },
      { name: "dueDate", label: "Due date", type: "date", required: true },
      { name: "gstPct", label: "GST %", type: "number", min: 0, max: 28, step: 1 },
    ],
    values: { dueDate: addDays(today(), 7), gstPct: (store.get("settings").fees || {}).gstPct || 0 },
    validate: (d) => {
      const e = {};
      if (!d.studentId) e.studentId = "Choose a student.";
      if (!d.label.trim()) e.label = "Enter a description.";
      if (!(Number(d.amount) > 0)) e.amount = "Enter an amount above zero.";
      if (!d.dueDate) e.dueDate = "Pick a due date.";
      if (Number(d.gstPct) < 0 || Number(d.gstPct) > 28) e.gstPct = "GST must be between 0 and 28%.";
      return e;
    },
  });
  if (!data) return;
  await run(() => services.createInvoice(ctx.user, { studentId: data.studentId, items: [{ label: data.label.trim(), amount: Math.round(Number(data.amount)) }], dueDate: data.dueDate, gstPct: Number(data.gstPct) || 0 }), { success: (inv) => `Invoice ${inv.number} created and sent to the student.`, error: "Couldn't create the invoice" });
}

async function bulkInvoiceFlow() {
  const batches = store.where("batches", (b) => b.status === "active");
  const data = await modal.form({
    title: "Bulk invoice a batch",
    submitLabel: "Create invoices",
    extraBodyHtml: html`<div class="alert tone-blue section-gap">${raw(icon("Info", { size: 18 }))}<div class="alert-body">One invoice is created for every active student in the batch, and each student is notified.</div></div>`,
    fields: [
      { name: "batchId", label: "Batch", type: "select", required: true, placeholder: "Select a batch", options: batches.map((b) => [b.id, `${b.name} (${store.count("enrollments", (e) => e.batchId === b.id && e.status === "active")} students)`]), span: 2 },
      { name: "label", label: "Description", required: true, placeholder: "e.g. Practical lab fee", span: 2 },
      { name: "amount", label: "Amount per student (₹)", type: "number", min: 1, step: 1, required: true },
      { name: "dueDate", label: "Due date", type: "date", required: true },
    ],
    values: { dueDate: addDays(today(), 14) },
    validate: (d) => {
      const e = {};
      if (!d.batchId) e.batchId = "Choose a batch.";
      else if (!store.count("enrollments", (x) => x.batchId === d.batchId && x.status === "active")) e.batchId = "This batch has no active students.";
      if (!d.label.trim()) e.label = "Enter a description.";
      if (!(Number(d.amount) > 0)) e.amount = "Enter an amount above zero.";
      if (!d.dueDate) e.dueDate = "Pick a due date.";
      return e;
    },
  });
  if (!data) return;
  await run(() => services.createBulkInvoices(ctx.user, { batchId: data.batchId, items: [{ label: data.label.trim(), amount: Math.round(Number(data.amount)) }], dueDate: data.dueDate, gstPct: 0 }), { success: (list) => `${list.length} invoices created.`, error: "Couldn't create the invoices" });
}

async function recordPaymentFlow(id) {
  const inv = store.byId("invoices", id);
  if (!inv) return toast("That invoice no longer exists.", { type: "warning" });
  const balance = Math.max(0, inv.total - sel.paidAmount(id));
  const data = await modal.form({
    title: `Record payment — ${inv.number}`,
    submitLabel: "Record payment",
    extraBodyHtml: html`<div class="pay-summary"><div><div class="text-muted text-sm">Student</div><div class="fw-600 text-title">${userById(inv.studentId)?.name}</div></div><div class="text-right"><div class="text-muted text-sm">Balance due</div><div class="pay-amount">${money(balance)}</div></div></div>`,
    fields: [
      { name: "amount", label: "Amount received (₹)", type: "number", min: 1, max: balance, step: 1, required: true },
      { name: "method", label: "Method", type: "select", required: true, options: [["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["netbanking", "Net banking"], ["cheque", "Cheque"]] },
      { name: "reference", label: "Reference / cheque no.", placeholder: "Optional for cash", span: 2 },
    ],
    values: { amount: balance, method: "cash" },
    validate: (d) => {
      const e = {};
      const amt = Number(d.amount);
      if (!(amt >= 1)) e.amount = "Enter the amount received.";
      else if (amt > balance) e.amount = `Can't be more than the balance (${money(balance)}).`;
      if (d.method === "cheque" && !d.reference.trim()) e.reference = "Enter the cheque number.";
      return e;
    },
  });
  if (!data) return;
  const pay = await run(() => services.recordPayment(ctx.user, { invoiceId: id, amount: Math.round(Number(data.amount)), method: data.method, reference: data.reference.trim() }), { success: (p) => `Payment recorded — receipt ${p.receiptNo}.`, error: "Couldn't record the payment" });
  if (pay) {
    const printIt = await confirm({ title: "Print receipt?", message: `Receipt ${pay.receiptNo} for ${money(pay.amount)} is ready.`, confirmLabel: "Print receipt", cancelLabel: "Not now" });
    if (printIt) printDoc("Receipt " + pay.receiptNo, receiptDoc(pay));
  }
}

async function discountFlow(id) {
  const inv = store.byId("invoices", id);
  if (!inv) return toast("That invoice no longer exists.", { type: "warning" });
  const b = invoiceBreakdown(inv);
  const data = await modal.form({
    title: `Discount / waiver — ${inv.number}`,
    submitLabel: "Apply discount",
    size: "sm",
    columns: 1,
    fields: [
      { name: "amount", label: "Discount amount (₹)", type: "number", min: 1, max: b.subtotal, step: 1, required: true },
      { name: "reason", label: "Reason", required: true, placeholder: "e.g. SAFAL scholarship" },
    ],
    values: { amount: inv.discount?.amount || "", reason: inv.discount?.reason || "" },
    validate: (d) => {
      const e = {};
      const amt = Number(d.amount);
      if (!(amt >= 1)) e.amount = "Enter a discount amount.";
      else if (amt > b.subtotal) e.amount = `Can't exceed the invoice subtotal (${money(b.subtotal)}).`;
      if (!d.reason.trim()) e.reason = "Give a reason — it appears on the invoice.";
      return e;
    },
  });
  if (!data) return;
  await run(() => services.applyDiscount(ctx.user, id, Math.round(Number(data.amount)), data.reason.trim()), { success: "Discount applied.", error: "Couldn't apply the discount" });
}

async function cancelFlow(id) {
  const inv = store.byId("invoices", id);
  if (!inv) return;
  const ok = await confirm({ title: `Cancel ${inv.number}?`, message: "The student will no longer owe this amount. This can't be undone.", confirmLabel: "Cancel invoice", cancelLabel: "Keep invoice", danger: true });
  if (!ok) return;
  await run(() => services.cancelInvoice(ctx.user, id, "Cancelled by " + ctx.user.name), { success: `${inv.number} cancelled.`, error: "Couldn't cancel the invoice" });
}

async function remind(ids) {
  if (!ids.length) return toast("None of the selected invoices have a balance due.", { type: "info" });
  if (ids.length === 1) {
    const inv = store.byId("invoices", ids[0]);
    await run(() => services.sendReminder(ctx.user, ids[0], "email"), { success: `Reminder sent to ${userById(inv.studentId)?.name}.`, error: "Couldn't send the reminder" });
    return;
  }
  await run(() => services.sendBulkReminders(ctx.user, ids, "email"), { success: `Reminders sent to ${ids.length} students.`, error: "Couldn't send reminders" });
}

function parseComponents(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*=\s*([\d,]+)$/);
      if (!m) throw new Error(`Couldn't read "${line}". Use: Label = amount`);
      return { label: m[1].trim(), amount: Number(m[2].replace(/,/g, "")) };
    });
}

function parseInstallments(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*=\s*(\d+(?:\.\d+)?)\s*%\s*@\s*\+?(\d+)$/);
      if (!m) throw new Error(`Couldn't read "${line}". Use: Label = 50% @ 7`);
      return { label: m[1].trim(), pct: Number(m[2]), dueOffsetDays: Number(m[3]) };
    });
}

async function editStructureFlow(id) {
  const fs = store.byId("feeStructures", id);
  if (!fs) return;
  const data = await modal.form({
    title: "Edit fee structure",
    submitLabel: "Save structure",
    columns: 1,
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "components", label: "Components", type: "textarea", rows: 4, required: true, help: "One per line: Label = amount" },
      { name: "installments", label: "Installments", type: "textarea", rows: 3, required: true, help: "One per line: Label = percent% @ days after enrolment. Must add up to 100%." },
      { name: "gstPct", label: "GST %", type: "number", min: 0, max: 28, step: 1 },
    ],
    values: {
      name: fs.name,
      components: fs.components.map((c) => `${c.label} = ${c.amount}`).join("\n"),
      installments: fs.installments.map((i) => `${i.label} = ${i.pct}% @ ${i.dueOffsetDays}`).join("\n"),
      gstPct: fs.gstPct || 0,
    },
    validate: (d) => {
      const e = {};
      if (!d.name.trim()) e.name = "Enter a name.";
      try {
        if (!parseComponents(d.components).length) e.components = "Add at least one component.";
      } catch (err) {
        e.components = err.message;
      }
      try {
        const inst = parseInstallments(d.installments);
        const sum = inst.reduce((t, i) => t + i.pct, 0);
        if (!inst.length) e.installments = "Add at least one installment.";
        else if (Math.abs(sum - 100) > 0.01) e.installments = `Installments add up to ${sum}% — they must total 100%.`;
      } catch (err) {
        e.installments = err.message;
      }
      return e;
    },
  });
  if (!data) return;
  await run(() => services.saveFeeStructure(ctx.user, id, { name: data.name.trim(), components: parseComponents(data.components), installments: parseInstallments(data.installments), gstPct: Number(data.gstPct) || 0 }), { success: "Fee structure saved. New enrolments will use it.", error: "Couldn't save the fee structure" });
}

function openInvoice(id) {
  const inv = store.byId("invoices", id);
  if (!inv) return toast("That invoice couldn't be found.", { type: "warning" });
  const student = userById(inv.studentId);
  const b = invoiceBreakdown(inv);
  const state = sel.invoiceStatus(inv);
  const pays = store.where("payments", (p) => p.invoiceId === id).sort((a, x) => x.paidAt.localeCompare(a.paidAt));
  const isOpen = b.balance > 0 && state !== "cancelled";
  const d = drawer.open({
    title: "Invoice " + inv.number,
    body: html`
      <div class="cell-user section-gap">${raw(avatar({ name: student?.name, size: "md" }))}<div class="cell-user-text"><span class="cell-title">${student?.name || "—"}</span><span class="cell-sub">${student?.rollNo || ""} · ${student?.email || ""}</span></div><span class="w-100"></span>${raw(badge(state, invoiceStatusLabel(state)))}</div>
      <dl class="kv-list drawer-section">
        <dt>Issued</dt><dd>${date(inv.issuedAt)}</dd>
        <dt>Due date</dt><dd>${date(inv.dueDate)}${isOpen ? html` <span class="text-muted text-sm">· ${dueIn(inv.dueDate)}</span>` : raw("")}</dd>
        ${inv.cancelReason ? html`<dt>Cancelled</dt><dd>${inv.cancelReason}</dd>` : raw("")}
      </dl>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Charges</h4>
        <table class="money-table">
          ${raw(inv.items.map((i) => html`<tr><td>${i.label}</td><td>${money(i.amount)}</td></tr>`).join(""))}
          ${b.discount ? html`<tr><td>Discount · ${inv.discount?.reason || ""}</td><td>− ${money(b.discount)}</td></tr>` : raw("")}
          ${b.tax ? html`<tr><td>GST</td><td>${money(b.tax)}</td></tr>` : raw("")}
          <tr class="is-total"><td>Total</td><td>${money(b.total)}</td></tr>
          <tr><td>Paid</td><td>${money(b.paid)}</td></tr>
          <tr class="is-total"><td>Balance due</td><td>${money(b.balance)}</td></tr>
        </table>
      </div>
      <div class="drawer-section">
        <h4 class="drawer-section-title">Payment attempts</h4>
        ${pays.length ? html`<div class="stack-sm">${raw(pays.map((p) => html`<div class="file-tile"><span class="icon-tile icon-tile-sm tone-${raw(p.status === "success" ? "green" : "rust")}">${raw(icon(p.status === "success" ? "CircleCheck" : "CircleX", { size: 16 }))}</span><div class="file-tile-main"><div class="file-tile-name">${money(p.amount)} · ${paymentMethodLabel(p.method)}</div><div class="file-tile-meta">${p.receiptNo} · ${dateTime(p.paidAt)}</div></div></div>`).join(""))}</div>` : html`<p class="text-muted m-0">No payments yet.</p>`}
      </div>
      ${inv.reminders?.length ? html`<div class="drawer-section"><h4 class="drawer-section-title">Reminders sent</h4><ul class="timeline">${raw(inv.reminders.map((r) => html`<li class="timeline-item"><span class="timeline-dot tone-amber"></span><div><div class="timeline-title">${r.channel.toUpperCase()} reminder</div><div class="timeline-meta">${dateTime(r.at)} · ${userById(r.by)?.name || "Staff"}</div></div></li>`).join(""))}</ul></div>` : raw("")}`,
    footer: html`
      <button type="button" class="btn btn-outline" data-d="print">${raw(icon("Printer", { size: 16 }))}Print</button>
      ${isOpen && ctx.can("fees.remind") ? html`<button type="button" class="btn btn-outline" data-d="remind">${raw(icon("BellRing", { size: 16 }))}Remind</button>` : raw("")}
      ${isOpen && ctx.can("payments.record") ? html`<button type="button" class="btn btn-primary" data-d="record">${raw(icon("IndianRupee", { size: 16 }))}Record payment</button>` : raw("")}`,
  });
  d.root.querySelector('[data-d="print"]').addEventListener("click", () => printDoc("Invoice " + inv.number, invoiceDoc(inv)));
  d.root.querySelector('[data-d="remind"]')?.addEventListener("click", async () => {
    await remind([id]);
    d.close();
  });
  d.root.querySelector('[data-d="record"]')?.addEventListener("click", () => {
    d.close();
    recordPaymentFlow(id);
  });
}

/*
Author       : OM Academy
Description  : Printable documents shared by every page: invoice, receipt, admit card, marksheet, transcript.
               Each returns an HTML string for ui.printDoc(title, html). Styles: portal/base/_print.scss.
               Also the shared labels for payment methods and computed invoice states.
*/

import * as store from "./store.js";
import * as sel from "./selectors.js";
import { html, raw } from "./ui.js";
import { money, date, dateTime, time, titleCase, pct } from "./format.js";

export const PAYMENT_METHODS = { upi: "UPI", card: "Card", netbanking: "Net banking", cash: "Cash", cheque: "Cheque" };
export const paymentMethodLabel = (m) => PAYMENT_METHODS[m] || titleCase(m || "—");

export const INVOICE_STATUS_LABELS = { issued: "Due", partial: "Partly paid", overdue: "Overdue", paid: "Paid", cancelled: "Cancelled", draft: "Draft" };
export const invoiceStatusLabel = (s) => INVOICE_STATUS_LABELS[s] || titleCase(s);

const institution = () => store.get("settings").institution || { name: "OM Academy" };

function docHead(title, metaHtml = "") {
  const inst = institution();
  const contact = [inst.phone, inst.email].filter(Boolean).join(" · ");
  return html`
    <div class="print-head">
      <div class="print-brand">
        <span class="print-mark">OM</span>
        <div>
          <div class="print-org">${inst.name}</div>
          ${inst.address ? html`<div class="print-org-sub">${inst.address}</div>` : raw("")}
          ${contact ? html`<div class="print-org-sub">${contact}${inst.gstin ? " · GSTIN " + inst.gstin : ""}</div>` : raw("")}
        </div>
      </div>
      <div class="print-doc">
        <div class="print-doc-title">${title}</div>
        ${raw(metaHtml)}
      </div>
    </div>`;
}

const docFoot = () => html`<div class="print-foot">Computer-generated document from the OM Academy portal. This is a demo — no real payment was processed.</div>`;

function studentBlock(student, label = "Student") {
  const center = store.byId("centers", student?.centerId);
  return html`
    <div>
      <div class="print-label">${label}</div>
      <div><strong>${student?.name || "—"}</strong></div>
      ${student?.rollNo ? html`<div>Roll no. ${student.rollNo}</div>` : raw("")}
      ${student?.email ? html`<div>${student.email}</div>` : raw("")}
      ${student?.phone ? html`<div>${student.phone}</div>` : raw("")}
      ${center ? html`<div>${center.name}</div>` : raw("")}
    </div>`;
}

// Money breakdown of an invoice (used by the invoice drawers and the printed invoice)
export function invoiceBreakdown(inv) {
  const subtotal = (inv.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const discount = inv.discount?.amount || 0;
  const lateFee = inv.lateFee || 0;
  const taxable = subtotal - discount + lateFee;
  const tax = Math.max(0, inv.total - taxable);
  const paid = sel.paidAmount(inv.id);
  return { subtotal, discount, lateFee, tax, total: inv.total, paid, balance: Math.max(0, inv.total - paid) };
}

export function invoiceDoc(inv) {
  const student = store.byId("users", inv.studentId);
  const b = invoiceBreakdown(inv);
  const state = sel.invoiceStatus(inv);
  const meta = html`
    <div class="print-meta">No. <strong>${inv.number}</strong></div>
    <div class="print-meta">Issued ${date(inv.issuedAt)}</div>
    <div class="print-meta">Due ${date(inv.dueDate)}</div>
    <div class="print-meta"><span class="print-stamp ${raw(state === "paid" ? "" : "is-due")}">${invoiceStatusLabel(state)}</span></div>`;
  return html`
    <div class="print-sheet">
      ${raw(docHead("Invoice", meta))}
      <div class="print-grid">
        ${raw(studentBlock(student, "Bill to"))}
        <div>
          <div class="print-label">Payment</div>
          <div>Pay online from the Student Portal (Fees & Payments) or at any OM Academy center.</div>
        </div>
      </div>
      <table class="print-table">
        <thead><tr><th>#</th><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${raw((inv.items || []).map((item, i) => html`<tr><td>${i + 1}</td><td>${item.label}</td><td class="num">${money(item.amount)}</td></tr>`).join(""))}
        </tbody>
      </table>
      <table class="print-totals">
        <tr><td>Subtotal</td><td>${money(b.subtotal)}</td></tr>
        ${b.discount ? html`<tr><td>Discount${inv.discount?.reason ? " (" + inv.discount.reason + ")" : ""}</td><td>− ${money(b.discount)}</td></tr>` : raw("")}
        ${b.lateFee ? html`<tr><td>Late fee</td><td>${money(b.lateFee)}</td></tr>` : raw("")}
        ${b.tax ? html`<tr><td>GST (${inv.gstPct || 0}%)</td><td>${money(b.tax)}</td></tr>` : raw("")}
        <tr class="is-grand"><td>Total</td><td>${money(b.total)}</td></tr>
        <tr><td>Paid</td><td>${money(b.paid)}</td></tr>
        <tr><td><strong>Balance due</strong></td><td><strong>${money(b.balance)}</strong></td></tr>
      </table>
      ${raw(docFoot())}
    </div>`;
}

export function receiptDoc(payment) {
  const inv = store.byId("invoices", payment.invoiceId);
  const student = store.byId("users", payment.studentId);
  const recorder = payment.recordedBy ? store.byId("users", payment.recordedBy) : null;
  const meta = html`
    <div class="print-meta">No. <strong>${payment.receiptNo}</strong></div>
    <div class="print-meta">${dateTime(payment.paidAt)}</div>
    <div class="print-meta"><span class="print-stamp">${payment.status === "success" ? "Paid" : titleCase(payment.status)}</span></div>`;
  return html`
    <div class="print-sheet">
      ${raw(docHead("Payment receipt", meta))}
      <div class="print-grid">
        ${raw(studentBlock(student, "Received from"))}
        <div>
          <div class="print-label">Payment details</div>
          <div>Method: <strong>${paymentMethodLabel(payment.method)}</strong></div>
          ${payment.reference ? html`<div>Reference: ${payment.reference}</div>` : raw("")}
          <div>Collected by: ${recorder ? recorder.name : "Online (Student Portal)"}</div>
        </div>
      </div>
      <table class="print-table">
        <thead><tr><th>Against invoice</th><th>Description</th><th class="num">Amount received</th></tr></thead>
        <tbody>
          <tr>
            <td>${inv?.number || "—"}</td>
            <td>${(inv?.items || []).map((i) => i.label).join(", ")}</td>
            <td class="num"><strong>${money(payment.amount)}</strong></td>
          </tr>
        </tbody>
      </table>
      ${inv ? html`<p>Balance remaining on ${inv.number}: <strong>${money(invoiceBreakdown(inv).balance)}</strong></p>` : raw("")}
      <div class="print-sign"><div>Student signature</div><div>Authorised signatory</div></div>
      ${raw(docFoot())}
    </div>`;
}

export function admitCardDoc(exam, student) {
  const batch = store.byId("batches", exam.batchId);
  const course = store.byId("courses", exam.courseId || batch?.courseId);
  const center = store.byId("centers", batch?.centerId || student?.centerId);
  return html`
    <div class="print-sheet">
      ${raw(docHead("Admit card", html`<div class="print-meta">${exam.cycle || ""}</div>`))}
      <div class="print-grid">
        ${raw(studentBlock(student))}
        <div class="print-photo-box">Affix recent passport photo</div>
      </div>
      <table class="print-table">
        <tbody>
          <tr><th>Examination</th><td>${exam.title}</td></tr>
          <tr><th>Course</th><td>${course?.title || "—"}</td></tr>
          <tr><th>Batch</th><td>${batch?.name || "—"}</td></tr>
          <tr><th>Date & time</th><td>${date(exam.date)}, ${time(exam.start)} – ${time(exam.end)}</td></tr>
          <tr><th>Venue</th><td>${[exam.room, center?.name].filter(Boolean).join(", ") || "—"}</td></tr>
        </tbody>
      </table>
      <p><strong>Instructions:</strong> Report 30 minutes before the exam. Bring this admit card and a photo ID. Electronic devices are not allowed in the exam hall.</p>
      <div class="print-sign"><div>Student signature</div><div>Controller of examinations</div></div>
      ${raw(docFoot())}
    </div>`;
}

// rows: [{ title, course, marks, maxMarks, absent }]
export function marksheetDoc(student, rows, { title = "Statement of marks" } = {}) {
  const body = rows
    .map((r) => {
      const p = r.absent || r.marks == null ? null : (r.marks / r.maxMarks) * 100;
      const g = p == null ? null : sel.gradeFor(p);
      return html`<tr><td>${r.title}</td><td>${r.course || "—"}</td><td class="num">${r.absent ? "AB" : r.marks ?? "—"}</td><td class="num">${r.maxMarks}</td><td class="num">${p == null ? "—" : pct(p, 1)}</td><td>${g ? g.grade : "—"}</td></tr>`;
    })
    .join("");
  const gpa = sel.gpaFor(student.id);
  return html`
    <div class="print-sheet">
      ${raw(docHead(title, html`<div class="print-meta">${date(new Date().toISOString())}</div>`))}
      <div class="print-grid">${raw(studentBlock(student))}<div><div class="print-label">Grade point average</div><div class="print-doc-title">${gpa == null ? "—" : gpa.toFixed(2)}</div></div></div>
      <table class="print-table">
        <thead><tr><th>Examination</th><th>Course</th><th class="num">Marks</th><th class="num">Max</th><th class="num">%</th><th>Grade</th></tr></thead>
        <tbody>${raw(body || html`<tr><td colspan="6">No published results yet.</td></tr>`)}</tbody>
      </table>
      <div class="print-sign"><div>Class teacher</div><div>Controller of examinations</div></div>
      ${raw(docFoot())}
    </div>`;
}

export function transcriptDoc(transcript) {
  const snap = transcript.snapshot || {};
  const student = store.byId("users", transcript.studentId) || { name: snap.studentName, rollNo: snap.rollNo };
  const rows = (snap.results || [])
    .map((r) => {
      const p = r.marks == null ? null : (r.marks / r.maxMarks) * 100;
      return html`<tr><td>${r.exam}</td><td>${r.course || "—"}</td><td class="num">${r.marks ?? "AB"}</td><td class="num">${r.maxMarks}</td><td>${p == null ? "—" : sel.gradeFor(p).grade}</td></tr>`;
    })
    .join("");
  const meta = html`<div class="print-meta">Serial <strong>${transcript.serialNo}</strong></div><div class="print-meta">Issued ${date(transcript.issuedAt)}</div>`;
  return html`
    <div class="print-sheet">
      ${raw(docHead("Academic transcript", meta))}
      <div class="print-grid">${raw(studentBlock(student))}<div><div class="print-label">Cumulative GPA</div><div class="print-doc-title">${snap.gpa == null ? "—" : Number(snap.gpa).toFixed(2)}</div></div></div>
      <table class="print-table">
        <thead><tr><th>Examination</th><th>Course</th><th class="num">Marks</th><th class="num">Max</th><th>Grade</th></tr></thead>
        <tbody>${raw(rows || html`<tr><td colspan="5">No published results.</td></tr>`)}</tbody>
      </table>
      <p class="print-meta">This transcript reflects results published on or before the issue date. Verify with serial ${transcript.serialNo}.</p>
      <div class="print-sign"><div>Registrar</div><div>Center director</div></div>
      ${raw(docFoot())}
    </div>`;
}

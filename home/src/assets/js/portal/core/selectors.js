/*
Author       : OM Academy
Description  : Derived/read data — attendance %, fee status, GPA, pending-task lists, the unified notification
               feed, teacher batch scope, and dashboard summaries. Pages call these instead of touching raw
               collections, so every screen agrees on what "overdue" or "attendance %" means.
*/

import * as store from "./store.js";
import { today, dateOf, diffDays, monthKey, financialYear } from "./clock.js";
import { roleHas } from "./perms.js";

/* ---------- basic lookups ---------- */

export const me = (user) => user;
export const roleOf = (user) => (user ? store.byId("roles", user.role) : null);
export const centerOf = (user) => (user ? store.byId("centers", user.centerId) : null);

export function studentEnrollments(studentId, { activeOnly = false } = {}) {
  const list = store.where("enrollments", (e) => e.studentId === studentId);
  return activeOnly ? list.filter((e) => e.status === "active") : list;
}

export const batchesOf = (studentId) => studentEnrollments(studentId).map((e) => store.byId("batches", e.batchId)).filter(Boolean);
export const activeBatchesOf = (studentId) => studentEnrollments(studentId, { activeOnly: true }).map((e) => store.byId("batches", e.batchId)).filter(Boolean);

// Batches a teacher is assigned to (their scope — see perms.js roles.teacher.scope = "assigned")
export const teacherBatches = (teacherId) => store.where("batches", (b) => (b.instructorIds || []).includes(teacherId));

export function batchesVisibleTo(user) {
  if (!user) return [];
  if (roleHas(roleOf(user), "*") || roleHas(roleOf(user), "courses.view")) {
    const role = roleOf(user);
    if (role?.scope === "assigned") return teacherBatches(user.id);
    return store.get("batches");
  }
  return [];
}

export const courseOf = (batch) => store.byId("courses", batch?.courseId);
export const centerOfBatch = (batch) => store.byId("centers", batch?.centerId);

/* ---------- attendance ---------- */

// Every attendance session for a batch (optionally within a date range)
export function sessionsForBatch(batchId, { from, to } = {}) {
  let list = store.where("attendanceSessions", (s) => s.batchId === batchId);
  if (from) list = list.filter((s) => s.date >= from);
  if (to) list = list.filter((s) => s.date <= to);
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

// { present, absent, late, excused, total, pct } for one student in one batch (or across all their batches)
export function attendanceStats(studentId, batchId) {
  const batchIds = batchId ? [batchId] : activeBatchesOf(studentId).map((b) => b.id);
  let present = 0, absent = 0, late = 0, excused = 0, total = 0;
  // Settings → Rules: approved leave ("E") is excluded from the percentage, or counted as present / absent
  const leaveCounts = (store.get("settings").attendance || {}).leaveCounts || "excluded";
  for (const bId of batchIds) {
    for (const session of sessionsForBatch(bId)) {
      const mark = session.records[studentId];
      if (!mark) continue;
      total++;
      if (mark === "P") present++;
      else if (mark === "A") absent++;
      else if (mark === "L") { late++; present++; }
      else if (mark === "E") {
        excused++;
        if (leaveCounts === "present") present++;
      }
    }
  }
  const countable = leaveCounts === "excluded" ? total - excused : total;
  const pct = countable > 0 ? Math.round((present / countable) * 1000) / 10 : 100;
  return { present, absent, late, excused, total, pct };
}

const attendanceThreshold = () => (store.get("settings").attendance || {}).minPct ?? 75;

// How many more consecutive present-classes are needed to reach the threshold, given a typical week of classes
export function classesNeededFor75(studentId, batchId) {
  const s = attendanceStats(studentId, batchId);
  const min = attendanceThreshold();
  const countable = s.present + s.absent + s.late === 0 ? 0 : s.total - s.excused;
  if (countable === 0 || s.pct >= min) return 0;
  // present_now + n = min% * (countable + n)  =>  n = (min*countable - 100*present_now) / (100 - min)
  const n = Math.ceil((min * countable - 100 * s.present) / (100 - min));
  return Math.max(0, n);
}

// Calendar-month attendance map for the heatmap: { "2026-08-04": "P"|"A"|"L"|"E"|"H"(holiday)|"S"(Sunday) }
export function attendanceHeatmap(studentId, monthIso) {
  const start = monthKey(monthIso) + "-01";
  const end = monthKey(monthIso) + "-31";
  const map = {};
  const batchIds = activeBatchesOf(studentId).map((b) => b.id);
  for (const bId of batchIds) {
    for (const session of sessionsForBatch(bId, { from: start, to: end })) {
      const mark = session.records[studentId];
      if (mark) map[session.date] = mark;
    }
  }
  return map;
}

/* ---------- leave ---------- */

export const leaveRequestsFor = (studentId) => store.where("leaveRequests", (l) => l.studentId === studentId).sort((a, b) => b.from.localeCompare(a.from));
export const pendingLeave = (batchIds) => store.where("leaveRequests", (l) => l.status === "pending" && (!batchIds || studentInBatches(l.studentId, batchIds)));

function studentInBatches(studentId, batchIds) {
  return activeBatchesOf(studentId).some((b) => batchIds.includes(b.id));
}

/* ---------- assignments ---------- */

export function assignmentsForStudent(studentId) {
  const batchIds = activeBatchesOf(studentId).map((b) => b.id);
  return store.where("assignments", (a) => a.status === "published" && batchIds.includes(a.batchId));
}

export function submissionFor(assignmentId, studentId) {
  return store.get("submissions").find((s) => s.assignmentId === assignmentId && s.studentId === studentId);
}

export function assignmentStatusFor(assignment, studentId) {
  const sub = submissionFor(assignment.id, studentId);
  if (sub && sub.status === "graded") return "graded";
  if (sub) return "submitted";
  if (isPastDue(assignment.dueAt)) return assignment.allowLate ? "overdue-allowed" : "overdue";
  return "pending";
}

export function pendingAssignmentsCount(studentId) {
  return assignmentsForStudent(studentId).filter((a) => ["pending", "overdue-allowed"].includes(assignmentStatusFor(a, studentId))).length;
}

export function ungradedSubmissionsCount(batchIds) {
  return store.count("submissions", (s) => s.status === "submitted" && batchIds.includes(store.byId("assignments", s.assignmentId)?.batchId));
}

/* ---------- exams & results ---------- */

export function examsForStudent(studentId, { publishedOnly = false } = {}) {
  const batchIds = activeBatchesOf(studentId).map((b) => b.id);
  return store.where("exams", (e) => batchIds.includes(e.batchId) && (!publishedOnly || e.status === "published")).sort((a, b) => a.date.localeCompare(b.date));
}

export function marksFor(examId, studentId) {
  return store.get("marks").find((m) => m.examId === examId && m.studentId === studentId);
}

export function gradeFor(pct) {
  const scale = (store.get("settings").grading || {}).scale || [];
  return scale.find((g) => pct >= g.min) || { grade: "—", point: 0, label: "" };
}

export function examEligible(studentId, exam) {
  const rules = store.get("settings").exams || {};
  const stats = attendanceStats(studentId, exam.batchId);
  if (rules.minAttendancePct && stats.pct < rules.minAttendancePct) return { ok: false, reason: `Attendance is ${stats.pct}%, below the required ${rules.minAttendancePct}%.` };
  if (rules.requireFeesCleared) {
    const bal = feeSummary(studentId).balance;
    if (bal > 0) return { ok: false, reason: "Outstanding fees must be cleared before the exam." };
  }
  return { ok: true };
}

/* ---------- fees ---------- */

export function invoicesForStudent(studentId) {
  return store.where("invoices", (i) => i.studentId === studentId).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export const paymentsForInvoice = (invoiceId) => store.where("payments", (p) => p.invoiceId === invoiceId && p.status === "success");
export const paidAmount = (invoiceId) => paymentsForInvoice(invoiceId).reduce((sum, p) => sum + p.amount, 0);

// Computed status: cancelled | paid | partial | overdue | issued (not yet due) — never stored, always derived.
// diffDays(a, b) is a − b, so diffDays(today, dueDate) > 0 means the due date has passed.
export const isPastDue = (dueDate) => diffDays(today(), dateOf(dueDate)) > 0;

export function invoiceStatus(invoice) {
  if (invoice.status === "cancelled" || invoice.status === "draft") return invoice.status;
  const paid = paidAmount(invoice.id);
  if (paid >= invoice.total) return "paid";
  if (isPastDue(invoice.dueDate)) return "overdue";
  return paid > 0 ? "partial" : "issued";
}

export function feeSummary(studentId) {
  const invoices = invoicesForStudent(studentId).filter((i) => i.status !== "cancelled" && i.status !== "draft");
  let total = 0, paid = 0, overdue = 0;
  for (const inv of invoices) {
    total += inv.total;
    const p = paidAmount(inv.id);
    paid += p;
    if (invoiceStatus(inv) === "overdue") overdue += inv.total - p;
  }
  return { total, paid, balance: Math.max(0, total - paid), overdue };
}

export function overdueInvoices() {
  return store.where("invoices", (i) => i.status === "issued").filter((i) => invoiceStatus(i) === "overdue");
}

export function duesAging(asOf = today()) {
  const buckets = { "0-15": 0, "16-30": 0, "31-60": 0, "60+": 0 };
  for (const inv of overdueInvoices()) {
    const days = diffDays(asOf, inv.dueDate);
    const bal = inv.total - paidAmount(inv.id);
    if (days <= 15) buckets["0-15"] += bal;
    else if (days <= 30) buckets["16-30"] += bal;
    else if (days <= 60) buckets["31-60"] += bal;
    else buckets["60+"] += bal;
  }
  return buckets;
}

export function revenueByMonth(months = 6) {
  const out = [];
  const now = today();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const total = store.where("payments", (p) => p.status === "success" && p.paidAt.slice(0, 7) === key).reduce((s, p) => s + p.amount, 0);
    out.push({ month: key, total });
  }
  return out;
}

export const currentFinancialYear = () => financialYear(today());

/* ---------- progress ---------- */

export function gpaFor(studentId) {
  const results = examsForStudent(studentId, { publishedOnly: true }).map((e) => marksFor(e.id, studentId)).filter((m) => m && !m.absent);
  if (!results.length) return null;
  let points = 0, count = 0;
  for (const m of results) {
    const exam = store.byId("exams", m.examId);
    const pct = (m.marks / exam.maxMarks) * 100;
    points += gradeFor(pct).point;
    count++;
  }
  return Math.round((points / count) * 100) / 100;
}

export function batchPercentile(studentId, batchId) {
  const enrolled = store.where("enrollments", (e) => e.batchId === batchId && e.status === "active").map((e) => e.studentId);
  const scores = enrolled.map((sid) => gpaFor(sid)).filter((g) => g != null);
  if (!scores.length) return null;
  const mine = gpaFor(studentId);
  if (mine == null) return null;
  const below = scores.filter((s) => s <= mine).length;
  return Math.round((below / scores.length) * 100);
}

export function courseProgress(batch) {
  const total = (batch.moduleIds || []).length || 1;
  const done = (batch.completedModuleIds || []).length;
  return Math.round((done / total) * 100);
}

/* ---------- notifications / messages / forum ---------- */

function announcementMatches(a, user) {
  const aud = a.audience || { type: "all" };
  if (aud.type === "all") return true;
  if (aud.type === "role") return (aud.ids || []).includes(user.role);
  if (aud.type === "center") return (aud.ids || []).includes(user.centerId);
  if (aud.type === "course") return activeBatchesOf(user.id).some((b) => (aud.ids || []).includes(b.courseId));
  if (aud.type === "batch") return activeBatchesOf(user.id).some((b) => (aud.ids || []).includes(b.id));
  return false;
}

// Unified feed = direct notifications + matching announcements, newest first
export function unifiedFeed(user) {
  const direct = store.where("notifications", (n) => n.userId === user.id).map((n) => ({ ...n, kind: "notification" }));
  const now = today();
  const anns = store
    .where("announcements", (a) => a.publishAt <= now && (!a.expiresAt || a.expiresAt >= now) && announcementMatches(a, user))
    .map((a) => ({ id: "ann-feed-" + a.id, kind: "announcement", title: a.title, body: a.body, link: null, createdAt: a.publishAt, readAt: (a.readBy || []).includes(user.id) ? a.publishAt : null, priority: a.priority, ref: a }));
  return [...direct, ...anns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const unreadCount = (user) => unifiedFeed(user).filter((n) => !n.readAt).length;

export function threadsFor(user) {
  return store
    .where("threads", (t) => t.participants.some((p) => (p.type === "user" && p.id === user.id) || (p.type === "role" && p.id === user.role)))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function unreadThreadCount(user) {
  return threadsFor(user).filter((t) => {
    const readAt = t.readAt?.[user.id];
    return !readAt || readAt < t.lastMessageAt;
  }).length;
}

export function forumThreadsFor(scopeType, scopeId) {
  return store.where("forumThreads", (t) => t.scope.type === scopeType && (!scopeId || t.scope.id === scopeId) && !t.hidden).sort((a, b) => (b.pinned - a.pinned) || b.lastPostAt.localeCompare(a.lastPostAt));
}

export const forumPostsFor = (threadId) => store.where("forumPosts", (p) => p.threadId === threadId && !p.hidden).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const forumModerationQueue = () => store.where("forumPosts", (p) => (p.reports || []).length > 0 && !p.hidden);

/* ---------- resources ---------- */

export function resourcesForStudent(studentId) {
  const batchIds = activeBatchesOf(studentId).map((b) => b.id);
  const courseIds = activeBatchesOf(studentId).map((b) => b.courseId);
  return store.where("resources", (r) => courseIds.includes(r.courseId) && (!r.batchId || batchIds.includes(r.batchId)));
}

/* ---------- events / calendar ---------- */

export function eventsVisibleTo(user) {
  const list = store.get("events");
  if (!user) return list;
  if (user.role !== "student") return list;
  return list.filter((e) => !e.audience || e.audience.type === "all" || announcementMatches({ audience: e.audience }, user));
}

export function calendarEventsFor(user, { from, to } = {}) {
  const out = [...eventsVisibleTo(user)];
  if (user?.role === "student") {
    for (const a of assignmentsForStudent(user.id)) {
      out.push({ id: "dl-" + a.id, title: "Due: " + a.title, type: "deadline", start: a.dueAt, allDay: false });
    }
    for (const e of examsForStudent(user.id)) {
      out.push({ id: "ex-" + e.id, title: e.title, type: "exam", start: `${e.date}T${e.start}`, end: `${e.date}T${e.end}` });
    }
  }
  return from ? out.filter((e) => dateOf(e.start) >= from && dateOf(e.start) <= to) : out;
}

/* ---------- dashboards / pending tasks ---------- */

export function studentDashboard(user) {
  const batches = activeBatchesOf(user.id);
  const attendance = attendanceStats(user.id);
  const fees = feeSummary(user.id);
  const nextExam = examsForStudent(user.id).find((e) => e.date >= today());
  return {
    batches,
    attendance,
    fees,
    nextExam,
    pendingAssignments: pendingAssignmentsCount(user.id),
    unread: unreadCount(user),
    todaySessions: todaySchedule(user.id),
  };
}

export function todaySchedule(studentId) {
  const dow = new Date().getDay();
  const batchIds = activeBatchesOf(studentId).map((b) => b.id);
  return store
    .where("timetableSlots", (s) => s.weekday === dow && batchIds.includes(s.batchId))
    .map((s) => ({ ...s, batch: store.byId("batches", s.batchId), course: courseOf(store.byId("batches", s.batchId)) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function adminPendingTasks(user) {
  const scopeBatchIds = batchesVisibleTo(user).map((b) => b.id);
  const tasks = [];
  if (roleHas(roleOf(user), "leave.review")) {
    const n = pendingLeave(roleOf(user)?.scope === "assigned" ? scopeBatchIds : null).length;
    if (n) tasks.push({ label: "Leave requests to review", count: n, href: "admin-academics.html?tab=leave" });
  }
  if (roleHas(roleOf(user), "assignments.grade")) {
    const n = ungradedSubmissionsCount(scopeBatchIds);
    if (n) tasks.push({ label: "Submissions to grade", count: n, href: "admin-academics.html?tab=assignments" });
  }
  if (roleHas(roleOf(user), "forum.moderate")) {
    const n = forumModerationQueue().length;
    if (n) tasks.push({ label: "Forum posts reported", count: n, href: "admin-communication.html?tab=moderation" });
  }
  if (roleHas(roleOf(user), "fees.view")) {
    const n = overdueInvoices().length;
    if (n) tasks.push({ label: "Invoices overdue", count: n, href: "admin-fees.html?tab=invoices" });
  }
  if (roleHas(roleOf(user), "messages.reply")) {
    const n = unreadThreadCount(user);
    if (n) tasks.push({ label: "Unread messages", count: n, href: "admin-communication.html?tab=inbox" });
  }
  return tasks;
}

export const navBadges = (user) => ({
  pendingAssignments: user?.role === "student" ? pendingAssignmentsCount(user.id) || null : null,
  feesDue: user?.role === "student" ? (feeSummary(user.id).balance > 0 ? "!" : null) : null,
  unread: user ? unreadCount(user) || null : null,
  academicsPending: user ? (pendingLeave(roleOf(user)?.scope === "assigned" ? batchesVisibleTo(user).map((b) => b.id) : null).length + ungradedSubmissionsCount(batchesVisibleTo(user).map((b) => b.id))) || null : null,
  overdueInvoices: user ? overdueInvoices().length || null : null,
  inboxUnread: user ? (unreadThreadCount(user) + forumModerationQueue().length) || null : null,
});

export function activityFeed(limit = 20) {
  return store.get("activity").slice(-limit).reverse();
}

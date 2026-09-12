/*
Author       : OM Academy
Description  : The only place that writes to the store. Every mutation: (1) asserts the actor's permission
               (imitating a server-side check — this is still a client-only demo), (2) makes its change,
               (3) triggers side effects (notifications, invoices, activity log), (4) returns a Promise so a real
               backend can replace this file without touching page code.
*/

import * as store from "./store.js";
import { roleHas } from "./perms.js";
import { nowISO, today, addDays, dateOf, financialYear, weekday } from "./clock.js";
import * as sel from "./selectors.js";
import * as files from "./files.js";

class PermissionError extends Error {}

function assert(user, perm) {
  const role = user && store.byId("roles", user.role);
  if (!perm || roleHas(role, perm)) return;
  throw new PermissionError(`Missing permission: ${perm}`);
}

function assertOwnOrPerm(user, ownerId, perm) {
  if (user && user.id === ownerId) return;
  assert(user, perm);
}

function log(user, action, entity, entityId, summary) {
  store.insert("activity", { at: nowISO(), actorId: user?.id || "system", actorRole: user?.role || "system", action, entity, entityId, summary });
}

function notify(userId, { type, title, body, link }) {
  return store.insert("notifications", { userId, type, title, body: body || "", link: link || null, createdAt: nowISO(), readAt: null });
}

const wrap = (fn) => (...args) => Promise.resolve().then(() => fn(...args));

/* =========================================================================================
   AUTH & PROFILE
   ========================================================================================= */

export const updateProfile = wrap((user, patch) => {
  const allowed = ["phone", "address", "guardianPhone"];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const next = store.update("users", user.id, clean);
  log(user, "profile.update", "users", user.id, "Updated profile");
  return next;
});

export const updatePreferences = wrap((user, prefs) => store.update("users", user.id, (u) => ({ ...u, prefs: { ...u.prefs, ...prefs } })));

export const changePassword = wrap((user, currentPassword, newPassword) => {
  const fresh = store.byId("users", user.id);
  if (fresh.password !== currentPassword) throw new Error("Current password is incorrect.");
  if (!newPassword || newPassword.length < 6) throw new Error("New password must be at least 6 characters.");
  store.update("users", user.id, { password: newPassword });
  log(user, "profile.password", "users", user.id, "Changed password");
  return true;
});

export const uploadProfilePhoto = wrap(async (user, file) => {
  const rec = await files.savePhoto(file, user.id);
  store.update("users", user.id, { avatarFileId: rec.id });
  return rec;
});

export const setTheme = wrap((user, theme) => store.update("users", user.id, { prefs: { ...(user.prefs || {}), theme } }));

export const setDemoDate = wrap((user, isoOrNull) => {
  assert(user, "settings.manage");
  import("./clock.js").then((c) => c.setOverride(isoOrNull));
});

/* =========================================================================================
   USERS, STAFF & ROLES
   ========================================================================================= */

export const createStudent = wrap((user, data) => {
  assert(user, "students.manage");
  const rollNo = data.rollNo || "OMA" + financialYear() + "-" + String(store.nextNumber("rollNo")).padStart(4, "0");
  const rec = store.insert("users", {
    role: "student", name: data.name, email: data.email, password: data.password || "student123", phone: data.phone || "",
    centerId: data.centerId, status: "active", lastLoginAt: null, prefs: { theme: "light", notify: {} },
    rollNo, admissionDate: data.admissionDate || today(), dob: data.dob || null, gender: data.gender || null,
    guardianName: data.guardianName || "", guardianPhone: data.guardianPhone || "", address: data.address || "", qualification: data.qualification || "",
  });
  log(user, "student.create", "users", rec.id, `Added student ${rec.name}`);
  return rec;
});

export const updateStudent = wrap((user, id, patch) => {
  assert(user, "students.manage");
  const rec = store.update("users", id, patch);
  log(user, "student.update", "users", id, `Updated ${rec.name}`);
  return rec;
});

export const createStaff = wrap((user, data) => {
  assert(user, "staff.manage");
  const rec = store.insert("users", {
    role: data.role, name: data.name, email: data.email, password: data.password || "staff123", phone: data.phone || "",
    centerId: data.centerId, status: "active", lastLoginAt: null, prefs: { theme: "light", notify: {} },
    designation: data.designation || "", department: data.department || "", joinDate: data.joinDate || today(), specializations: data.specializations || [],
  });
  log(user, "staff.create", "users", rec.id, `Added staff ${rec.name}`);
  return rec;
});

export const updateStaff = wrap((user, id, patch) => {
  assert(user, "staff.manage");
  return store.update("users", id, patch);
});

export const setUserStatus = wrap((user, id, status) => {
  const target = store.byId("users", id);
  assert(user, target.role === "student" ? "students.manage" : "staff.manage");
  if (status === "inactive" && target.role === "admin") {
    const activeAdmins = store.count("users", (u) => u.role === "admin" && u.status === "active" && u.id !== id);
    if (activeAdmins === 0) throw new Error("At least one administrator must stay active.");
  }
  store.update("users", id, { status });
  log(user, "user.status", "users", id, `${status === "active" ? "Activated" : "Deactivated"} ${target.name}`);
  return true;
});

export const resetUserPassword = wrap((user, id, newPassword = "changeme123") => {
  const target = store.byId("users", id);
  assert(user, target.role === "student" ? "students.manage" : "staff.manage");
  store.update("users", id, { password: newPassword });
  log(user, "user.reset-password", "users", id, `Reset password for ${target.name}`);
  return newPassword;
});

export const importStudentsCsv = wrap((user, rows) => {
  assert(user, "students.manage");
  const created = rows.map((row) =>
    store.insert("users", {
      role: "student", name: row.name, email: row.email, password: "student123", phone: row.phone || "",
      centerId: row.centerId || store.get("centers")[0]?.id, status: "active", prefs: { theme: "light", notify: {} },
      rollNo: "OMA" + financialYear() + "-" + String(store.nextNumber("rollNo")).padStart(4, "0"),
      admissionDate: today(), guardianName: row.guardianName || "", guardianPhone: row.guardianPhone || "", address: row.address || "",
    })
  );
  log(user, "student.import", "users", null, `Imported ${created.length} students`);
  return created;
});

export const saveRole = wrap((user, roleId, patch) => {
  assert(user, "roles.manage");
  const existing = store.byId("roles", roleId);
  if (existing?.locked) throw new Error("This role's permissions can't be changed.");
  if (existing) return store.update("roles", roleId, patch);
  return store.insert("roles", { id: roleId, system: false, locked: false, portal: "staff", scope: "all", ...patch });
});

/* =========================================================================================
   CENTERS, COURSES, BATCHES, TIMETABLE, ENROLMENT, RESOURCES
   ========================================================================================= */

export const saveCenter = wrap((user, id, patch) => {
  assert(user, "centers.manage");
  return id ? store.update("centers", id, patch) : store.insert("centers", patch);
});

export const removeCenter = wrap((user, id) => {
  assert(user, "centers.manage");
  if (store.count("batches", (b) => b.centerId === id)) throw new Error("This center still has batches assigned to it.");
  store.remove("centers", id);
});

export const saveCourse = wrap((user, id, patch) => {
  assert(user, "courses.manage");
  const rec = id ? store.update("courses", id, patch) : store.insert("courses", { status: "active", syllabus: [], ...patch });
  log(user, id ? "course.update" : "course.create", "courses", rec.id, rec.title);
  return rec;
});

export const setSyllabusModules = wrap((user, courseId, syllabus) => {
  assert(user, "courses.manage");
  return store.update("courses", courseId, { syllabus });
});

export const saveBatch = wrap((user, id, patch) => {
  assert(user, "batches.manage");
  const rec = id ? store.update("batches", id, patch) : store.insert("batches", { status: "active", instructorIds: [], completedModuleIds: [], moduleIds: [], ...patch });
  log(user, id ? "batch.update" : "batch.create", "batches", rec.id, rec.name);
  return rec;
});

export const toggleModuleComplete = wrap((user, batchId, moduleId, done) => {
  assert(user, "batches.manage");
  return store.update("batches", batchId, (b) => {
    const set = new Set(b.completedModuleIds || []);
    done ? set.add(moduleId) : set.delete(moduleId);
    return { ...b, completedModuleIds: [...set] };
  });
});

function slotsOverlap(a, b) {
  return a.weekday === b.weekday && a.start < b.end && b.start < a.end;
}

// Throws if the room or an instructor is double-booked at this time on this weekday.
export function checkTimetableClash(slot, excludeId) {
  const slots = store.where("timetableSlots", (s) => s.id !== excludeId && slotsOverlap(s, slot));
  const roomClash = slots.find((s) => s.room && s.room === slot.room);
  if (roomClash) return `Room ${slot.room} is already booked then (batch ${store.byId("batches", roomClash.batchId)?.name || roomClash.batchId}).`;
  const instClash = slots.find((s) => s.instructorId === slot.instructorId);
  if (instClash) return `${store.byId("users", slot.instructorId)?.name || "This instructor"} already has a class then.`;
  return null;
}

export const saveTimetableSlot = wrap((user, id, patch) => {
  assert(user, "batches.manage");
  const clash = checkTimetableClash(patch, id);
  if (clash) throw new Error(clash);
  return id ? store.update("timetableSlots", id, patch) : store.insert("timetableSlots", patch);
});

export const removeTimetableSlot = wrap((user, id) => {
  assert(user, "batches.manage");
  store.remove("timetableSlots", id);
});

export const saveResource = wrap(async (user, patch, fileList) => {
  assert(user, "resources.manage");
  let file = null;
  if (fileList && fileList.length) file = await files.saveUpload(fileList[0], { ownerId: user.id });
  const rec = store.insert("resources", { downloads: 0, uploadedBy: user.id, ...patch, fileId: file?.id || patch.fileId || null });
  log(user, "resource.upload", "resources", rec.id, rec.title);
  const batchIds = patch.batchId ? [patch.batchId] : store.where("batches", (b) => b.courseId === patch.courseId).map((b) => b.id);
  notifyBatchStudents(batchIds, { type: "resource", title: "New resource: " + rec.title, link: "student-resources.html" });
  return rec;
});

export const removeResource = wrap((user, id) => {
  assert(user, "resources.manage");
  const rec = store.byId("resources", id);
  if (rec?.fileId) files.removeFile(rec.fileId);
  store.remove("resources", id);
});

export const recordDownload = wrap((user, resourceId) => store.update("resources", resourceId, (r) => ({ ...r, downloads: (r.downloads || 0) + 1 })));

function studentsOfBatch(batchId) {
  return store.where("enrollments", (e) => e.batchId === batchId && e.status === "active").map((e) => e.studentId);
}

function notifyBatchStudents(batchIds, payload) {
  const ids = new Set();
  batchIds.forEach((bId) => studentsOfBatch(bId).forEach((sid) => ids.add(sid)));
  ids.forEach((sid) => notify(sid, payload));
}

/* ---- enrolment (creates the installment invoices) ---- */

export const enrollStudent = wrap((user, { studentId, batchId }) => {
  assert(user, "enrollments.manage");
  const batch = store.byId("batches", batchId);
  if (!batch) throw new Error("Batch not found.");
  const filled = store.count("enrollments", (e) => e.batchId === batchId && e.status === "active");
  if (batch.capacity && filled >= batch.capacity) throw new Error("This batch is at capacity.");
  const already = store.get("enrollments").find((e) => e.studentId === studentId && e.batchId === batchId && e.status === "active");
  if (already) throw new Error("This student is already enrolled in this batch.");

  const structure = store.byId("feeStructures", batch.feeStructureId);
  const enr = store.insert("enrollments", { studentId, batchId, courseId: batch.courseId, enrolledAt: nowISO(), status: "active", invoiceIds: [] });

  const invoiceIds = [];
  if (structure) {
    const total = structure.components.reduce((s, c) => s + c.amount, 0);
    for (const inst of structure.installments) {
      const amount = Math.round((total * inst.pct) / 100);
      const inv = createInvoiceRecord(user, {
        studentId, enrollmentId: enr.id,
        items: [{ label: `${inst.label} — ${store.byId("courses", batch.courseId)?.title || ""}`, amount }],
        dueDate: addDays(today(), inst.dueOffsetDays), gstPct: structure.gstPct || 0,
      });
      invoiceIds.push(inv.id);
    }
  }
  store.update("enrollments", enr.id, { invoiceIds });
  notify(studentId, { type: "enrollment", title: `Enrolled in ${batch.name}`, body: "Your class schedule and fee invoices are ready.", link: "student-courses.html" });
  log(user, "enrollment.create", "enrollments", enr.id, `Enrolled in ${batch.name}`);
  return store.byId("enrollments", enr.id);
});

export const transferEnrollment = wrap((user, enrollmentId, newBatchId) => {
  assert(user, "enrollments.manage");
  const enr = store.byId("enrollments", enrollmentId);
  store.update("enrollments", enrollmentId, { status: "transferred" });
  const batch = store.byId("batches", newBatchId);
  const created = store.insert("enrollments", { studentId: enr.studentId, batchId: newBatchId, courseId: batch.courseId, enrolledAt: nowISO(), status: "active", invoiceIds: [] });
  notify(enr.studentId, { type: "enrollment", title: `Transferred to ${batch.name}`, link: "student-courses.html" });
  log(user, "enrollment.transfer", "enrollments", enrollmentId, `Transferred to ${batch.name}`);
  return created;
});

export const dropEnrollment = wrap((user, enrollmentId, reason) => {
  assert(user, "enrollments.manage");
  store.update("enrollments", enrollmentId, { status: "dropped", dropReason: reason || "" });
  log(user, "enrollment.drop", "enrollments", enrollmentId, reason || "Dropped");
});

export const completeEnrollment = wrap((user, enrollmentId, certificateNo) => {
  assert(user, "enrollments.manage");
  return store.update("enrollments", enrollmentId, { status: "completed", completedAt: nowISO(), certificateNo: certificateNo || null });
});

/* =========================================================================================
   ATTENDANCE & LEAVE
   ========================================================================================= */

export const markAttendance = wrap((user, { batchId, slotId, date, records }) => {
  assert(user, "attendance.mark");
  const existing = store.get("attendanceSessions").find((s) => s.batchId === batchId && s.slotId === slotId && s.date === date);
  const rec = existing
    ? store.update("attendanceSessions", existing.id, { records, markedBy: user.id, markedAt: nowISO() })
    : store.insert("attendanceSessions", { batchId, slotId, date, records, markedBy: user.id, markedAt: nowISO() });
  log(user, "attendance.mark", "attendanceSessions", rec.id, `Marked attendance for ${store.byId("batches", batchId)?.name || batchId}`);
  return rec;
});

export const requestLeave = wrap((user, { from, to, type, reason, fileList }) => {
  assertOwnOrPerm(user, user.id, null);
  const overlap = store.get("leaveRequests").some((l) => l.studentId === user.id && l.status !== "rejected" && l.status !== "cancelled" && l.from <= to && from <= l.to);
  if (overlap) throw new Error("You already have a leave request covering these dates.");
  return (async () => {
    const fileId = fileList && fileList.length ? (await files.saveUpload(fileList[0], { ownerId: user.id })).id : null;
    const rec = store.insert("leaveRequests", { studentId: user.id, from, to, type, reason, fileId, status: "pending" });
    log(user, "leave.request", "leaveRequests", rec.id, `${type} leave, ${from} to ${to}`);
    notifyStaffFor(user, { type: "leave", title: `Leave request from ${user.name}`, link: "admin-academics.html?tab=leave" });
    return rec;
  })();
});

export const cancelLeave = wrap((user, id) => {
  const rec = store.byId("leaveRequests", id);
  if (rec.studentId !== user.id) assert(user, "leave.review");
  if (rec.status !== "pending") throw new Error("Only a pending request can be cancelled.");
  return store.update("leaveRequests", id, { status: "cancelled" });
});

export const reviewLeave = wrap((user, id, decision, note) => {
  assert(user, "leave.review");
  const rec = store.update("leaveRequests", id, { status: decision, reviewedBy: user.id, reviewedAt: nowISO(), reviewNote: note || "" });
  if (decision === "approved") {
    for (const batch of sel.activeBatchesOf(rec.studentId)) {
      for (const date of dateRange(rec.from, rec.to)) {
        for (const session of sel.sessionsForBatch(batch.id, { from: date, to: date })) {
          store.update("attendanceSessions", session.id, (s) => ({ ...s, records: { ...s.records, [rec.studentId]: "E" } }));
        }
      }
    }
  }
  notify(rec.studentId, { type: "leave", title: `Leave request ${decision}`, body: note || "", link: "student-attendance.html" });
  log(user, "leave.review", "leaveRequests", id, decision);
  return rec;
});

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function notifyStaffFor(student, payload) {
  const batchIds = sel.activeBatchesOf(student.id).map((b) => b.id);
  const teacherIds = new Set(store.get("batches").filter((b) => batchIds.includes(b.id)).flatMap((b) => b.instructorIds || []));
  teacherIds.forEach((id) => notify(id, payload));
  store.where("users", (u) => u.role === "admin").forEach((u) => notify(u.id, payload));
}

/* =========================================================================================
   ASSIGNMENTS & GRADING
   ========================================================================================= */

export const saveAssignment = wrap((user, id, patch) => {
  assert(user, "assignments.manage");
  const rec = id ? store.update("assignments", id, patch) : store.insert("assignments", { status: "draft", ...patch });
  if (rec.status === "published" && (!id || patch.status === "published")) {
    notifyBatchStudents([rec.batchId], { type: "assignment", title: "New assignment: " + rec.title, link: "student-assignments.html" });
  }
  log(user, id ? "assignment.update" : "assignment.create", "assignments", rec.id, rec.title);
  return rec;
});

export const removeAssignment = wrap((user, id) => {
  assert(user, "assignments.manage");
  store.remove("submissions", (s) => s.assignmentId === id);
  store.remove("assignments", id);
});

export const submitAssignment = wrap((user, assignmentId, { text, fileList }) => {
  return (async () => {
    const assignment = store.byId("assignments", assignmentId);
    const existing = sel.submissionFor(assignmentId, user.id);
    if (existing && existing.status === "graded") throw new Error("This assignment has already been graded.");
    const late = today() > dateOf(assignment.dueAt);
    if (late && !assignment.allowLate) throw new Error("The deadline for this assignment has passed.");
    const fileIds = fileList && fileList.length ? (await files.saveUploads(fileList, { ownerId: user.id })).map((f) => f.id) : existing?.fileIds || [];
    const rec = existing
      ? store.update("submissions", existing.id, { text, fileIds, submittedAt: nowISO(), late, status: "submitted" })
      : store.insert("submissions", { assignmentId, studentId: user.id, text, fileIds, submittedAt: nowISO(), late, status: "submitted", marks: null, feedback: "" });
    log(user, "assignment.submit", "submissions", rec.id, assignment.title);
    const teacherIds = new Set(store.byId("batches", assignment.batchId)?.instructorIds || []);
    teacherIds.forEach((id) => notify(id, { type: "assignment", title: `${user.name} submitted "${assignment.title}"`, link: "admin-academics.html?tab=assignments" }));
    return rec;
  })();
});

export const gradeSubmission = wrap((user, submissionId, { marks, feedback }) => {
  assert(user, "assignments.grade");
  const rec = store.update("submissions", submissionId, { marks, feedback: feedback || "", status: "graded", gradedBy: user.id, gradedAt: nowISO() });
  const assignment = store.byId("assignments", rec.assignmentId);
  notify(rec.studentId, { type: "grade", title: `Graded: ${assignment?.title}`, body: `Marks: ${marks}/${assignment?.maxMarks}`, link: "student-assignments.html" });
  log(user, "assignment.grade", "submissions", submissionId, `${marks}/${assignment?.maxMarks}`);
  return rec;
});

/* =========================================================================================
   EXAMS, MARKS, RESULTS, TRANSCRIPTS
   ========================================================================================= */

export const saveExam = wrap((user, id, patch) => {
  assert(user, "exams.manage");
  const rec = id ? store.update("exams", id, patch) : store.insert("exams", { status: "scheduled", ...patch });
  if (!id) notifyBatchStudents([rec.batchId], { type: "exam", title: `Exam scheduled: ${rec.title}`, link: "student-exams.html" });
  log(user, id ? "exam.update" : "exam.create", "exams", rec.id, rec.title);
  return rec;
});

export const enterMarks = wrap((user, examId, entries) => {
  assert(user, "marks.enter");
  const out = entries.map(({ studentId, marks, absent, remarks }) => {
    const existing = sel.marksFor(examId, studentId);
    const patch = { examId, studentId, marks: absent ? null : marks, absent: !!absent, remarks: remarks || "", enteredBy: user.id, enteredAt: nowISO() };
    return existing ? store.update("marks", existing.id, patch) : store.insert("marks", patch);
  });
  store.update("exams", examId, { status: "marks-entry" });
  log(user, "marks.enter", "exams", examId, `Entered marks for ${entries.length} students`);
  return out;
});

export const publishResults = wrap((user, examId) => {
  assert(user, "results.publish");
  const exam = store.update("exams", examId, { status: "published", publishedAt: nowISO() });
  const marks = store.where("marks", (m) => m.examId === examId);
  marks.forEach((m) => notify(m.studentId, { type: "result", title: `Results published: ${exam.title}`, link: "student-exams.html" }));
  log(user, "results.publish", "exams", examId, exam.title);
  return exam;
});

export const issueTranscript = wrap((user, studentId) => {
  assert(user, "transcripts.issue");
  const student = store.byId("users", studentId);
  const results = sel.examsForStudent(studentId, { publishedOnly: true }).map((exam) => ({ exam: exam.title, course: sel.courseOf(store.byId("batches", exam.batchId))?.title, marks: sel.marksFor(exam.id, studentId)?.marks, maxMarks: exam.maxMarks }));
  const serialNo = "OMA-TR-" + financialYear() + "-" + String(store.nextNumber("transcript")).padStart(4, "0");
  const rec = store.insert("transcripts", { studentId, serialNo, issuedAt: nowISO(), issuedBy: user.id, snapshot: { studentName: student.name, rollNo: student.rollNo, gpa: sel.gpaFor(studentId), results } });
  notify(studentId, { type: "transcript", title: "Your transcript is ready", link: "student-exams.html" });
  log(user, "transcript.issue", "transcripts", rec.id, serialNo);
  return rec;
});

/* =========================================================================================
   FEE STRUCTURES, INVOICES, PAYMENTS
   ========================================================================================= */

export const saveFeeStructure = wrap((user, id, patch) => {
  assert(user, "feeStructures.manage");
  return id ? store.update("feeStructures", id, patch) : store.insert("feeStructures", { installments: [{ label: "Full payment", dueOffsetDays: 7, pct: 100 }], gstPct: 0, ...patch });
});

function invoiceTotal(items, discount, lateFee, gstPct) {
  const sub = items.reduce((s, i) => s + i.amount, 0) - (discount?.amount || 0) + (lateFee || 0);
  return Math.round(sub * (1 + (gstPct || 0) / 100));
}

function createInvoiceRecord(user, { studentId, enrollmentId, items, dueDate, gstPct = 0, discount = null }) {
  const number = "OMA/" + financialYear() + "/" + String(store.nextNumber("invoice")).padStart(4, "0");
  const total = invoiceTotal(items, discount, 0, gstPct);
  return store.insert("invoices", { number, studentId, enrollmentId: enrollmentId || null, items, discount, lateFee: 0, tax: Math.round(total - (total / (1 + gstPct / 100))), gstPct, total, dueDate, issuedAt: nowISO(), status: "issued", reminders: [] });
}

export const createInvoice = wrap((user, data) => {
  assert(user, "invoices.manage");
  const rec = createInvoiceRecord(user, data);
  notify(data.studentId, { type: "fee", title: `New invoice ${rec.number}`, body: `Due ${rec.dueDate}`, link: "student-fees.html" });
  log(user, "invoice.create", "invoices", rec.id, rec.number);
  return rec;
});

export const createBulkInvoices = wrap((user, { batchId, items, dueDate, gstPct }) => {
  assert(user, "invoices.manage");
  const studentIds = studentsOfBatch(batchId);
  const created = studentIds.map((studentId) => createInvoiceRecord(user, { studentId, items, dueDate, gstPct }));
  notifyBatchStudents([batchId], { type: "fee", title: "New fee invoice issued", link: "student-fees.html" });
  log(user, "invoice.bulk-create", "invoices", null, `${created.length} invoices for batch ${batchId}`);
  return created;
});

export const cancelInvoice = wrap((user, id, reason) => {
  assert(user, "invoices.manage");
  if (sel.paidAmount(id) > 0) throw new Error("A paid or partially paid invoice can't be cancelled.");
  store.update("invoices", id, { status: "cancelled", cancelReason: reason || "" });
  log(user, "invoice.cancel", "invoices", id, reason || "");
});

export const applyDiscount = wrap((user, id, amount, reason) => {
  assert(user, "fees.waive");
  const inv = store.byId("invoices", id);
  const total = invoiceTotal(inv.items, { amount, reason }, inv.lateFee, inv.gstPct);
  const rec = store.update("invoices", id, { discount: { amount, reason }, total });
  log(user, "invoice.discount", "invoices", id, `${amount} — ${reason}`);
  return rec;
});

function sendReminderNow(user, invoiceId, channel) {
  const inv = store.update("invoices", invoiceId, (i) => ({ ...i, reminders: [...i.reminders, { at: nowISO(), by: user.id, channel }] }));
  store.insert("deliveries", { channel, to: store.byId("users", inv.studentId)?.email, subject: `Fee reminder — ${inv.number}`, at: nowISO(), status: "sent" });
  notify(inv.studentId, { type: "fee", title: `Reminder: ${inv.number} is due`, link: "student-fees.html" });
  log(user, "invoice.remind", "invoices", invoiceId, channel);
  return inv;
}

export const sendReminder = wrap((user, invoiceId, channel = "email") => {
  assert(user, "fees.remind");
  return sendReminderNow(user, invoiceId, channel);
});

export const sendBulkReminders = wrap((user, invoiceIds, channel = "email") => {
  assert(user, "fees.remind");
  return invoiceIds.map((id) => sendReminderNow(user, id, channel));
});

export const recordPayment = wrap((user, { invoiceId, amount, method, reference }) => {
  assert(user, "payments.record");
  const inv = store.byId("invoices", invoiceId);
  const receiptNo = "OMA/RCPT/" + financialYear() + "/" + String(store.nextNumber("receipt")).padStart(4, "0");
  const rec = store.insert("payments", { receiptNo, invoiceId, studentId: inv.studentId, amount, method, reference: reference || "", paidAt: nowISO(), recordedBy: user.id, status: "success" });
  notify(inv.studentId, { type: "fee", title: `Payment received — ${receiptNo}`, body: `₹${amount} for ${inv.number}`, link: "student-fees.html" });
  log(user, "payment.record", "payments", rec.id, `₹${amount} for ${inv.number}`);
  return rec;
});

// Student "pays" online — simulated, no card data is ever collected.
export const payInvoiceOnline = wrap((user, invoiceId, amount, method, simulate = "success") => {
  const inv = store.byId("invoices", invoiceId);
  if (inv.studentId !== user.id) throw new Error("You can only pay your own invoices.");
  const receiptNo = "OMA/RCPT/" + financialYear() + "/" + String(store.nextNumber("receipt")).padStart(4, "0");
  const rec = store.insert("payments", { receiptNo, invoiceId, studentId: user.id, amount, method, reference: "SIM-" + Date.now().toString(36).toUpperCase(), paidAt: nowISO(), recordedBy: null, status: simulate === "success" ? "success" : "failed" });
  if (simulate === "success") {
    store.where("users", (u) => u.role === "admin" || u.role === "accountant").forEach((u) => notify(u.id, { type: "fee", title: `Payment received from ${user.name}`, body: `₹${amount} for ${inv.number}`, link: "admin-fees.html" }));
    log(user, "payment.online", "payments", rec.id, `₹${amount} for ${inv.number}`);
  }
  return rec;
});

/* =========================================================================================
   COMMUNICATION: ANNOUNCEMENTS, DIRECT NOTIFICATIONS, THREADS, FORUM
   ========================================================================================= */

export const createAnnouncement = wrap((user, data) => {
  assert(user, "announcements.manage");
  const rec = store.insert("announcements", { pinned: false, channels: ["in-app"], readBy: [], createdBy: user.id, publishAt: today(), ...data });
  log(user, "announcement.create", "announcements", rec.id, rec.title);
  if (rec.channels?.includes("sms") || rec.channels?.includes("email")) {
    store.insert("deliveries", { channel: rec.channels.includes("sms") ? "sms" : "email", to: "(audience)", subject: rec.title, at: nowISO(), status: "sent" });
  }
  return rec;
});

export const updateAnnouncement = wrap((user, id, patch) => {
  assert(user, "announcements.manage");
  return store.update("announcements", id, patch);
});

export const removeAnnouncement = wrap((user, id) => {
  assert(user, "announcements.manage");
  store.remove("announcements", id);
});

export const markAnnouncementRead = wrap((user, id) => store.update("announcements", id, (a) => (a.readBy.includes(user.id) ? a : { ...a, readBy: [...a.readBy, user.id] })));

export const sendNotification = wrap((user, { userIds, title, body, link }) => {
  assert(user, "notifications.send");
  const created = userIds.map((uid) => notify(uid, { type: "direct", title, body, link }));
  log(user, "notification.send", "notifications", null, `${created.length} recipients: ${title}`);
  return created;
});

export const markNotificationRead = wrap((user, id) => {
  if (String(id).startsWith("ann-feed-")) return markAnnouncementRead(user, id.replace("ann-feed-", ""));
  return store.update("notifications", id, { readAt: nowISO() });
});

export const markAllRead = wrap((user) => {
  const stamp = nowISO();
  store.updateWhere("notifications", (n) => n.userId === user.id && !n.readAt, (n) => ({ ...n, readAt: stamp }));
  store.updateWhere("announcements", () => true, (a) => (a.readBy.includes(user.id) ? a : { ...a, readBy: [...a.readBy, user.id] }));
});

function threadKey(participants) {
  return participants.map((p) => p.type + ":" + p.id).sort().join("|");
}

export const startThread = wrap((user, { subject, category, participants, body, fileList }) => {
  return (async () => {
    const all = [{ type: "user", id: user.id }, ...participants];
    const key = threadKey(all);
    let thread = store.get("threads").find((t) => threadKey(t.participants) === key && t.status === "open");
    if (!thread) thread = store.insert("threads", { subject, category: category || "general", participants: all, createdBy: user.id, status: "open", lastMessageAt: nowISO(), readAt: { [user.id]: nowISO() } });
    const fileIds = fileList && fileList.length ? (await files.saveUploads(fileList, { ownerId: user.id })).map((f) => f.id) : [];
    const msg = store.insert("messages", { threadId: thread.id, senderId: user.id, body, fileIds, sentAt: nowISO() });
    store.update("threads", thread.id, (t) => ({ ...t, lastMessageAt: msg.sentAt, readAt: { ...t.readAt, [user.id]: msg.sentAt } }));
    notifyThreadRecipients(thread, user, subject);
    return thread;
  })();
});

export const replyThread = wrap((user, threadId, { body, fileList }) => {
  return (async () => {
    const thread = store.byId("threads", threadId);
    const fileIds = fileList && fileList.length ? (await files.saveUploads(fileList, { ownerId: user.id })).map((f) => f.id) : [];
    const msg = store.insert("messages", { threadId, senderId: user.id, body, fileIds, sentAt: nowISO() });
    store.update("threads", threadId, (t) => ({ ...t, lastMessageAt: msg.sentAt, readAt: { ...t.readAt, [user.id]: msg.sentAt } }));
    notifyThreadRecipients(thread, user, thread.subject);
    log(user, "message.reply", "threads", threadId, thread.subject);
    return msg;
  })();
});

function notifyThreadRecipients(thread, sender, subject) {
  for (const p of thread.participants) {
    if (p.type === "user" && p.id !== sender.id) notify(p.id, { type: "message", title: `New message: ${subject}`, link: sender.role === "student" ? "admin-communication.html?tab=inbox" : "student-notifications.html?tab=messages" });
    if (p.type === "role" && p.id !== sender.role) {
      store.where("users", (u) => u.role === p.id).forEach((u) => notify(u.id, { type: "message", title: `New message: ${subject}`, link: "admin-communication.html?tab=inbox" }));
    }
  }
}

export const closeThread = wrap((user, id) => {
  assert(user, "messages.reply");
  return store.update("threads", id, { status: "closed" });
});
export const markThreadRead = wrap((user, id) => store.update("threads", id, (t) => ({ ...t, readAt: { ...t.readAt, [user.id]: nowISO() } })));

export const createForumThread = wrap((user, { scope, title, body, tags }) => {
  const rec = store.insert("forumThreads", { scope, title, body, authorId: user.id, tags: tags || [], pinned: false, locked: false, hidden: false, solvedPostId: null, lastPostAt: nowISO(), views: 0 });
  log(user, "forum.create", "forumThreads", rec.id, title);
  return rec;
});

export const replyForumThread = wrap((user, threadId, body) => {
  const thread = store.byId("forumThreads", threadId);
  if (thread.locked) throw new Error("This thread is locked.");
  const rec = store.insert("forumPosts", { threadId, authorId: user.id, body, editedAt: null, hidden: false, likes: [], reports: [] });
  store.update("forumThreads", threadId, { lastPostAt: nowISO() });
  if (thread.authorId !== user.id) notify(thread.authorId, { type: "forum", title: `New reply on "${thread.title}"`, link: "student-forum.html?id=" + threadId });
  return rec;
});

export const toggleLikePost = wrap((user, postId) => store.update("forumPosts", postId, (p) => ({ ...p, likes: p.likes.includes(user.id) ? p.likes.filter((id) => id !== user.id) : [...p.likes, user.id] })));

export const reportPost = wrap((user, postId, reason) => {
  const rec = store.update("forumPosts", postId, (p) => ({ ...p, reports: [...p.reports, { by: user.id, reason, at: nowISO() }] }));
  store.where("users", (u) => roleHas(store.byId("roles", u.role), "forum.moderate")).forEach((u) => notify(u.id, { type: "forum", title: "A post was reported", link: "admin-communication.html?tab=moderation" }));
  return rec;
});

export const moderateForumPost = wrap((user, postId, action) => {
  assert(user, "forum.moderate");
  if (action === "hide") return store.update("forumPosts", postId, { hidden: true, reports: [] });
  if (action === "approve") return store.update("forumPosts", postId, { reports: [] });
});

export const moderateForumThread = wrap((user, threadId, patch) => {
  assert(user, "forum.moderate");
  return store.update("forumThreads", threadId, patch);
});

export const incrementThreadViews = wrap((user, threadId) => store.update("forumThreads", threadId, (t) => ({ ...t, views: (t.views || 0) + 1 })));

/* =========================================================================================
   CALENDAR / EVENTS / SETTINGS
   ========================================================================================= */

export const saveEvent = wrap((user, id, patch) => {
  assert(user, "calendar.manage");
  const rec = id ? store.update("events", id, patch) : store.insert("events", patch);
  log(user, id ? "event.update" : "event.create", "events", rec.id, rec.title);
  return rec;
});

export const removeEvent = wrap((user, id) => {
  assert(user, "calendar.manage");
  store.remove("events", id);
});

export const updateSettings = wrap((user, patch) => {
  assert(user, "settings.manage");
  const rec = store.patchSingleton("settings", patch);
  log(user, "settings.update", "settings", null, Object.keys(patch).join(", "));
  return rec;
});

/* =========================================================================================
   DATA: EXPORT / IMPORT / RESET
   ========================================================================================= */

export const exportData = wrap(async (user, { includeFiles = false } = {}) => {
  assert(user, "data.manage");
  const payload = store.exportAll();
  if (includeFiles) payload.files_blobs = await files.exportBlobs();
  log(user, "data.export", "meta", null, includeFiles ? "Exported data + files" : "Exported data");
  return payload;
});

export const importData = wrap(async (user, payload) => {
  assert(user, "data.manage");
  store.importAll(payload);
  if (payload.files_blobs) await files.importBlobs(payload.files_blobs);
});

export const resetDemoData = wrap(async (user) => {
  if (user) assert(user, "data.manage");
  await files.clearBlobs();
  await store.reseed();
});

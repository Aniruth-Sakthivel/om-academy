/*
Author       : OM Academy
Description  : Deterministic demo data. buildSeed() returns every collection the store needs, generated with a
               fixed-seed PRNG (mulberry32) so re-seeding always produces the same structure — only the dates move,
               anchored to "today" at the moment of seeding. No Math.random()/Date.now() outside this rule.
*/

import { DEFAULT_ROLES } from "./perms.js";
import { today, addDays, addMonths, weekday, financialYear, dateOf, combineISO } from "./clock.js";

const SEED = 0x9e3779b1;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(SEED);
const reset = () => (rand = mulberry32(SEED));
const rnd = () => rand();
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[int(0, arr.length - 1)];
const pickN = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(int(0, copy.length - 1), 1)[0]);
  return out;
};
const chance = (p) => rnd() < p;
const shuffle = (arr) => pickN(arr, arr.length);

let idCounters = {};
function id(prefix) {
  idCounters[prefix] = (idCounters[prefix] || 0) + 1;
  return prefix + "_" + String(idCounters[prefix]).padStart(3, "0");
}

const ANCHOR = () => today(); // "today" captured at the moment buildSeed() runs

/* ============================================================================
   NAMES
   ============================================================================ */

const FIRST_NAMES_M = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan", "Rohan", "Kabir", "Aryan", "Dev", "Yash", "Karan", "Rahul", "Nikhil", "Manav", "Tarun", "Gaurav", "Rajat", "Deepak", "Amit", "Suresh", "Rakesh", "Vikas", "Sanjay", "Anil", "Mohit"];
const FIRST_NAMES_F = ["Aanya", "Diya", "Ananya", "Ira", "Myra", "Riya", "Priya", "Kavya", "Sanya", "Aditi", "Isha", "Neha", "Pooja", "Simran", "Tanvi", "Meera", "Kiran", "Nisha", "Anjali", "Shreya", "Divya", "Komal", "Ritu", "Sneha", "Payal", "Bhavna", "Sonia", "Rekha", "Preeti", "Manisha"];
const LAST_NAMES = ["Sharma", "Verma", "Kumar", "Singh", "Gupta", "Yadav", "Malik", "Chauhan", "Rana", "Dahiya", "Sangwan", "Bishnoi", "Kaushik", "Jangra", "Punia", "Saini", "Beniwal", "Godara", "Redhu", "Duhan", "Mehta", "Arora", "Kapoor", "Bhatia", "Chopra", "Nagar", "Rathi", "Sindhu", "Ahlawat", "Khatri"];

function personName(gender) {
  const first = gender === "F" ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
  return first + " " + pick(LAST_NAMES);
}

function emailOf(name, domain, uniq) {
  const slug = name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).join(".");
  return slug + (uniq > 0 ? uniq : "") + "@" + domain;
}

const usedEmails = new Set();
function uniqueEmail(name, domain) {
  let n = 0;
  let email = emailOf(name, domain, n);
  while (usedEmails.has(email)) email = emailOf(name, domain, ++n);
  usedEmails.add(email);
  return email;
}

/* ============================================================================
   CENTERS
   ============================================================================ */

function buildCenters() {
  return [
    { id: id("ctr"), code: "HSR", name: "Hisar Center", city: "Hisar", address: "17/20 A, Near National Heart Lab, Jat College Road, Hisar, Haryana", phone: "+91 99928 87708" },
    { id: id("ctr"), code: "HNS", name: "Hansi Center", city: "Hansi", address: "Main Market Road, Near Bus Stand, Hansi, Haryana", phone: "+91 99928 87709" },
    { id: id("ctr"), code: "BRW", name: "Barwala Center", city: "Barwala", address: "Old Court Road, Barwala, Hisar, Haryana", phone: "+91 99928 87710" },
  ];
}

/* ============================================================================
   COURSES  (mirrors the home page catalogue)
   ============================================================================ */

function buildCourses() {
  const defs = [
    { code: "CCC", title: "CCC — Course on Computer Concepts", body: "NIELIT", category: "IT & Computers", tone: "blue", durationWeeks: 12, description: "Government-recognized foundational IT and computer literacy program.", modules: ["Computer Fundamentals", "Operating System Basics", "Word Processing", "Spreadsheets", "Presentations", "Internet & Email", "Digital Financial Tools"] },
    { code: "OLVL", title: "O Level", body: "NIELIT", category: "IT & Computers", tone: "blue", durationWeeks: 26, description: "Advanced NIELIT IT diploma covering programming, web and IT tools.", modules: ["IT Tools & Business Systems", "Programming & Problem Solving", "Web Applications", "PC & Mobile Technology", "Practical Lab"] },
    { code: "HSCIT", title: "HS-CIT — Haryana State Certificate in Information Technology", body: "HKCL", category: "IT & Computers", tone: "purple", durationWeeks: 10, description: "Haryana Government IT literacy certification, valued for state jobs.", modules: ["Computer Basics", "MS Office Suite", "Internet Usage", "Government e-Services"] },
    { code: "HRTA", title: "HARTRON Advanced Computing", body: "HARTRON", category: "Skill Development", tone: "green", durationWeeks: 16, description: "Industry-aligned advanced skill program from Haryana's electronics corporation.", modules: ["Advanced Office Tools", "Networking Basics", "Hardware Troubleshooting", "Cyber Safety"] },
    { code: "TALLY", title: "Tally + GST", body: "Vocational", category: "Accounting & Finance", tone: "amber", durationWeeks: 8, description: "Practical accounting, billing and GST compliance using Tally Prime.", modules: ["Accounting Fundamentals", "Tally Prime Basics", "Inventory & Billing", "GST Returns & Compliance"] },
    { code: "WEBDEV", title: "Web Design & Development", body: "Skill Programs", category: "IT & Computers", tone: "navy", durationWeeks: 14, description: "HTML, CSS, JavaScript and responsive design for job-ready web skills.", modules: ["HTML & CSS Foundations", "JavaScript Essentials", "Responsive Design", "Portfolio Project"] },
    { code: "FIRE", title: "Fireman Training", body: "Vocational & Safety", category: "Safety & Vocational", tone: "rust", durationWeeks: 6, description: "Practical fire safety and emergency response certification.", modules: ["Fire Science Basics", "Equipment Handling", "Rescue Drills", "Field Practicals"] },
    { code: "HSI", title: "Health Sanitary Inspector", body: "Vocational & Safety", category: "Safety & Vocational", tone: "rust", durationWeeks: 10, description: "Public health, sanitation and inspection certificate program.", modules: ["Public Health Basics", "Sanitation Standards", "Inspection Procedures", "Field Training"] },
  ];
  return defs.map((d) => ({
    id: id("crs"),
    code: d.code,
    title: d.title,
    body: d.body,
    category: d.category,
    tone: d.tone,
    durationWeeks: d.durationWeeks,
    description: d.description,
    syllabus: d.modules.map((title, i) => ({ id: `mod_${d.code}_${i + 1}`, title, topics: [] })),
    feeStructureId: null,
    status: "active",
  }));
}

/* ============================================================================
   FEE STRUCTURES
   ============================================================================ */

function buildFeeStructures(courses) {
  const priceFor = { CCC: 4500, OLVL: 12000, HSCIT: 3500, HRTA: 9000, TALLY: 7000, WEBDEV: 11000, FIRE: 5000, HSI: 6500 };
  return courses.map((c) => {
    const base = priceFor[c.code] || 6000;
    return {
      id: id("fs"),
      courseId: c.id,
      name: c.title + " — Standard Fee",
      components: [
        { label: "Tuition Fee", amount: Math.round(base * 0.75) },
        { label: "Registration & Study Material", amount: Math.round(base * 0.15) },
        { label: "Exam & Certification Fee", amount: base - Math.round(base * 0.75) - Math.round(base * 0.15) },
      ],
      installments: c.durationWeeks >= 16
        ? [{ label: "1st Installment", dueOffsetDays: 7, pct: 50 }, { label: "2nd Installment", dueOffsetDays: 60, pct: 50 }]
        : [{ label: "Full Payment", dueOffsetDays: 7, pct: 100 }],
      gstPct: 0,
      lateFee: { type: "flat", amount: 200, graceDays: 7 },
    };
  });
}

/* ============================================================================
   USERS (staff + demo accounts + students)
   ============================================================================ */

function buildStaff(centers) {
  const teachers = [
    { name: "Priya Malik", specializations: ["CCC", "OLVL", "HSCIT"] },
    { name: "Rohan Kaushik", specializations: ["WEBDEV", "OLVL"] },
    { name: "Sanya Chauhan", specializations: ["TALLY"] },
    { name: "Vikas Sangwan", specializations: ["HRTA", "HSCIT"] },
    { name: "Neha Punia", specializations: ["CCC", "HSCIT"] },
    { name: "Deepak Bishnoi", specializations: ["FIRE", "HSI"] },
    { name: "Kavya Rana", specializations: ["WEBDEV"] },
    { name: "Amit Jangra", specializations: ["TALLY", "HRTA"] },
  ];
  const staffUsers = teachers.map((t, i) => ({
    id: i === 0 ? "usr_teacher_demo" : id("usr"),
    role: "teacher",
    name: t.name,
    email: i === 0 ? "teacher@omacademy.in" : uniqueEmail(t.name, "omacademy.in"),
    password: i === 0 ? "teacher123" : "teacher123",
    phone: "+91 9" + int(100000000, 999999999),
    centerId: pick(centers).id,
    status: "active",
    lastLoginAt: null,
    prefs: { theme: "light", notify: { assignment: { inApp: true }, leave: { inApp: true } } },
    designation: "Faculty", department: "Academics", joinDate: addDays(ANCHOR(), -int(200, 1200)), specializations: t.specializations,
  }));

  const office = [
    { name: "Rajat Sharma", role: "admin", designation: "Center Director", isDemo: true, email: "admin@omacademy.in", password: "admin123" },
    { name: "Meera Gupta", role: "accountant", designation: "Accounts Officer", isDemo: true, email: "accounts@omacademy.in", password: "accounts123" },
    { name: "Suresh Yadav", role: "admin", designation: "Assistant Director", isDemo: false },
    { name: "Komal Arora", role: "accountant", designation: "Front Office & Fees", isDemo: false },
  ].map((o) => ({
    id: o.isDemo ? "usr_" + o.role + "_demo" : id("usr"),
    role: o.role,
    name: o.name,
    email: o.email || uniqueEmail(o.name, "omacademy.in"),
    password: o.password || "staff123",
    phone: "+91 9" + int(100000000, 999999999),
    centerId: centers[0].id,
    status: "active",
    lastLoginAt: null,
    prefs: { theme: "light", notify: {} },
    designation: o.designation, department: "Administration", joinDate: addDays(ANCHOR(), -int(300, 1500)), specializations: [],
  }));

  return [...staffUsers, ...office];
}

function buildStudents(centers, count) {
  const students = [];
  for (let i = 0; i < count; i++) {
    const gender = chance(0.48) ? "F" : "M";
    const name = i === 0 ? "Aarav Verma" : personName(gender);
    const isDemo = i === 0;
    const admissionDate = addDays(ANCHOR(), -int(15, 420));
    students.push({
      id: isDemo ? "usr_student_demo" : id("usr"),
      role: "student",
      name,
      email: isDemo ? "student@omacademy.in" : uniqueEmail(name, "gmail.com"),
      password: isDemo ? "student123" : "student123",
      phone: "+91 9" + int(100000000, 999999999),
      centerId: pick(centers).id,
      status: chance(0.03) ? "inactive" : "active",
      lastLoginAt: null,
      prefs: { theme: "light", notify: { assignment: { inApp: true }, fee: { inApp: true }, grade: { inApp: true } } },
      rollNo: "OMA" + financialYear(admissionDate) + "-" + String(i + 1).padStart(4, "0"),
      admissionDate,
      dob: addDays(ANCHOR(), -int(6200, 9500)),
      gender,
      guardianName: personName(gender === "F" ? "M" : "F"),
      guardianPhone: "+91 9" + int(100000000, 999999999),
      address: `H.No. ${int(1, 400)}, ${pick(["Model Town", "Civil Lines", "Housing Board Colony", "Sector 13-17", "Old City", "Railway Road"])}, ${pick(centers).city}, Haryana`,
      qualification: pick(["10th Pass", "12th Pass", "Graduate", "Post Graduate"]),
    });
  }
  return students;
}

/* ============================================================================
   BATCHES + TIMETABLE
   ============================================================================ */

const ROOMS = ["Lab 1", "Lab 2", "Lab 3", "Room A", "Room B"];
const SLOT_TIMES = [["09:00", "10:30"], ["10:30", "12:00"], ["12:30", "14:00"], ["14:30", "16:00"], ["16:00", "17:30"]];
const SLOT_LABEL = ["Morning", "Morning", "Afternoon", "Evening", "Evening"];

// The demo teacher (Priya Malik) always teaches these, so the teacher login has real batches to show.
const DEMO_TEACHER_COURSES = ["CCC", "HSCIT"];

function buildBatchesAndSlots(courses, centers, staff) {
  const teachers = staff.filter((u) => u.role === "teacher");
  const demoTeacher = teachers.find((t) => t.id === "usr_teacher_demo");
  const batches = [];
  const slots = [];
  const courseCodes = ["CCC", "OLVL", "HSCIT", "HRTA", "TALLY", "WEBDEV"];

  // Each batch gets its own time slot + room, and alternates Mon/Wed/Fri vs Tue/Thu/Sat, so no room or teacher
  // is ever double-booked in the seed (the same rule checkTimetableClash() enforces for new slots).
  courseCodes.forEach((code, index) => {
    const course = courses.find((c) => c.code === code);
    const center = centers[index % centers.length];
    const timeIdx = index % SLOT_TIMES.length;
    const days = index % 2 === 0 ? [1, 3, 5] : [2, 4, 6];
    const room = ROOMS[index % ROOMS.length];
    const eligible = teachers.filter((t) => t.specializations.includes(course.code) && t.id !== "usr_teacher_demo");
    const instructors = DEMO_TEACHER_COURSES.includes(code) ? [demoTeacher] : eligible.length ? pickN(eligible, 1) : [pick(teachers)];
    const startDate = addDays(ANCHOR(), -int(35, 60));
    const suffix = SLOT_LABEL[timeIdx];
    const batch = {
      id: id("bat"),
      courseId: course.id,
      centerId: center.id,
      code: course.code + "-" + suffix.slice(0, 1) + String(index + 1),
      name: `${course.title} (${suffix} Batch)`,
      startDate,
      endDate: addDays(startDate, course.durationWeeks * 7),
      capacity: int(18, 30),
      instructorIds: instructors.map((t) => t.id),
      room,
      status: "active",
      feeStructureId: course.feeStructureId,
      moduleIds: course.syllabus.map((m) => m.id),
      completedModuleIds: course.syllabus.slice(0, int(1, Math.max(1, course.syllabus.length - 1))).map((m) => m.id),
    };
    batches.push(batch);

    const [start, end] = SLOT_TIMES[timeIdx];
    for (const day of days) {
      slots.push({ id: id("slot"), batchId: batch.id, weekday: day, start, end, room, instructorId: instructors[0].id, moduleId: course.syllabus[0]?.id || null });
    }
  });
  return { batches, slots };
}

/* ============================================================================
   ENROLMENTS + INVOICES + PAYMENTS
   ============================================================================ */

function buildEnrollmentsAndFinance(students, batches, feeStructures, courses) {
  const enrollments = [];
  const invoices = [];
  const payments = [];
  let invoiceSeq = 0;
  let receiptSeq = 0;
  const fy = financialYear(ANCHOR());

  function invoiceNumber() {
    invoiceSeq++;
    return "OMA/" + fy + "/" + String(invoiceSeq).padStart(4, "0");
  }
  function receiptNumber() {
    receiptSeq++;
    return "OMA/RCPT/" + fy + "/" + String(receiptSeq).padStart(4, "0");
  }

  // Give every student 1 (occasionally 2) active enrolments in real batches.
  // The demo student is always in CCC + Web Design (matches the hint on the login page), with one invoice
  // already paid and one overdue, so "Pay now" has something to do.
  const demoCodes = ["CCC", "WEBDEV"];
  const codeOf = (batch) => courses.find((c) => c.id === batch.courseId)?.code;
  let demoInvoiceIdx = 0;
  const activeStudents = students.filter((s) => s.status === "active");
  for (const student of activeStudents) {
    const isDemo = student.id === "usr_student_demo";
    const numBatches = chance(0.15) ? 2 : 1;
    const chosen = isDemo ? batches.filter((b) => demoCodes.includes(codeOf(b))) : pickN(batches, Math.min(numBatches, batches.length));
    for (const batch of chosen) {
      const course = courses.find((c) => c.id === batch.courseId);
      const structure = feeStructures.find((f) => f.courseId === course.id);
      const enrolledAt = batch.startDate;
      const invoiceIds = [];
      const total = structure.components.reduce((s, c) => s + c.amount, 0);

      for (const inst of structure.installments) {
        const amount = Math.round((total * inst.pct) / 100);
        const dueDate = addDays(enrolledAt, inst.dueOffsetDays);
        const invId = id("inv");
        const paidChance = isDemo ? (demoInvoiceIdx++ === 0 ? 0.1 : 0.95) : rnd();
        let status = "issued";
        const invPayments = [];
        if (paidChance < 0.55) {
          // fully paid, sometime between due-14 and due+2
          const paidAt = addDays(dueDate, -int(-2, 14));
          invPayments.push({ amount, paidAt });
        } else if (paidChance < 0.75) {
          // partially paid
          invPayments.push({ amount: Math.round(amount * 0.5), paidAt: addDays(dueDate, -int(0, 5)) });
        }
        // else: unpaid, may be overdue if dueDate is in the past

        invoices.push({
          id: invId, number: invoiceNumber(), studentId: student.id, enrollmentId: null,
          items: [{ label: `${inst.label} — ${course.title}`, amount }],
          discount: null, lateFee: 0, tax: 0, gstPct: structure.gstPct || 0, total: amount,
          dueDate, issuedAt: enrolledAt, status: "issued", reminders: [],
        });
        invoiceIds.push(invId);
        for (const p of invPayments) {
          payments.push({ id: id("pay"), receiptNo: receiptNumber(), invoiceId: invId, studentId: student.id, amount: p.amount, method: pick(["upi", "card", "netbanking", "cash"]), reference: "SEED-" + receiptSeq, paidAt: p.paidAt, recordedBy: pick(["usr_admin_demo", "usr_accountant_demo"]), status: "success" });
        }
      }

      const enr = { id: id("enr"), studentId: student.id, batchId: batch.id, courseId: course.id, enrolledAt, status: "active", invoiceIds, completedAt: null, certificateNo: null, dropReason: null };
      enrollments.push(enr);
      invoices.filter((i) => invoiceIds.includes(i.id)).forEach((i) => (i.enrollmentId = enr.id));
    }
  }

  return { enrollments, invoices, payments };
}

/* ============================================================================
   ATTENDANCE (skips Sundays; holidays applied after events are built)
   ============================================================================ */

function buildAttendance(batches, slots, enrollments, holidayDates) {
  const sessions = [];
  const holidaySet = new Set(holidayDates);
  const weeksBack = 10;
  const startWindow = addDays(ANCHOR(), -weeksBack * 7);

  for (const batch of batches) {
    const batchSlots = slots.filter((s) => s.batchId === batch.id);
    const roster = enrollments.filter((e) => e.batchId === batch.id && e.status === "active").map((e) => e.studentId);
    if (!roster.length) continue;
    const from = batch.startDate > startWindow ? batch.startDate : startWindow;
    for (let d = from; d <= ANCHOR(); d = addDays(d, 1)) {
      if (weekday(d) === 0 || holidaySet.has(d)) continue; // Sunday or holiday
      const daySlots = batchSlots.filter((s) => s.weekday === weekday(d));
      for (const slot of daySlots) {
        const records = {};
        for (const studentId of roster) {
          const r = rnd();
          records[studentId] = r < 0.86 ? "P" : r < 0.93 ? "A" : r < 0.97 ? "L" : "E";
        }
        sessions.push({ id: id("att"), batchId: batch.id, slotId: slot.id, date: d, markedBy: slot.instructorId, markedAt: d + "T18:00:00.000Z", records });
      }
    }
  }
  return sessions;
}

/* ============================================================================
   ASSIGNMENTS + SUBMISSIONS
   ============================================================================ */

function buildAssignments(batches, courses, enrollments) {
  const assignments = [];
  const submissions = [];
  const titles = ["Module Review Worksheet", "Practical Lab Exercise", "Case Study Assignment", "Skills Application Task", "Weekly Practice Set"];

  for (const batch of batches) {
    const course = courses.find((c) => c.id === batch.courseId);
    const roster = enrollments.filter((e) => e.batchId === batch.id && e.status === "active").map((e) => e.studentId);
    if (!roster.length) continue;
    const teacherId = batch.instructorIds[0];
    const count = int(3, 5);
    for (let i = 0; i < count; i++) {
      // 11:59 pm local time on the due date (a "Z" suffix would make it 5:29 am the next day in India)
      const dueAt = combineISO(addDays(ANCHOR(), int(-21, 10)), "23:59");
      const isPast = dateOf(dueAt) < ANCHOR();
      const asg = {
        id: id("asg"), batchId: batch.id, courseId: course.id,
        title: `${pick(titles)} — ${course.syllabus[i % course.syllabus.length]?.title || "General"}`,
        description: "Complete the exercise and submit your work with any supporting files.",
        dueAt, maxMarks: pick([20, 25, 30, 50]), fileIds: [], allowLate: chance(0.6), status: "published", createdBy: teacherId,
      };
      assignments.push(asg);
      if (isPast) {
        for (const studentId of roster) {
          if (!chance(0.85)) continue; // some never submit
          const late = chance(0.12);
          const graded = chance(0.75);
          const marks = graded ? int(Math.round(asg.maxMarks * 0.5), asg.maxMarks) : null;
          submissions.push({
            id: id("sub"), assignmentId: asg.id, studentId,
            submittedAt: addDays(dateOf(asg.dueAt), late ? int(1, 3) : -int(0, 4)) + "T14:00:00.000Z",
            text: "Submitted as per the assignment instructions.", fileIds: [], late,
            status: graded ? "graded" : "submitted",
            marks, feedback: graded ? pick(["Good work, keep it up!", "Well structured, minor improvements needed.", "Excellent effort.", "Please review the core concepts once more."]) : "",
            gradedBy: graded ? teacherId : null, gradedAt: graded ? addDays(dateOf(asg.dueAt), int(2, 6)) + "T10:00:00.000Z" : null,
          });
        }
      }
    }
  }
  return { assignments, submissions };
}

/* ============================================================================
   EXAMS + MARKS
   ============================================================================ */

function buildExamsAndMarks(batches, courses, enrollments) {
  const exams = [];
  const marks = [];
  const cycles = [
    { cycle: "Mid-Term", offsetWeeks: -6, status: "published" },
    { cycle: "Term Final", offsetWeeks: -1, status: "published" },
    { cycle: "Upcoming Assessment", offsetWeeks: 3, status: "scheduled" },
  ];
  for (const batch of batches) {
    const course = courses.find((c) => c.id === batch.courseId);
    const roster = enrollments.filter((e) => e.batchId === batch.id && e.status === "active").map((e) => e.studentId);
    if (!roster.length) continue;
    for (const cyc of cycles) {
      const date = addDays(ANCHOR(), cyc.offsetWeeks * 7);
      if (date < batch.startDate) continue;
      const maxMarks = 100;
      const exam = {
        id: id("exm"), batchId: batch.id, courseId: course.id, cycle: cyc.cycle, title: `${cyc.cycle} — ${course.title}`,
        type: cyc.cycle === "Term Final" ? "final" : "internal", date, start: "10:00", end: "12:00", room: pick(ROOMS),
        maxMarks, passMarks: 35, weightage: cyc.cycle === "Term Final" ? 60 : 40,
        status: cyc.status, publishedAt: cyc.status === "published" ? date + "T16:00:00.000Z" : null,
      };
      exams.push(exam);
      if (cyc.status === "published") {
        for (const studentId of roster) {
          const absent = chance(0.04);
          marks.push({ id: id("mrk"), examId: exam.id, studentId, marks: absent ? null : int(30, 98), absent, remarks: "", enteredBy: batch.instructorIds[0], enteredAt: date + "T17:00:00.000Z" });
        }
      }
    }
  }
  return { exams, marks };
}

/* ============================================================================
   ANNOUNCEMENTS, EVENTS/HOLIDAYS, FORUM, THREADS
   ============================================================================ */

function buildEvents() {
  const anchor = ANCHOR();
  const year = Number(anchor.slice(0, 4));
  // Fixed-date national holidays; a couple of festival dates are marked "verify date" as they shift yearly.
  const fixedHolidays = [
    { title: "Republic Day", date: `${year}-01-26` },
    { title: "Independence Day", date: `${year}-08-15` },
    { title: "Gandhi Jayanti", date: `${year}-10-02` },
    { title: "Diwali (verify date)", date: `${year}-10-20` },
    { title: "Dussehra (verify date)", date: `${year}-10-02` },
    { title: "Christmas Day", date: `${year}-12-25` },
  ].filter((h) => h.date >= addMonths(anchor, -3) && h.date <= addMonths(anchor, 5));

  const events = fixedHolidays.map((h) => ({ id: id("evt"), title: h.title, type: "holiday", start: h.date, end: h.date, allDay: true, centerId: null, audience: { type: "all" }, description: "Academy closed." }));

  events.push(
    { id: id("evt"), title: "Document Verification Drive", type: "event", start: addDays(anchor, 4), end: addDays(anchor, 4), allDay: true, audience: { type: "all" }, description: "Bring original documents for verification at your center." },
    { id: id("evt"), title: "Career Guidance Workshop", type: "event", start: addDays(anchor, 10), end: addDays(anchor, 10), allDay: true, audience: { type: "all" }, description: "Guest session on career paths after certification." },
    { id: id("evt"), title: "Placement Drive — Partner Companies", type: "event", start: addDays(anchor, 18), end: addDays(anchor, 19), allDay: true, audience: { type: "all" }, description: "On-campus interviews with hiring partners." }
  );

  return events;
}

function holidayDatesFrom(events) {
  return events.filter((e) => e.type === "holiday").map((e) => e.start);
}

function buildAnnouncements(courses) {
  const anchor = ANCHOR();
  return [
    { id: id("ann"), title: "SAFAL Scholarship — 75% Fee Waiver", body: "Haryana Government is offering a 75% scholarship on course fees for eligible students under the SAFAL scheme. Apply through the Accounts office before the deadline.", audience: { type: "all" }, priority: "high", pinned: true, publishAt: addDays(anchor, -3), expiresAt: addDays(anchor, 25), channels: ["in-app", "sms"], createdBy: "usr_admin_demo", readBy: [] },
    { id: id("ann"), title: "New Batches Starting Soon", body: "Admissions are open for new batches across all centers. Enquire at the front office or through the website.", audience: { type: "all" }, priority: "normal", pinned: false, publishAt: addDays(anchor, -6), expiresAt: null, channels: ["in-app"], createdBy: "usr_admin_demo", readBy: [] },
    { id: id("ann"), title: "Web Design Batch — Extra Practical Lab", body: "An additional practical lab session has been scheduled for the Web Design & Development batch.", audience: { type: "course", ids: [courses.find((c) => c.code === "WEBDEV")?.id].filter(Boolean) }, priority: "normal", pinned: false, publishAt: addDays(anchor, -1), expiresAt: addDays(anchor, 14), channels: ["in-app"], createdBy: "usr_teacher_demo", readBy: [] },
    { id: id("ann"), title: "Fee Payment Reminder", body: "Students with pending installments are requested to clear dues at the earliest to avoid late fees.", audience: { type: "all" }, priority: "normal", pinned: false, publishAt: addDays(anchor, -8), expiresAt: addDays(anchor, 10), channels: ["in-app", "email"], createdBy: "usr_accountant_demo", readBy: [] },
  ];
}

function buildForum(courses) {
  const threads = [];
  const posts = [];
  const generalTopics = [
    { title: "Tips for the CCC practical exam?", body: "Has anyone taken the CCC practical yet? Any tips on what to expect?" },
    { title: "Best resources to practice typing", body: "Looking for good typing practice tools before the exam. Suggestions?" },
  ];
  for (const t of generalTopics) {
    const th = { id: id("ft"), scope: { type: "general" }, title: t.title, body: t.body, authorId: "usr_student_demo", tags: [], pinned: false, locked: false, hidden: false, solvedPostId: null, lastPostAt: ANCHOR() + "T09:00:00.000Z", views: int(10, 60) };
    threads.push(th);
    posts.push({ id: id("fp"), threadId: th.id, authorId: "usr_teacher_demo", body: "Great question! Focus on the practical modules covered in class and revise the sample question bank shared in Resources.", editedAt: null, hidden: false, likes: [], reports: [] });
  }
  const webdev = courses.find((c) => c.code === "WEBDEV");
  if (webdev) {
    const th = { id: id("ft"), scope: { type: "course", id: webdev.id }, title: "Sharing my portfolio project — feedback welcome!", body: "Just finished my portfolio site for the final project. Would love some feedback from classmates.", authorId: "usr_student_demo", tags: ["project"], pinned: true, locked: false, hidden: false, solvedPostId: null, lastPostAt: ANCHOR() + "T11:00:00.000Z", views: 22 };
    threads.push(th);
  }
  return { forumThreads: threads, forumPosts: posts };
}

function buildResources(courses, batches) {
  const files = [];
  const resources = [];
  // Real sample files shipped in src/assets/files/ (copied to dist by vite-plugin-static-copy)
  const sample = [
    { name: "Syllabus & Study Plan.pdf", kind: "pdf", mime: "application/pdf", asset: "assets/files/syllabus-sample.pdf" },
    { name: "Practice Question Bank.docx", kind: "doc", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", asset: "assets/files/practice-questions-sample.docx" },
    { name: "Orientation Slides.pdf", kind: "slides", mime: "application/pdf", asset: "assets/files/orientation-slides-sample.pdf" },
  ];
  for (const batch of batches) {
    const course = courses.find((c) => c.id === batch.courseId);
    for (const s of sample) {
      const fileId = id("file");
      files.push({ id: fileId, name: s.name, mime: s.mime, size: int(120000, 900000), ownerId: batch.instructorIds[0], storage: "asset", assetPath: s.asset, uploadedAt: ANCHOR() + "T08:00:00.000Z" });
      resources.push({ id: id("res"), courseId: course.id, batchId: batch.id, moduleId: course.syllabus[0]?.id || null, title: `${s.name.replace(/\.[^.]+$/, "")} — ${course.title}`, kind: s.kind, fileId, url: null, sizeBytes: files[files.length - 1].size, uploadedBy: batch.instructorIds[0], downloads: int(2, 40) });
    }
    resources.push({ id: id("res"), courseId: course.id, batchId: batch.id, moduleId: null, title: `${course.title} — Recorded Session`, kind: "video-link", fileId: null, url: "https://www.youtube.com/", sizeBytes: 0, uploadedBy: batch.instructorIds[0], downloads: int(5, 30) });
  }
  return { resources, files };
}

/* ============================================================================
   SETTINGS
   ============================================================================ */

function buildSettings(centers) {
  const anchor = ANCHOR();
  return {
    institution: {
      name: "OM Academy", tagline: "Learn · Grow · Succeed", address: centers[0].address, phone: centers[0].phone,
      email: "info@omacademy.in", gstin: "06AAAAA0000A1Z5", affiliations: ["NIELIT", "HKCL", "HARTRON", "UGC"],
    },
    academicYear: { start: `${Number(anchor.slice(0, 4)) - (anchor.slice(5, 7) < "04" ? 1 : 0)}-04-01`, end: `${Number(anchor.slice(0, 4)) + (anchor.slice(5, 7) < "04" ? 0 : 1)}-03-31` },
    attendance: { minPct: 75, leaveCounts: "excluded", editWindowDays: 3 },
    exams: { minAttendancePct: 60, requireFeesCleared: false },
    grading: {
      passPct: 35,
      scale: [
        { grade: "A+", min: 90, point: 10, label: "Outstanding" },
        { grade: "A", min: 80, point: 9, label: "Excellent" },
        { grade: "B+", min: 70, point: 8, label: "Very Good" },
        { grade: "B", min: 60, point: 7, label: "Good" },
        { grade: "C+", min: 50, point: 6, label: "Above Average" },
        { grade: "C", min: 35, point: 5, label: "Average" },
        { grade: "F", min: 0, point: 0, label: "Needs Improvement" },
      ],
    },
    fees: { currency: "INR", gstPct: 0, invoicePrefix: "OMA", receiptPrefix: "OMA/RCPT", reminderDaysBefore: [7, 3, 1], allowPartial: true },
    system: { sessionTimeoutMin: 60, maintenanceBanner: "", studentForumPosting: true, maxUploadKB: 2048, demoToday: null },
  };
}

/* ============================================================================
   BUILD
   ============================================================================ */

export function buildSeed() {
  reset();
  idCounters = {};
  usedEmails.clear();

  const centers = buildCenters();
  const courses = buildCourses();
  const feeStructures = buildFeeStructures(courses);
  courses.forEach((c) => (c.feeStructureId = feeStructures.find((f) => f.courseId === c.id)?.id || null));

  const staff = buildStaff(centers);
  const students = buildStudents(centers, 58);
  const users = [...staff, ...students];

  const { batches, slots } = buildBatchesAndSlots(courses, centers, staff);
  const { enrollments, invoices, payments } = buildEnrollmentsAndFinance(students, batches, feeStructures, courses);

  const events = buildEvents();
  const holidayDates = holidayDatesFrom(events);
  const attendanceSessions = buildAttendance(batches, slots, enrollments, holidayDates);
  const { assignments, submissions } = buildAssignments(batches, courses, enrollments);
  const { exams, marks } = buildExamsAndMarks(batches, courses, enrollments);
  const announcements = buildAnnouncements(courses);
  const { forumThreads, forumPosts } = buildForum(courses);
  const { resources, files } = buildResources(courses, batches);
  const settings = buildSettings(centers);

  const roles = DEFAULT_ROLES.map((r) => ({ ...r }));

  const meta = { app: "om-academy-portal", schemaVersion: 1, seedVersion: 1, seedAnchorDate: ANCHOR(), seededAt: new Date().toISOString() };
  const counters = { invoice: invoices.length, receipt: payments.length, rollNo: students.length, transcript: 0 };

  const invariantIssues = checkInvariants({ users, courses, batches, slots, enrollments, invoices, payments });
  if (invariantIssues.length && typeof console !== "undefined") {
    console.warn("[seed] invariant warnings:", invariantIssues);
  }

  return {
    meta, counters, roles, users, centers, courses, batches, timetableSlots: slots, enrollments,
    attendanceSessions, leaveRequests: [], assignments, submissions, exams, marks, transcripts: [],
    feeStructures, invoices, payments, announcements, notifications: [], threads: [], messages: [],
    forumThreads, forumPosts, resources, events, files, activity: [], deliveries: [], settings,
  };
}

function checkInvariants({ users, courses, batches, slots, enrollments, invoices, payments }) {
  const issues = [];
  const userIds = new Set(users.map((u) => u.id));
  const courseIds = new Set(courses.map((c) => c.id));
  const batchIds = new Set(batches.map((b) => b.id));
  for (const b of batches) if (!courseIds.has(b.courseId)) issues.push(`batch ${b.id} references missing course ${b.courseId}`);
  for (const s of slots) if (!batchIds.has(s.batchId)) issues.push(`slot ${s.id} references missing batch ${s.batchId}`);
  for (const e of enrollments) {
    if (!userIds.has(e.studentId)) issues.push(`enrollment ${e.id} references missing student ${e.studentId}`);
    if (!batchIds.has(e.batchId)) issues.push(`enrollment ${e.id} references missing batch ${e.batchId}`);
  }
  const invoiceIds = new Set(invoices.map((i) => i.id));
  for (const p of payments) if (!invoiceIds.has(p.invoiceId)) issues.push(`payment ${p.id} references missing invoice ${p.invoiceId}`);
  if (!users.some((u) => u.id === "usr_student_demo")) issues.push("demo student account missing");
  if (!users.some((u) => u.id === "usr_admin_demo")) issues.push("demo admin account missing");
  return issues;
}

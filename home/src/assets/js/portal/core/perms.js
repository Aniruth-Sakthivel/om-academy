/*
Author       : OM Academy
Description  : Permission catalogue, default roles and permission checks (role-based access control).
               Checks run in the browser, so this is a demo of RBAC, not a security boundary.
*/

// Grouped for the permission matrix (Admin → Users → Roles & permissions)
export const PERMISSION_GROUPS = [
  { module: "Dashboard", perms: [["dashboard.view", "View dashboard"]] },
  {
    module: "Users",
    perms: [
      ["students.view", "View students"],
      ["students.manage", "Add & edit students"],
      ["staff.view", "View staff"],
      ["staff.manage", "Add & edit staff"],
      ["roles.manage", "Manage roles & permissions"],
    ],
  },
  {
    module: "Courses",
    perms: [
      ["courses.view", "View courses & batches"],
      ["courses.manage", "Create & edit courses"],
      ["batches.manage", "Manage batches & timetable"],
      ["enrollments.manage", "Enrol, transfer & drop students"],
      ["resources.manage", "Upload course resources"],
    ],
  },
  {
    module: "Academics",
    perms: [
      ["attendance.view", "View attendance"],
      ["attendance.mark", "Mark attendance"],
      ["leave.review", "Approve leave requests"],
      ["assignments.manage", "Create assignments"],
      ["assignments.grade", "Grade submissions"],
      ["exams.manage", "Schedule exams"],
      ["marks.enter", "Enter marks"],
      ["results.publish", "Publish results"],
      ["transcripts.issue", "Issue transcripts"],
    ],
  },
  {
    module: "Fees",
    perms: [
      ["fees.view", "View fees & payments"],
      ["feeStructures.manage", "Manage fee structures"],
      ["invoices.manage", "Create & cancel invoices"],
      ["payments.record", "Record offline payments"],
      ["fees.remind", "Send fee reminders"],
      ["fees.waive", "Give discounts & waivers"],
    ],
  },
  {
    module: "Reports",
    perms: [
      ["reports.attendance", "Attendance reports"],
      ["reports.performance", "Performance reports"],
      ["reports.financial", "Financial reports"],
      ["reports.export", "Export reports"],
    ],
  },
  {
    module: "Communication",
    perms: [
      ["announcements.manage", "Post announcements"],
      ["notifications.send", "Send direct notifications"],
      ["messages.reply", "Reply to messages"],
      ["forum.moderate", "Moderate forums"],
    ],
  },
  {
    module: "Settings",
    perms: [
      ["settings.manage", "Institution & system settings"],
      ["calendar.manage", "Academic calendar & holidays"],
      ["centers.manage", "Manage centers"],
      ["data.manage", "Export, import & reset data"],
      ["activity.view", "View activity log"],
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.perms.map(([key]) => key));
export const PERMISSION_LABELS = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.perms));

export const DEFAULT_ROLES = [
  {
    id: "admin",
    name: "Administrator",
    description: "Full access to every module.",
    permissions: ["*"],
    scope: "all",
    portal: "staff",
    system: true,
    locked: true,
  },
  {
    id: "teacher",
    name: "Teacher",
    description: "Teaches assigned batches: attendance, assignments, marks and communication.",
    permissions: [
      "dashboard.view", "students.view", "courses.view", "resources.manage",
      "attendance.view", "attendance.mark", "leave.review",
      "assignments.manage", "assignments.grade", "marks.enter",
      "reports.attendance", "reports.performance",
      "announcements.manage", "messages.reply", "forum.moderate",
    ],
    scope: "assigned",
    portal: "staff",
    system: true,
    locked: false,
  },
  {
    id: "accountant",
    name: "Accountant",
    description: "Fees, invoices, payments and financial reports.",
    permissions: [
      "dashboard.view", "students.view",
      "fees.view", "feeStructures.manage", "invoices.manage", "payments.record", "fees.remind", "fees.waive",
      "reports.financial", "reports.export", "messages.reply",
    ],
    scope: "all",
    portal: "staff",
    system: true,
    locked: false,
  },
  {
    id: "student",
    name: "Student",
    description: "Student portal only.",
    permissions: [],
    scope: "self",
    portal: "student",
    system: true,
    locked: true,
  },
];

// Does the role grant perm? Supports "*" and "<module>.*" wildcards.
export function roleHas(role, perm) {
  if (!role || !perm) return false;
  const list = role.permissions || [];
  if (list.includes("*") || list.includes(perm)) return true;
  const mod = perm.split(".")[0];
  return list.includes(mod + ".*");
}

// True when perms is empty or the role has at least one of them
export function roleHasAny(role, perms) {
  if (!perms || (Array.isArray(perms) && !perms.length)) return true;
  const list = Array.isArray(perms) ? perms : [perms];
  return list.some((p) => roleHas(role, p));
}

// Session slot used by a role: students sign in to the student portal, everyone else to the staff (admin) portal
export const portalForRole = (roleId) => (roleId === "student" ? "student" : "staff");

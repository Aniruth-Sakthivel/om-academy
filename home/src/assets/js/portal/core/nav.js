/*
Author       : OM Academy
Description  : Sidebar definitions — the single source for portal navigation.
               { page, label, icon (Lucide export name), anyOf (admin permissions), badge (selector key) }.
               The shell renders these, hides items the signed-in role can't open, and fills the badges.
*/

export const STUDENT_NAV = [
  {
    title: "Main",
    items: [{ page: "student-dashboard", label: "Dashboard", icon: "LayoutDashboard" }],
  },
  {
    title: "Learning",
    items: [
      { page: "student-courses", label: "Courses & Schedule", icon: "BookOpen" },
      { page: "student-assignments", label: "Assignments", icon: "ClipboardList", badge: "pendingAssignments" },
      { page: "student-attendance", label: "Attendance", icon: "CalendarCheck" },
      { page: "student-exams", label: "Exams & Results", icon: "GraduationCap" },
      { page: "student-progress", label: "Progress Reports", icon: "ChartLine" },
    ],
  },
  {
    title: "Campus",
    items: [
      { page: "student-resources", label: "Resources", icon: "FolderOpen" },
      { page: "student-forum", label: "Discussion Forum", icon: "MessagesSquare" },
      { page: "student-calendar", label: "Event Calendar", icon: "CalendarDays" },
    ],
  },
  {
    title: "Account",
    items: [
      { page: "student-fees", label: "Fees & Payments", icon: "Wallet", badge: "feesDue" },
      { page: "student-notifications", label: "Notifications", icon: "Bell", badge: "unread" },
      { page: "student-profile", label: "Profile & Settings", icon: "UserRound" },
    ],
  },
];

export const ADMIN_NAV = [
  {
    title: "Main",
    items: [{ page: "admin-dashboard", label: "Dashboard", icon: "LayoutDashboard", anyOf: ["dashboard.view"] }],
  },
  {
    title: "Management",
    items: [
      { page: "admin-users", label: "User Management", icon: "Users", anyOf: ["students.view", "staff.view", "roles.manage"] },
      { page: "admin-courses", label: "Course Management", icon: "BookOpen", anyOf: ["courses.view"] },
      {
        page: "admin-academics",
        label: "Academics",
        icon: "GraduationCap",
        anyOf: ["attendance.view", "attendance.mark", "leave.review", "assignments.manage", "assignments.grade", "exams.manage", "marks.enter", "results.publish", "transcripts.issue"],
        badge: "academicsPending",
      },
      { page: "admin-fees", label: "Fees & Payments", icon: "Wallet", anyOf: ["fees.view"], badge: "overdueInvoices" },
    ],
  },
  {
    title: "Insights",
    items: [{ page: "admin-reports", label: "Reports", icon: "ChartColumn", anyOf: ["reports.attendance", "reports.performance", "reports.financial"] }],
  },
  {
    title: "Engage",
    items: [
      { page: "admin-communication", label: "Communication", icon: "Megaphone", anyOf: ["announcements.manage", "notifications.send", "messages.reply", "forum.moderate"], badge: "inboxUnread" },
    ],
  },
  {
    title: "System",
    items: [{ page: "admin-settings", label: "Settings", icon: "Settings", anyOf: ["settings.manage", "calendar.manage", "centers.manage", "data.manage", "activity.view"] }],
  },
];

export const navFor = (portal) => (portal === "student" ? STUDENT_NAV : ADMIN_NAV);

// page id → nav item (label, icon, anyOf), for titles, breadcrumbs, guards and search
export const NAV_ITEMS = Object.fromEntries([...STUDENT_NAV, ...ADMIN_NAV].flatMap((g) => g.items.map((i) => [i.page, { ...i, group: g.title }])));

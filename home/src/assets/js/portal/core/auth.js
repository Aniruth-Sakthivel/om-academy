/*
Author       : OM Academy
Description  : Sign-in and sessions. Each portal has its own session slot (om-portal:session:student and
               om-portal:session:staff), so an admin tab and a student tab can stay signed in side by side.
               Demo only: passwords are stored in plain text in the browser.
*/

import * as store from "./store.js";
import { portalForRole, roleHas, roleHasAny } from "./perms.js";
import { nowISO } from "./clock.js";

export const DEMO_ACCOUNTS = [
  { role: "student", label: "Student", email: "student@omacademy.in", password: "student123", hint: "Aarav Verma — CCC & Web Design" },
  { role: "admin", label: "Administrator", email: "admin@omacademy.in", password: "admin123", hint: "Full access" },
  { role: "teacher", label: "Teacher", email: "teacher@omacademy.in", password: "teacher123", hint: "Priya Malik — own batches only" },
  { role: "accountant", label: "Accountant", email: "accounts@omacademy.in", password: "accounts123", hint: "Fees & financial reports" },
];

// Page portal ("student" | "admin") → session slot ("student" | "staff")
export const slotFor = (portal) => (portal === "student" ? "student" : "staff");
const slotKey = (slot) => "session:" + slot;

export function currentUser(portal) {
  const slot = slotFor(portal);
  const session = store.getKey(slotKey(slot));
  if (!session || !session.userId) return null;
  const user = store.byId("users", session.userId);
  if (!user || portalForRole(user.role) !== slot) return null;
  return user;
}

export const roleOf = (user) => (user ? store.byId("roles", user.role) : null);
export const can = (user, perm) => !!user && roleHas(roleOf(user), perm);
export const canAny = (user, perms) => !!user && roleHasAny(roleOf(user), perms);

export const dashboardFor = (user) => (user && user.role === "student" ? "student-dashboard.html" : "admin-dashboard.html");

export function startSession(user) {
  const slot = portalForRole(user.role);
  store.setKey(slotKey(slot), { userId: user.id, at: nowISO() });
  return slot;
}

export function endSession(portal) {
  store.setKey(slotKey(slotFor(portal)), null);
}

// Validate credentials; returns the user. Throws with a message for the login form.
export function verifyCredentials(email, password) {
  const needle = String(email || "").trim().toLowerCase();
  const user = store.get("users").find((u) => (u.email || "").toLowerCase() === needle);
  if (!user || user.password !== password) throw new Error("Incorrect email or password.");
  if (user.status !== "active") throw new Error("This account has been deactivated. Please contact the academy office.");
  return user;
}

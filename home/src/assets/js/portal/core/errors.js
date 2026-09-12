/*
Author       : OM Academy
Description  : Error handling for every portal page.
  - run(fn, { success, error }) wraps a service call: shows a success toast, or a clear error toast, never throws.
  - friendlyMessage(err) turns technical errors (permission, storage quota, network) into plain language.
  - installGlobalHandlers() catches anything that slips through (uncaught errors, rejected promises, storage full)
    and shows a toast instead of failing silently.
*/

import { toast } from "./ui.js";
import * as store from "./store.js";

export function friendlyMessage(err) {
  const msg = (err && (err.message || String(err))) || "";
  if (/Missing permission/i.test(msg)) return "You don't have permission to do that. Ask an administrator for access.";
  if (/storage is full|quota/i.test(msg)) return "Browser storage is full. Export your demo data from Settings, then reset it.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Couldn't load a file. Check your connection and try again.";
  if (/Record not found/i.test(msg)) return "That record no longer exists — it may have been removed in another tab.";
  return msg || "Something went wrong. Please try again.";
}

/** await run(() => services.x(...), { success: "Saved" }) → result, or null on failure (error already shown) */
export async function run(fn, { success, error } = {}) {
  try {
    const result = await fn();
    if (success) toast(typeof success === "function" ? success(result) : success, { type: "success" });
    return result;
  } catch (err) {
    console.error(err);
    toast(error ? `${error}: ${friendlyMessage(err)}` : friendlyMessage(err), { type: "danger", duration: 6000 });
    return null;
  }
}

let installed = false;

export function installGlobalHandlers() {
  if (installed) return;
  installed = true;
  window.addEventListener("unhandledrejection", (e) => {
    console.error(e.reason);
    toast(friendlyMessage(e.reason), { type: "danger", duration: 6000 });
  });
  window.addEventListener("error", (e) => {
    if (!e.error) return; // resource load errors etc.
    toast(friendlyMessage(e.error), { type: "danger", duration: 6000 });
  });
  store.onError(() => toast(friendlyMessage(new Error("storage is full")), { type: "danger", duration: 8000 }));
  if (!store.isPersistent) {
    toast("Browser storage is unavailable (private mode?). Changes won't be saved after you close this tab.", { type: "warning", duration: 9000 });
  }
}

/*
Author       : OM Academy
Description  : Page boot contract. Every portal page module calls boot({...}) once. This module:
                 - waits for the store to be ready (seeding on first run),
                 - resolves the signed-in user for the page's portal and enforces the RBAC guard,
                 - renders the sidebar (nav.js) and topbar chrome shared by every page,
                 - wires theme toggle, search, notifications, profile menu, mobile drawer,
                 - re-renders live: same-tab writes, other-tab writes (storage event) and permission-relevant changes,
                 - reads/writes the ?tab=&id= URL contract and hands page modules a small ctx object.
*/

import * as store from "./store.js";
import * as authApi from "./auth.js";
import { can, canAny } from "./auth.js";
import { roleHas } from "./perms.js";
import { navFor, NAV_ITEMS } from "./nav.js";
import * as selectors from "./selectors.js";
import * as services from "./services.js";
import { icon } from "./icons.js";
import { html, raw, esc, on, qs, qsa, initDropdowns, toast, tabs as wireTabs, setSearchParam, getSearchParam, avatar, mount } from "./ui.js";
import * as clock from "./clock.js";
import { updateTheme as retintCharts } from "./charts.js";

const THEME_KEY = "theme";

function readTheme(user) {
  try {
    const stored = localStorage.getItem("om-portal:" + THEME_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return user?.prefs?.theme || "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("om-portal:" + THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("om-portal:theme", { detail: theme }));
  retintCharts();
}

function sidebarHtml(portal, user, activePage, badges) {
  const groups = navFor(portal);
  const role = authApi.roleOf(user);
  return groups
    .map((group) => {
      const items = group.items.filter((item) => canAny(user, item.anyOf));
      if (!items.length) return "";
      return html`
        <li class="menu-title"><span>${group.title}</span></li>
        ${raw(
          items
            .map((item) => {
              const active = item.page === activePage;
              const badgeVal = item.badge ? badges[item.badge] : null;
              return html`
              <li>
                <a href="${item.page}.html" class="nav-link ${raw(active ? "active" : "")}" ${raw(active ? 'aria-current="page"' : "")}>
                  <span class="nav-ico">${raw(icon(item.icon, { size: 18, strokeWidth: 1.9 }))}</span>
                  <span class="nav-label">${item.label}</span>
                  ${badgeVal ? html`<span class="nav-badge">${badgeVal}</span>` : raw("")}
                </a>
              </li>`;
            })
            .join("")
        )}`;
    })
    .join("") + (role?.scope === "assigned" ? html`<li class="sidebar-scope-note">Showing your assigned batches only</li>` : "");
}

function chromeHtml({ portal, user, activePage }) {
  const brandHref = authApi.dashboardFor(user);
  return html`
    <a href="#main" class="skip-link">Skip to main content</a>
    <div class="portal-shell">
      <div class="nav-backdrop" data-nav-backdrop hidden></div>
      <aside class="sidebar" id="sidebar" data-sidebar>
        <div class="sidebar-logo">
          <a href="${brandHref}" class="brand-mark-link">
            <span class="brand-mark">OM</span>
            <span class="brand-text"><span class="brand-name">OM Academy</span><span class="brand-tag">${raw(portal === "student" ? "Student Portal" : "Staff Portal")}</span></span>
          </a>
          <button type="button" class="sidebar-close" data-sidebar-close aria-label="Close menu">${raw(icon("X", { size: 18 }))}</button>
        </div>
        <div class="sidebar-inner">
          <ul class="sidebar-menu" data-sidebar-menu role="menu" aria-label="Main navigation"></ul>
        </div>
        <button type="button" class="sidebar-mini-toggle" data-mini-toggle aria-label="Collapse menu">${raw(icon("PanelLeftClose", { size: 16 }))}</button>
      </aside>

      <div class="page-wrapper">
        <header class="topbar">
          <div class="topbar-inner">
            <div class="topbar-left">
              <button type="button" class="topbar-icon-btn mobile-only" data-mobile-toggle aria-label="Open menu">${raw(icon("Menu", { size: 20 }))}</button>
              <button type="button" class="topbar-search" data-search-open>
                ${raw(icon("Search", { size: 15 }))}<span>Search students, courses…</span>
              </button>
            </div>
            <div class="topbar-right">
              <button type="button" class="topbar-icon-btn" data-theme-toggle aria-label="Toggle dark mode">${raw(icon("Moon", { size: 18, cls: "icon-moon" }))}${raw(icon("Sun", { size: 18, cls: "icon-sun" }))}</button>
              <div class="dropdown dropdown-end" data-notif-dropdown>
                <button type="button" class="topbar-icon-btn" data-dropdown-toggle aria-haspopup="menu" aria-expanded="false" aria-label="Notifications">
                  ${raw(icon("Bell", { size: 18 }))}<span class="topbar-dot" data-notif-dot hidden></span>
                </button>
                <div class="dropdown-menu dropdown-menu-lg" data-dropdown-menu role="menu"></div>
              </div>
              <a class="topbar-icon-btn" href="${raw(portal === "student" ? "student-notifications.html?tab=messages" : "admin-communication.html?tab=inbox")}" aria-label="Messages">${raw(icon("MessageSquare", { size: 18 }))}</a>
              <div class="dropdown dropdown-end" data-profile-dropdown>
                <button type="button" class="profile-toggle" data-dropdown-toggle aria-haspopup="menu" aria-expanded="false">
                  ${raw(avatar({ name: user.name, size: "sm" }))}
                </button>
                <div class="dropdown-menu dropdown-menu-lg" data-dropdown-menu role="menu">
                  <div class="profile-card">${raw(avatar({ name: user.name, size: "md" }))}<div><div class="profile-name">${user.name}</div><div class="profile-role">${authApi.roleOf(user)?.name || user.role}</div></div></div>
                  <div class="dropdown-sep"></div>
                  <a class="dropdown-item" href="${raw(portal === "student" ? "student-profile.html" : "admin-settings.html")}">${raw(icon("UserRound", { size: 14 }))}Profile</a>
                  <button type="button" class="dropdown-item" data-switch-account>${raw(icon("RefreshCw", { size: 14 }))}Switch demo account</button>
                  <div class="dropdown-sep"></div>
                  <button type="button" class="dropdown-item is-danger" data-logout>${raw(icon("LogOut", { size: 14 }))}Log out</button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main id="main" tabindex="-1" data-page-main></main>
        <footer class="portal-footer"><p>© ${new Date().getFullYear()} OM Academy. Portal demo — no real payments are processed.</p></footer>
      </div>
    </div>
    <div class="search-overlay" data-search-overlay hidden>
      <div class="search-panel">
        <div class="search-input-row">${raw(icon("Search", { size: 18 }))}<input type="search" class="search-input" placeholder="Search…" data-search-input><button type="button" class="topbar-icon-btn" data-search-close>${raw(icon("X", { size: 18 }))}</button></div>
        <div class="search-results" data-search-results></div>
      </div>
    </div>
    <div id="access-denied-tpl" hidden>
      <div class="access-denied">
        <div class="access-denied-icon">${raw(icon("ShieldCheck", { size: 28 }))}</div>
        <h2>You don't have access to this page</h2>
        <p>Ask an administrator for the ${activePage ? esc(NAV_ITEMS[activePage]?.label || "") : ""} permission, or go back to your dashboard.</p>
        <a class="btn btn-primary" href="${raw(brandHref)}">Go to dashboard</a>
      </div>
    </div>
  `;
}

function renderNotifDropdown(portal, user) {
  const menu = qs('[data-notif-dropdown] [data-dropdown-menu]');
  const dot = qs("[data-notif-dot]");
  if (!menu) return;
  const feed = selectors.unifiedFeed(user).slice(0, 8);
  const unread = feed.filter((n) => !n.readAt).length;
  dot.hidden = !selectors.unreadCount(user);
  menu.innerHTML = html`
    <div class="notif-head">
      <span>Notifications</span>
      ${unread ? html`<button type="button" class="link-btn" data-mark-all-read">Mark all as read</button>` : raw("")}
    </div>
    <div class="notif-list">
      ${feed.length ? raw(feed.map((n) => html`
        <a href="${raw(n.link || (portal === "student" ? "student-notifications.html" : "admin-communication.html"))}" class="notif-item ${raw(n.readAt ? "" : "is-unread")}" data-notif-id="${n.id}">
          <span class="notif-dot"></span>
          <span><span class="notif-title">${n.title}</span><span class="notif-time">${raw(icon("Clock", { size: 11 }))}${esc(relTime(n.createdAt))}</span></span>
        </a>`).join("")) : raw(`<div class="notif-empty">You're all caught up.</div>`)}
    </div>
    <a class="notif-footer" href="${raw(portal === "student" ? "student-notifications.html" : "admin-communication.html")}">View all notifications</a>
  `;
}

function relTime(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

function wireChrome({ portal, user }) {
  const root = document;
  const drawerOpen = (open) => {
    qs("[data-sidebar]").classList.toggle("is-open", open);
    qs("[data-nav-backdrop]").hidden = !open;
    document.body.classList.toggle("no-scroll", open);
  };
  on(root, "click", "[data-mobile-toggle]", () => drawerOpen(true));
  on(root, "click", "[data-sidebar-close]", () => drawerOpen(false));
  on(root, "click", "[data-nav-backdrop]", () => drawerOpen(false));
  on(root, "click", "[data-mini-toggle]", () => {
    const mini = document.body.classList.toggle("mini-sidebar");
    try {
      localStorage.setItem("om-portal:ui:mini", mini ? "1" : "0");
    } catch {
      /* ignore */
    }
  });

  on(root, "click", "[data-theme-toggle]", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  on(root, "click", "[data-search-open]", () => {
    qs("[data-search-overlay]").hidden = false;
    document.body.classList.add("no-scroll");
    setTimeout(() => qs("[data-search-input]")?.focus(), 30);
  });
  const closeSearch = () => {
    qs("[data-search-overlay]").hidden = true;
    document.body.classList.remove("no-scroll");
  };
  on(root, "click", "[data-search-close]", closeSearch);
  on(root, "click", "[data-search-overlay]", (e) => e.target.matches("[data-search-overlay]") && closeSearch());
  on(root, "input", "[data-search-input]", (e, input) => renderSearch(portal, user, input.value));

  on(root, "click", "[data-mark-all-read]", async (e) => {
    e.preventDefault();
    await services.markAllRead(user);
    renderNotifDropdown(portal, user);
  });

  on(root, "click", "[data-logout]", () => {
    authApi.endSession(portal);
    window.location.href = "login.html";
  });
  on(root, "click", "[data-switch-account]", () => {
    authApi.endSession(portal);
    window.location.href = "login.html?portal=" + portal;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!qs("[data-search-overlay]").hidden) closeSearch();
      if (qs("[data-sidebar]").classList.contains("is-open")) drawerOpen(false);
    }
  });
}

function renderSearch(portal, user, query) {
  const box = qs("[data-search-results]");
  const needle = query.trim().toLowerCase();
  if (!needle) {
    box.innerHTML = "";
    return;
  }
  const results = [];
  if (portal === "admin" && can(user, "students.view")) {
    store.where("users", (u) => u.role === "student" && u.name.toLowerCase().includes(needle)).slice(0, 5).forEach((u) => results.push({ label: u.name, sub: u.rollNo, href: "admin-users.html?tab=students&id=" + u.id, icon: "UserRound" }));
  }
  if (can(user, "courses.view") || portal === "student") {
    store.where("courses", (c) => c.title.toLowerCase().includes(needle)).slice(0, 5).forEach((c) => results.push({ label: c.title, sub: c.code, href: (portal === "student" ? "student-courses.html" : "admin-courses.html") + "?id=" + c.id, icon: "BookOpen" }));
  }
  const pages = Object.entries(NAV_ITEMS).filter(([page, item]) => item.label.toLowerCase().includes(needle) && page.startsWith(portal === "student" ? "student" : "admin"));
  pages.forEach(([page, item]) => results.push({ label: item.label, sub: "Page", href: page + ".html", icon: item.icon }));

  box.innerHTML = results.length
    ? results.slice(0, 10).map((r) => html`<a class="search-result" href="${r.href}">${raw(icon(r.icon, { size: 16 }))}<span><span class="search-result-label">${r.label}</span>${r.sub ? html`<span class="search-result-sub">${r.sub}</span>` : raw("")}</span></a>`).join("")
    : `<div class="notif-empty">No results for "${esc(query)}"</div>`;
}

/* ---------- boot ---------- */

let currentUnmount = null;

/**
 * boot({ id, portal, perm, tabs, watch, mount(ctx), update(changed), unmount() })
 * perm: array of admin permissions (any one grants access) — omit for pages open to any signed-in role in the portal.
 */
export function boot(def) {
  document.body.classList.add("is-booting");
  document.body.dataset.page = def.id;
  document.body.dataset.portal = def.portal;

  store.init().then(async () => {
    const user = authApi.currentUser(def.portal);
    if (!user) {
      window.location.href = "login.html?portal=" + def.portal + "&next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
      return;
    }
    if (def.portal === "student" && user.role !== "student") {
      window.location.href = "admin-dashboard.html";
      return;
    }
    if (def.portal !== "student" && user.role === "student") {
      window.location.href = "student-dashboard.html";
      return;
    }
    const allowed = !def.perm || def.perm.length === 0 || canAny(user, def.perm);

    applyTheme(readTheme(user));
    document.body.innerHTML = chromeHtml({ portal: def.portal, user, activePage: def.id });
    const badges = selectors.navBadges(user);
    qs("[data-sidebar-menu]").innerHTML = sidebarHtml(def.portal, user, def.id, badges);
    initDropdowns(document);
    renderNotifDropdown(def.portal, user);
    wireChrome({ portal: def.portal, user });
    try {
      if (localStorage.getItem("om-portal:ui:mini") === "1") document.body.classList.add("mini-sidebar");
    } catch {
      /* ignore */
    }

    const main = qs("[data-page-main]");

    if (!allowed) {
      main.innerHTML = qs("#access-denied-tpl").innerHTML;
      document.body.classList.remove("is-booting");
      return;
    }

    const ctx = {
      root: main,
      user,
      can: (perm) => can(user, perm),
      params: new URLSearchParams(location.search),
      tab: getSearchParam("tab"),
      setTab: (id) => setSearchParam("tab", id),
      services,
      selectors,
      ui: { html, raw, esc, on, qs, qsa, toast, tabs: wireTabs, mount },
      clock,
    };

    def.mount?.(ctx);
    document.body.classList.remove("is-booting");

    const unwatch = def.watch?.length
      ? store.subscribe((changed) => {
          if (def.watch.some((name) => changed.has(name))) {
            renderNotifDropdown(def.portal, user);
            qs("[data-sidebar-menu]").innerHTML = sidebarHtml(def.portal, user, def.id, selectors.navBadges(user));
            def.update?.(changed);
          }
        })
      : store.subscribe(() => {
          renderNotifDropdown(def.portal, user);
        });

    // The staff session slot could be replaced by a different account signing in from another tab.
    const authWatch = store.subscribe((changed) => {
      if (changed.has("session:" + (def.portal === "student" ? "student" : "staff"))) {
        const still = authApi.currentUser(def.portal);
        if (!still) {
          toast("You've been signed out.", { type: "info" });
          setTimeout(() => (window.location.href = "login.html"), 900);
        } else if (still.id !== user.id) {
          window.location.reload();
        } else if (still.status !== "active") {
          toast("This account has been deactivated.", { type: "danger" });
          setTimeout(() => (window.location.href = "login.html"), 1200);
        }
      }
    });

    currentUnmount = () => {
      unwatch();
      authWatch();
      def.unmount?.();
    };
    window.addEventListener("beforeunload", currentUnmount, { once: true });
  });
}

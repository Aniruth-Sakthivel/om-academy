/*
Author       : OM Academy
Description  : Shared UI toolkit for every portal page: templating, modals, drawers, toasts, tabs, data tables,
               forms and small helpers (badges, avatars, stat cards, empty states, CSV/print). This file's public
               API is frozen for the "full working demo" build — page modules only call these, they don't reinvent
               modals or tables locally, so the 21 pages stay one system.
*/

import { icon } from "./icons.js";

/* ---------- escaping & templating ---------- */

export function esc(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// A value wrapped with raw() is inserted unescaped by html`...` — use only for output of html`` itself or icon().
class Raw {
  constructor(value) {
    this.value = value instanceof Raw ? value.value : String(value);
  }
  toString() {
    return this.value;
  }
  valueOf() {
    return this.value;
  }
}
export const raw = (value) => new Raw(value == null ? "" : value);
export const isRaw = (value) => value instanceof Raw;

// Tagged template: interpolations are HTML-escaped by default; arrays are joined; raw()/icon-string via raw().
// Returns a Raw value, so an html`` result nested inside another html`` is inserted as markup, not escaped.
// Raw stringifies automatically (innerHTML =, template literals, .join("")).
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v instanceof Raw) out += v.value;
    else if (Array.isArray(v)) out += v.map((item) => (item instanceof Raw ? item.value : esc(item))).join("");
    else if (v === false || v === null || v === undefined) out += "";
    else out += esc(v);
    out += strings[i + 1];
  }
  return new Raw(out);
}

export const cls = (...names) => names.filter(Boolean).join(" ");

/* ---------- DOM helpers ---------- */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function mount(root, htmlString) {
  root.innerHTML = String(htmlString);
  return root;
}

// Delegated listener; returns an unsubscribe function.
export function on(root, evt, selector, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(evt, listener);
  return () => root.removeEventListener(evt, listener);
}

export function el(htmlString) {
  const t = document.createElement("template");
  t.innerHTML = String(htmlString).trim();
  return t.content.firstElementChild;
}

/* ---------- overlay stack (shared body scroll lock) ---------- */

const openOverlays = new Set();

function lockScroll(id) {
  openOverlays.add(id);
  document.body.classList.add("no-scroll");
}
function unlockScroll(id) {
  openOverlays.delete(id);
  if (!openOverlays.size) document.body.classList.remove("no-scroll");
}

const escHandlers = [];
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && escHandlers.length) escHandlers[escHandlers.length - 1]();
});

/* ---------- toast ---------- */

let toastStack;
function toastRoot() {
  if (!toastStack || !toastStack.isConnected) {
    toastStack = el(`<div class="toast-stack" aria-live="polite" aria-atomic="false"></div>`);
    document.body.appendChild(toastStack);
  }
  return toastStack;
}

const TOAST_ICON = { success: "CircleCheck", danger: "CircleX", warning: "TriangleAlert", info: "Info" };

/** toast("Invoice created", { type: "success" }) — type: success|danger|warning|info (default info) */
export function toast(message, { type = "info", duration = 3800 } = {}) {
  const root = toastRoot();
  const node = el(html`
    <div class="toast tone-${type === "danger" ? "rust" : type === "success" ? "green" : type === "warning" ? "amber" : "blue"}" role="status">
      <span class="toast-icon">${raw(icon(TOAST_ICON[type] || "Info", { size: 18 }))}</span>
      <span class="toast-msg">${message}</span>
      <button type="button" class="toast-close" aria-label="Dismiss">${raw(icon("X", { size: 14 }))}</button>
    </div>
  `);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("is-in"));
  let timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    node.classList.remove("is-in");
    node.addEventListener("transitionend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 400);
  }
  node.querySelector(".toast-close").addEventListener("click", dismiss);
  node.addEventListener("mouseenter", () => clearTimeout(timer));
  node.addEventListener("mouseleave", () => (timer = setTimeout(dismiss, 1200)));
  return dismiss;
}

/* ---------- confirm ---------- */

/** confirm({ title, message, confirmLabel, danger }) → Promise<boolean> */
export function confirm({ title = "Are you sure?", message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlayId = Symbol("confirm");
    const node = el(html`
      <div class="modal-overlay" role="presentation">
        <div class="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="modal-body confirm-body">
            <div class="confirm-icon ${danger ? "tone-rust" : "tone-blue"}">${raw(icon(danger ? "TriangleAlert" : "CircleAlert", { size: 22 }))}</div>
            <h3 id="confirm-title" class="confirm-title">${title}</h3>
            ${message ? html`<p class="confirm-text">${message}</p>` : raw("")}
          </div>
          <div class="modal-footer confirm-footer">
            <button type="button" class="btn btn-outline" data-act="cancel">${cancelLabel}</button>
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="confirm">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(node);
    lockScroll(overlayId);
    const close = (result) => {
      unlockScroll(overlayId);
      escHandlers.pop();
      node.classList.remove("is-in");
      setTimeout(() => node.remove(), 200);
      resolve(result);
    };
    escHandlers.push(() => close(false));
    node.addEventListener("click", (e) => {
      if (e.target === node) close(false);
      const act = e.target.closest("[data-act]");
      if (act) close(act.dataset.act === "confirm");
    });
    requestAnimationFrame(() => {
      node.classList.add("is-in");
      node.querySelector('[data-act="confirm"]').focus();
    });
  });
}

/* ---------- modal ---------- */

/**
 * modal.open({ title, body, footer, size, onOpen, onClose }) → { root, close }
 * body/footer are HTML strings (use html``). size: "sm" | "md" (default) | "lg".
 */
function openModal({ title, body, footer, size = "md", closeOnBackdrop = true, labelledBy } = {}) {
  const overlayId = Symbol("modal");
  const titleId = labelledBy || "modal-title-" + Math.random().toString(36).slice(2, 8);
  const node = el(html`
    <div class="modal-overlay" role="presentation">
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h3 id="${titleId}" class="modal-title">${title}</h3>
          <button type="button" class="modal-close" data-modal-close aria-label="Close">${raw(icon("X", { size: 16 }))}</button>
        </div>
        <div class="modal-body">${raw(body)}</div>
        ${footer ? html`<div class="modal-footer">${raw(footer)}</div>` : raw("")}
      </div>
    </div>
  `);
  document.body.appendChild(node);
  lockScroll(overlayId);
  const bodyEl = node.querySelector(".modal-body");
  const modalEl = node.querySelector(".modal");

  function close() {
    unlockScroll(overlayId);
    escHandlers.pop();
    node.classList.remove("is-in");
    modalEl.addEventListener("transitionend", () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 250);
  }
  escHandlers.push(close);
  node.querySelector("[data-modal-close]").addEventListener("click", close);
  if (closeOnBackdrop) node.addEventListener("mousedown", (e) => e.target === node && close());
  requestAnimationFrame(() => {
    node.classList.add("is-in");
    const first = node.querySelector("[autofocus]") || node.querySelector("input,select,textarea,button:not([data-modal-close])");
    (first || modalEl).focus?.();
  });
  return { root: node, body: bodyEl, close };
}

/* ---------- form fields & serialize ---------- */

/**
 * fieldHtml({ name, label, type, value, required, options, placeholder, help, span, min, max, step, accept, rows })
 * type: text|email|tel|number|date|time|textarea|select|checkbox|hidden|file (default text)
 */
export function fieldHtml(f) {
  const id = "f_" + f.name;
  const req = f.required ? html`<span class="req">*</span>` : raw("");
  const spanCls = f.span === 2 ? "field-full" : f.span === "third" ? "field-third" : "";
  if (f.type === "hidden") return html`<input type="hidden" name="${f.name}" value="${f.value ?? ""}">`;

  if (f.type === "checkbox") {
    return html`
      <div class="form-field field-check ${raw(spanCls)}">
        <label class="check-label">
          <input type="checkbox" id="${id}" name="${f.name}" ${raw(f.value ? "checked" : "")}>
          <span>${f.label}</span>
        </label>
        ${f.help ? html`<p class="field-help">${f.help}</p>` : raw("")}
      </div>`;
  }

  if (f.type === "select") {
    const opts = (f.options || []).map((o) => {
      const [val, lbl] = Array.isArray(o) ? o : [o, o];
      return html`<option value="${val}" ${raw(String(val) === String(f.value ?? "") ? "selected" : "")}>${lbl}</option>`;
    });
    return html`
      <div class="form-field ${raw(spanCls)}">
        <label class="form-label" for="${id}">${f.label} ${req}</label>
        <select id="${id}" class="form-control" name="${f.name}" ${raw(f.required ? "required" : "")} ${raw(f.multiple ? "multiple" : "")}>
          ${f.placeholder ? html`<option value="">${f.placeholder}</option>` : raw("")}
          ${opts}
        </select>
        <p class="field-error" data-error-for="${f.name}" hidden></p>
      </div>`;
  }

  if (f.type === "textarea") {
    return html`
      <div class="form-field ${raw(spanCls)}">
        <label class="form-label" for="${id}">${f.label} ${req}</label>
        <textarea id="${id}" class="form-control" name="${f.name}" rows="${f.rows || 3}" placeholder="${f.placeholder || ""}" ${raw(f.required ? "required" : "")}>${f.value || ""}</textarea>
        ${f.help ? html`<p class="field-help">${f.help}</p>` : raw("")}
        <p class="field-error" data-error-for="${f.name}" hidden></p>
      </div>`;
  }

  if (f.type === "file") {
    return html`
      <div class="form-field ${raw(spanCls)}">
        <label class="form-label" for="${id}">${f.label} ${req}</label>
        <input type="file" id="${id}" class="form-control" name="${f.name}" ${raw(f.accept ? `accept="${f.accept}"` : "")} ${raw(f.multiple ? "multiple" : "")}>
        ${f.help ? html`<p class="field-help">${f.help}</p>` : raw("")}
        <p class="field-error" data-error-for="${f.name}" hidden></p>
      </div>`;
  }

  return html`
    <div class="form-field ${raw(spanCls)}">
      <label class="form-label" for="${id}">${f.label} ${req}</label>
      <input type="${f.type || "text"}" id="${id}" class="form-control" name="${f.name}" value="${f.value ?? ""}"
        placeholder="${f.placeholder || ""}" ${raw(f.required ? "required" : "")}
        ${raw(f.min != null ? `min="${f.min}"` : "")} ${raw(f.max != null ? `max="${f.max}"` : "")} ${raw(f.step != null ? `step="${f.step}"` : "")}
        ${raw(f.pattern ? `pattern="${f.pattern}"` : "")} ${raw(f.readonly ? "readonly" : "")} ${raw(f.autocomplete ? `autocomplete="${f.autocomplete}"` : "")}>
      ${f.help ? html`<p class="field-help">${f.help}</p>` : raw("")}
      <p class="field-error" data-error-for="${f.name}" hidden></p>
    </div>`;
}

export function fieldsHtml(fields, columns = 2) {
  return html`<div class="form-grid form-grid-${columns}">${raw(fields.map(fieldHtml).join(""))}</div>`;
}

// Read a <form> into a plain object (checkboxes → boolean, multi-select/file[multiple] → array)
export function serialize(form) {
  const data = {};
  for (const field of form.elements) {
    if (!field.name || field.disabled) continue;
    if (field.type === "checkbox") data[field.name] = field.checked;
    else if (field.type === "radio") {
      if (field.checked) data[field.name] = field.value;
    } else if (field.type === "file") data[field.name] = field.multiple ? field.files : field.files[0] || null;
    else if (field.tagName === "SELECT" && field.multiple) data[field.name] = Array.from(field.selectedOptions).map((o) => o.value);
    else data[field.name] = field.value;
  }
  return data;
}

export function fill(form, values = {}) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = !!value;
    else if (field.tagName === "SELECT" && field.multiple) {
      // Multi-select: pre-select every option whose value is in the array
      const wanted = new Set((Array.isArray(value) ? value : [value]).map(String));
      Array.from(field.options).forEach((o) => (o.selected = wanted.has(o.value)));
    } else if ("value" in field) field.value = value ?? "";
  }
}

// errors: { fieldName: "message" }. Clears previous errors first.
export function showErrors(form, errors = {}) {
  qsa(".field-error", form).forEach((p) => {
    p.hidden = true;
    p.textContent = "";
  });
  qsa(".form-control.has-error", form).forEach((f) => f.classList.remove("has-error"));
  let firstField = null;
  for (const [name, message] of Object.entries(errors)) {
    const p = form.querySelector(`[data-error-for="${name}"]`);
    if (p) {
      p.hidden = false;
      p.textContent = message;
    }
    const field = form.elements.namedItem(name);
    if (field) {
      field.classList.add("has-error");
      firstField = firstField || field;
    }
  }
  firstField?.focus();
  return Object.keys(errors).length === 0;
}

/**
 * modal.form — a modal wrapping a form. Resolves the submitted, serialized values, or null if cancelled.
 * { title, fields, values, submitLabel, cancelLabel, size, validate(data) → errors|null, columns }
 */
function formModal({ title, fields, values = {}, submitLabel = "Save", cancelLabel = "Cancel", size = "md", validate, columns = 2, extraBodyHtml = "" } = {}) {
  return new Promise((resolve) => {
    const formId = "form_" + Math.random().toString(36).slice(2, 8);
    const body = html`${raw(extraBodyHtml)}<form id="${formId}" novalidate>${raw(fieldsHtml(fields, columns))}</form>`;
    const footer = html`
      <button type="button" class="btn btn-outline" data-act="cancel">${cancelLabel}</button>
      <button type="submit" form="${formId}" class="btn btn-primary" data-act="submit">${submitLabel}</button>
    `;
    const { root, close: closeModal } = openModal({ title, body, footer, size });
    const form = root.querySelector("form");
    fill(form, values);
    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };
    root.querySelector('[data-act="cancel"]').addEventListener("click", () => {
      closeModal();
      finish(null);
    });
    root.addEventListener("mousedown", (e) => {
      if (e.target === root) finish(null);
    });
    const origClose = closeModal;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = serialize(form);
      const errors = validate ? validate(data) : null;
      if (errors && Object.keys(errors).length) {
        showErrors(form, errors);
        return;
      }
      origClose();
      finish(data);
    });
  });
}

export const modal = { open: openModal, form: formModal };

/* ---------- drawer ---------- */

/** drawer.open({ title, body, footer, wide, onClose }) → { root, body, close }. onClose runs however it closes. */
function openDrawer({ title, body, footer, wide = false, onClose } = {}) {
  const overlayId = Symbol("drawer");
  const node = el(html`
    <div class="drawer-overlay" role="presentation">
      <div class="drawer-panel ${wide ? "drawer-wide" : ""}" role="dialog" aria-modal="true" aria-label="${title || "Details"}">
        <div class="drawer-header">
          <h3 class="drawer-title">${title || ""}</h3>
          <button type="button" class="modal-close" data-drawer-close aria-label="Close">${raw(icon("X", { size: 16 }))}</button>
        </div>
        <div class="drawer-body">${raw(body)}</div>
        ${footer ? html`<div class="drawer-footer">${raw(footer)}</div>` : raw("")}
      </div>
    </div>
  `);
  document.body.appendChild(node);
  lockScroll(overlayId);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    unlockScroll(overlayId);
    escHandlers.pop();
    node.classList.remove("is-in");
    setTimeout(() => node.remove(), 260);
    try {
      onClose?.();
    } catch (err) {
      console.error(err);
    }
  }
  escHandlers.push(close);
  node.querySelector("[data-drawer-close]").addEventListener("click", close);
  node.addEventListener("mousedown", (e) => e.target === node && close());
  requestAnimationFrame(() => node.classList.add("is-in"));
  return { root: node, body: node.querySelector(".drawer-body"), close };
}

export const drawer = { open: openDrawer };

/* ---------- tabs ---------- */

/**
 * tabs(root, { onChange(id) }) — wires [data-tab-list] buttons + [data-tab-panel] panels already in the DOM.
 * Returns { setTab(id) }.
 */
export function tabs(root, { onChange, active } = {}) {
  const list = root.querySelector("[data-tab-list]") || root;
  function setTab(id) {
    qsa("[data-tab]", list).forEach((btn) => btn.setAttribute("aria-selected", String(btn.dataset.tab === id)));
    qsa("[data-tab-panel]", root).forEach((panel) => (panel.hidden = panel.dataset.tabPanel !== id));
    onChange?.(id);
  }
  on(list, "click", "[data-tab]", (e, btn) => setTab(btn.dataset.tab));
  if (active) setTab(active);
  return { setTab };
}

/* ---------- dropdown ---------- */

let openDropdownClose = null;
document.addEventListener("click", (e) => {
  if (openDropdownClose && !e.target.closest(".dropdown")) {
    openDropdownClose();
    openDropdownClose = null;
  }
});

// Wires every [data-dropdown-toggle] under root to open/close its sibling [data-dropdown-menu].
export function initDropdowns(root) {
  on(root, "click", "[data-dropdown-toggle]", (e, toggle) => {
    e.stopPropagation();
    const wrap = toggle.closest(".dropdown");
    const menu = wrap.querySelector("[data-dropdown-menu]");
    const isOpen = wrap.classList.contains("is-open");
    if (openDropdownClose) openDropdownClose();
    if (!isOpen) {
      wrap.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      openDropdownClose = () => {
        wrap.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      };
    } else {
      openDropdownClose = null;
    }
    void menu;
  });
}

/* ---------- badges, avatars, empty state, stat cards ---------- */

const STATUS_TONES = {
  active: "green", present: "green", paid: "green", approved: "green", published: "green", success: "green", resolved: "green", open: "blue",
  pending: "amber", partial: "amber", late: "amber", draft: "amber", scheduled: "amber", "marks-entry": "amber",
  overdue: "rust", failed: "rust", rejected: "rust", absent: "rust", inactive: "rust", cancelled: "rust", closed: "slate",
  excused: "purple", completed: "blue", transferred: "purple", dropped: "rust", graded: "green", submitted: "blue",
  returned: "purple", locked: "slate", hidden: "slate",
};

export const toneForStatus = (status) => STATUS_TONES[String(status || "").toLowerCase()] || "slate";

export function badge(status, label) {
  const tone = toneForStatus(status);
  return html`<span class="badge tone-${raw(tone)}">${label ?? status}</span>`;
}

const AVATAR_TONES = ["blue", "green", "amber", "purple", "rust", "navy"];
function hashTone(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function initialsOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** avatar({ name, photoUrl, size }) */
export function avatar({ name = "", photoUrl, size = "md" } = {}) {
  if (photoUrl) return html`<span class="avatar avatar-${raw(size)}"><img src="${photoUrl}" alt=""></span>`;
  return html`<span class="avatar avatar-${raw(size)} tone-${raw(hashTone(name))}">${initialsOf(name)}</span>`;
}

/** statCard({ icon, label, value, trend, trendDir, tone, href }) — trendDir: "up" | "down" */
export function statCard({ icon: iconName, label, value, trend, trendDir = "up", tone = "blue", href }) {
  const inner = html`
    <div class="stat-card">
      <div class="stat-card-top">
        <div class="stat-icon tone-${raw(tone)}">${raw(icon(iconName, { size: 18 }))}</div>
        ${trend != null ? html`<span class="stat-trend ${raw(trendDir === "down" ? "is-down" : "is-up")}">${raw(icon(trendDir === "down" ? "ArrowDownRight" : "ArrowUpRight", { size: 12 }))}${trend}</span>` : raw("")}
      </div>
      <p class="stat-label">${label}</p>
      <h3 class="stat-value">${raw(value)}</h3>
    </div>`;
  return href ? html`<a class="stat-card-link" href="${href}">${raw(inner)}</a>` : inner;
}

/** emptyState({ icon, title, text, actionLabel, actionAttrs }) */
export function emptyState({ icon: iconName = "Inbox", title, text, actionLabel, actionAttrs = "" }) {
  return html`
    <div class="empty-state">
      <div class="empty-icon">${raw(icon(iconName, { size: 28 }))}</div>
      <p class="empty-title">${title}</p>
      ${text ? html`<p class="empty-text">${text}</p>` : raw("")}
      ${actionLabel ? html`<button type="button" class="btn btn-outline btn-sm" ${raw(actionAttrs)}>${actionLabel}</button>` : raw("")}
    </div>`;
}

/* ---------- data table ---------- */

/**
 * dataTable(el, { columns, rows, searchKeys, filters, pageSize, rowActions, bulkActions, empty, onRowClick, getRowClass })
 * columns: [{ key, label, sortable, render(row), hideBelow: "sm"|"md", mobileLabel, align }]
 * filters: [{ key, label, options: [[value,label]] }] — client-side equality filter on row[key] (or a custom test fn)
 * rowActions: [{ label, icon, perm, danger, onClick(row), hidden(row) }]
 * Returns { update(rows), destroy() }.
 */
export function dataTable(root, opts) {
  const { columns, searchKeys = [], filters = [], pageSize: initialPageSize = 10, rowActions = [], bulkActions = [], empty, onRowClick, getRowClass, can } = opts;
  let rows = opts.rows || [];
  let state = { search: "", page: 1, pageSize: initialPageSize, sortKey: null, sortDir: "asc", filters: {}, selected: new Set() };

  root.classList.add("data-table-wrap");

  function visibleRowActions(row) {
    return rowActions.filter((a) => (!a.perm || !can || can(a.perm)) && !(a.hidden && a.hidden(row)));
  }

  function filteredSorted() {
    let list = rows;
    const needle = state.search.trim().toLowerCase();
    if (needle) {
      list = list.filter((r) => searchKeys.some((k) => String(getPath(r, k) ?? "").toLowerCase().includes(needle)));
    }
    for (const [key, value] of Object.entries(state.filters)) {
      if (value === "" || value == null) continue;
      list = list.filter((r) => String(getPath(r, key)) === String(value));
    }
    if (state.sortKey) {
      const col = columns.find((c) => c.key === state.sortKey);
      list = [...list].sort((a, b) => {
        const va = col?.sortValue ? col.sortValue(a) : getPath(a, state.sortKey);
        const vb = col?.sortValue ? col.sortValue(b) : getPath(b, state.sortKey);
        const cmp = va == null ? -1 : vb == null ? 1 : va > vb ? 1 : va < vb ? -1 : 0;
        return state.sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }

  function getPath(obj, key) {
    return key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function toolbarHtml(total) {
    const filterHtml = filters
      .map(
        (f) => html`
        <select class="form-control form-control-sm" data-dt-filter="${f.key}">
          <option value="">${f.label}: All</option>
          ${raw((f.options || []).map(([v, l]) => html`<option value="${v}" ${raw(String(state.filters[f.key] ?? "") === String(v) ? "selected" : "")}>${l}</option>`).join(""))}
        </select>`
      )
      .join("");
    return html`
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <div class="search-field">
            ${raw(icon("Search", { size: 15 }))}
            <input type="search" class="form-control form-control-sm" placeholder="Search" data-dt-search value="${state.search}">
          </div>
          ${raw(filterHtml)}
        </div>
        <div class="table-toolbar-right">
          ${bulkActions.length && state.selected.size
            ? html`<span class="table-selected-count">${state.selected.size} selected</span>${raw(
                bulkActions.map((a) => html`<button type="button" class="btn btn-outline btn-sm" data-dt-bulk="${a.id}">${a.label}</button>`).join("")
              )}`
            : raw("")}
          <span class="table-total-count">${total} ${total === 1 ? "record" : "records"}</span>
        </div>
      </div>`;
  }

  function theadHtml() {
    return html`<tr>
      ${bulkActions.length ? html`<th class="col-check"><input type="checkbox" data-dt-select-all></th>` : raw("")}
      ${raw(
        columns
          .map(
            (c) => html`<th class="${raw(c.hideBelow ? "hide-below-" + c.hideBelow : "")} ${raw(c.align ? "text-" + c.align : "")}" data-dt-sort="${raw(c.sortable ? c.key : "")}">
          ${c.label}${c.sortable && state.sortKey === c.key ? raw(icon(state.sortDir === "asc" ? "ChevronUp" : "ChevronDown", { size: 12, cls: "sort-ico" })) : raw("")}
        </th>`
          )
          .join("")
      )}
      ${rowActions.length ? html`<th class="col-actions"></th>` : raw("")}
    </tr>`;
  }

  function rowHtml(row) {
    const acts = visibleRowActions(row);
    return html`<tr data-row-id="${row.id}" class="${raw(getRowClass ? getRowClass(row) : "")} ${raw(onRowClick ? "is-clickable" : "")}">
      ${bulkActions.length ? html`<td class="col-check"><input type="checkbox" data-dt-select="${row.id}" ${raw(state.selected.has(row.id) ? "checked" : "")}></td>` : raw("")}
      ${raw(
        columns
          .map((c) => {
            // render() may return markup (html``/badge()/raw()) or plain text; plain text is escaped.
            const out = c.render ? c.render(row) : getPath(row, c.key);
            const value = out instanceof Raw ? out.value : esc(out ?? "");
            return html`<td class="${raw(c.hideBelow ? "hide-below-" + c.hideBelow : "")} ${raw(c.align ? "text-" + c.align : "")}" data-label="${c.mobileLabel || c.label}">${raw(value)}</td>`;
          })
          .join("")
      )}
      ${acts.length
        ? html`<td class="col-actions">
        <div class="dropdown dropdown-end">
          <button type="button" class="btn btn-icon btn-ghost btn-sm" data-dropdown-toggle aria-haspopup="menu" aria-expanded="false">${raw(icon("EllipsisVertical", { size: 16 }))}</button>
          <div class="dropdown-menu" data-dropdown-menu role="menu">
            ${raw(acts.map((a) => html`<button type="button" class="dropdown-item ${raw(a.danger ? "is-danger" : "")}" data-dt-action="${a.label}">${raw(icon(a.icon || "ChevronRight", { size: 14 }))}${a.label}</button>`).join(""))}
          </div>
        </div>
      </td>`
        : raw("")}
    </tr>`;
  }

  function paginationHtml(total, start, end) {
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    const buttons = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - state.page) <= 1) buttons.push(p);
      else if (buttons[buttons.length - 1] !== "…") buttons.push("…");
    }
    return html`
      <div class="pagination">
        <div class="pagination-info">
          <span>Showing ${total ? start + 1 : 0}–${end} of ${total}</span>
          <select class="form-control form-control-sm" data-dt-page-size>
            ${raw([10, 25, 50, 100].map((n) => html`<option value="${n}" ${raw(n === state.pageSize ? "selected" : "")}>${n} / page</option>`).join(""))}
          </select>
        </div>
        <div class="pagination-pages">
          <button type="button" class="pg-btn" data-dt-page="${state.page - 1}" ${raw(state.page <= 1 ? "disabled" : "")}>${raw(icon("ChevronLeft", { size: 14 }))}</button>
          ${raw(buttons.map((p) => (p === "…" ? html`<span class="pg-ellipsis">…</span>` : html`<button type="button" class="pg-btn ${raw(p === state.page ? "is-active" : "")}" data-dt-page="${p}">${p}</button>`)).join(""))}
          <button type="button" class="pg-btn" data-dt-page="${state.page + 1}" ${raw(state.page >= pages ? "disabled" : "")}>${raw(icon("ChevronRight", { size: 14 }))}</button>
        </div>
      </div>`;
  }

  function paint() {
    const list = filteredSorted();
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = list.slice(start, start + state.pageSize);

    root.innerHTML = html`
      ${raw(toolbarHtml(total))}
      <div class="table-scroll">
        <table class="data-table">
          <thead>${raw(theadHtml())}</thead>
          <tbody>${raw(pageRows.length ? pageRows.map(rowHtml).join("") : "")}</tbody>
        </table>
        ${pageRows.length ? raw("") : raw(html`<div class="table-empty">${raw(empty || emptyState({ title: "No records found" }))}</div>`)}
      </div>
      ${total ? raw(paginationHtml(total, start, Math.min(start + pageRows.length, total))) : raw("")}
    `.toString();

    initDropdowns(root);
  }

  const offSearch = on(root, "input", "[data-dt-search]", (e, input) => {
    state.search = input.value;
    state.page = 1;
    paint();
    root.querySelector("[data-dt-search]")?.focus();
    const el2 = root.querySelector("[data-dt-search]");
    if (el2) el2.setSelectionRange(el2.value.length, el2.value.length);
  });
  const offFilter = on(root, "change", "[data-dt-filter]", (e, sel) => {
    state.filters[sel.dataset.dtFilter] = sel.value;
    state.page = 1;
    paint();
  });
  const offPageSize = on(root, "change", "[data-dt-page-size]", (e, sel) => {
    state.pageSize = Number(sel.value);
    state.page = 1;
    paint();
  });
  const offPage = on(root, "click", "[data-dt-page]", (e, btn) => {
    if (btn.disabled) return;
    state.page = Number(btn.dataset.dtPage);
    paint();
  });
  const offSort = on(root, "click", "[data-dt-sort]", (e, th) => {
    const key = th.dataset.dtSort;
    if (!key) return;
    state.sortDir = state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc";
    state.sortKey = key;
    paint();
  });
  const offRowClick = on(root, "click", "tbody tr[data-row-id]", (e, tr) => {
    if (e.target.closest("td.col-actions, td.col-check")) return;
    const row = rows.find((r) => String(r.id) === tr.dataset.rowId);
    if (row) onRowClick?.(row);
  });
  const offRowAction = on(root, "click", "[data-dt-action]", (e, btn) => {
    e.stopPropagation();
    const tr = btn.closest("tr[data-row-id]");
    const row = rows.find((r) => String(r.id) === tr.dataset.rowId);
    const action = visibleRowActions(row).find((a) => a.label === btn.dataset.dtAction);
    action?.onClick(row);
  });
  const offBulk = on(root, "click", "[data-dt-bulk]", (e, btn) => {
    const action = bulkActions.find((a) => a.id === btn.dataset.dtBulk);
    action?.onClick(rows.filter((r) => state.selected.has(r.id)));
  });
  const offSelectAll = on(root, "change", "[data-dt-select-all]", (e, cb) => {
    const list = filteredSorted().slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    list.forEach((r) => (cb.checked ? state.selected.add(r.id) : state.selected.delete(r.id)));
    paint();
  });
  const offSelect = on(root, "change", "[data-dt-select]", (e, cb) => {
    if (cb.checked) state.selected.add(cb.dataset.dtSelect);
    else state.selected.delete(cb.dataset.dtSelect);
    paint();
  });

  paint();

  return {
    update(nextRows) {
      rows = nextRows;
      paint();
    },
    getSelected: () => rows.filter((r) => state.selected.has(r.id)),
    destroy() {
      [offSearch, offFilter, offPageSize, offPage, offSort, offRowClick, offRowAction, offBulk, offSelectAll, offSelect].forEach((off) => off());
    },
  };
}

/* ---------- CSV / print / download ---------- */

function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // guard against formula injection when opened in a spreadsheet
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** downloadCsv("attendance.csv", rows, [{ key, label }]) */
export function downloadCsv(filename, rows, cols) {
  const header = cols.map((c) => csvCell(c.label)).join(",");
  const lines = rows.map((r) => cols.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(","));
  const csv = "﻿" + [header, ...lines].join("\r\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** printDoc("Invoice INV-0001", "<div class=print-sheet>...</div>") */
export function printDoc(title, bodyHtml) {
  let sheet = document.getElementById("print-root");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "print-root";
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = bodyHtml;
  const prevTitle = document.title;
  document.title = title;
  document.body.classList.add("is-printing");
  const restore = () => {
    document.body.classList.remove("is-printing");
    document.title = prevTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  setTimeout(() => window.print(), 50);
}

/* ---------- misc ---------- */

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function setSearchParam(key, value) {
  const url = new URL(window.location.href);
  if (value == null || value === "") url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  history.replaceState(null, "", url);
}

export const getSearchParam = (key) => new URL(window.location.href).searchParams.get(key);

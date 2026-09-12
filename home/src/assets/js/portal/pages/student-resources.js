/*
Author       : OM Academy
Description  : Student → Resources. Study material for the student's enrolled courses as a searchable grid/list,
               filtered by course and type. Files download (and count), PDFs preview in a modal, links open in a new tab.
*/

import { boot } from "../core/shell.js";
import * as store from "../core/store.js";
import * as sel from "../core/selectors.js";
import * as services from "../core/services.js";
import * as files from "../core/files.js";
import { html, raw, on, qs, qsa, toast, modal, emptyState, statCard, setSearchParam, getSearchParam, debounce } from "../core/ui.js";
import { icon } from "../core/icons.js";
import { fileSize, date, plural } from "../core/format.js";
import { run, friendlyMessage } from "../core/errors.js";

const KINDS = {
  pdf: { label: "PDF", icon: "FileText", tone: "rust" },
  doc: { label: "Document", icon: "FileText", tone: "blue" },
  slides: { label: "Slides", icon: "Presentation", tone: "amber" },
  "video-link": { label: "Video", icon: "Video", tone: "purple" },
  link: { label: "Link", icon: "Link", tone: "green" },
};
const VIEW_KEY = "om-portal:ui:resources-view";

let ctx;
const state = { search: "", course: "", kind: "", view: "grid" };

boot({
  id: "student-resources",
  portal: "student",
  watch: ["resources", "files", "enrollments", "batches", "courses"],
  mount(c) {
    ctx = c;
    state.course = getSearchParam("course") || "";
    state.kind = KINDS[getSearchParam("type")] ? getSearchParam("type") : "";
    state.search = getSearchParam("q") || "";
    try {
      state.view = localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      /* storage unavailable: default view */
    }
    renderLayout();
    wire();
    refresh();
    const id = c.params.get("id");
    if (id) {
      const r = rows().find((x) => x.id === id);
      if (!r) toast("That resource couldn't be found.", { type: "warning" });
      else if (isPdf(r)) preview(r.id);
    }
  },
  update: () => refresh(),
});

/* ---------- data ---------- */

function rows() {
  return sel
    .resourcesForStudent(ctx.user.id)
    .map((r) => {
      const file = r.fileId ? store.byId("files", r.fileId) : null;
      const course = store.byId("courses", r.courseId);
      return {
        ...r,
        file,
        course,
        uploader: store.byId("users", r.uploadedBy),
        module: course?.syllabus?.find((m) => m.id === r.moduleId),
        kindInfo: KINDS[r.kind] || KINDS.doc,
      };
    })
    .sort((a, b) => (b.file?.uploadedAt || "").localeCompare(a.file?.uploadedAt || "") || a.title.localeCompare(b.title));
}

const isPdf = (r) => !!r.file && (r.file.mime === "application/pdf" || /\.pdf$/i.test(r.file.name));
const isLink = (r) => !r.fileId && !!r.url;

function filtered(all) {
  const needle = state.search.trim().toLowerCase();
  return all.filter(
    (r) =>
      (!state.course || r.courseId === state.course) &&
      (!state.kind || r.kind === state.kind) &&
      (!needle || [r.title, r.course?.title, r.file?.name, r.module?.title].some((v) => String(v || "").toLowerCase().includes(needle)))
  );
}

/* ---------- layout ---------- */

function renderLayout() {
  const courses = sel.activeBatchesOf(ctx.user.id).map((b) => store.byId("courses", b.courseId)).filter(Boolean);
  if (state.course && !courses.some((c) => c.id === state.course)) {
    toast("That course isn't one of your enrolments, so all resources are shown.", { type: "warning" });
    state.course = "";
    setSearchParam("course", null);
  }
  ctx.root.innerHTML = html`
    <div class="page-header">
      <div>
        <ol class="breadcrumb"><li><a href="student-dashboard.html">Dashboard</a></li><li>Resources</li></ol>
        <h1 class="page-title">Resources</h1>
        <p class="page-subtitle">Notes, slides, question banks and recorded sessions for your courses.</p>
      </div>
    </div>
    <div class="grid grid-kpi page-section" data-kpis></div>
    <div class="card">
      <div class="card-header res-toolbar">
        <div class="cluster res-filters">
          <div class="search-field">
            ${raw(icon("Search", { size: 15 }))}
            <input type="search" class="form-control form-control-sm" placeholder="Search resources" aria-label="Search resources" data-search value="${state.search}">
          </div>
          <select class="form-control form-control-sm" data-filter="course" aria-label="Filter by course">
            <option value="">Course: All</option>
            ${courses.map((c) => html`<option value="${c.id}" ${raw(c.id === state.course ? "selected" : "")}>${c.title}</option>`)}
          </select>
          <select class="form-control form-control-sm" data-filter="kind" aria-label="Filter by type">
            <option value="">Type: All</option>
            ${Object.entries(KINDS).map(([k, v]) => html`<option value="${k}" ${raw(k === state.kind ? "selected" : "")}>${v.label}</option>`)}
          </select>
        </div>
        <div class="cluster">
          <span class="text-sm text-muted" data-total></span>
          <div class="segmented" role="group" aria-label="View">
            <button type="button" data-view="grid" aria-selected="${String(state.view === "grid")}" aria-label="Grid view">${raw(icon("LayoutGrid", { size: 15 }))}<span class="hide-sm">Grid</span></button>
            <button type="button" data-view="list" aria-selected="${String(state.view === "list")}" aria-label="List view">${raw(icon("List", { size: 15 }))}<span class="hide-sm">List</span></button>
          </div>
        </div>
      </div>
      <div data-results></div>
    </div>`;
}

function refresh() {
  const all = rows();
  const list = filtered(all);
  const count = (k) => all.filter((r) => r.kind === k).length;

  qs("[data-kpis]", ctx.root).innerHTML = [
    statCard({ icon: "FolderOpen", label: "All resources", value: String(all.length), tone: "blue" }),
    statCard({ icon: "FileText", label: "PDFs & documents", value: String(count("pdf") + count("doc")), tone: "rust" }),
    statCard({ icon: "Presentation", label: "Slides", value: String(count("slides")), tone: "amber" }),
    statCard({ icon: "CirclePlay", label: "Videos & links", value: String(count("video-link") + count("link")), tone: "purple" }),
  ].join("");
  qs("[data-total]", ctx.root).textContent = plural(list.length, "item");

  const results = qs("[data-results]", ctx.root);
  if (!all.length) {
    results.innerHTML = emptyState({ icon: "FolderOpen", title: "No resources yet", text: "Study material shared by your instructors will appear here." });
    return;
  }
  if (!list.length) {
    results.innerHTML = emptyState({ icon: "Search", title: "No matching resources", text: "Try a different search term or clear the filters.", actionLabel: "Clear filters", actionAttrs: "data-clear" });
    return;
  }
  results.innerHTML =
    state.view === "grid"
      ? html`<div class="card-body"><div class="grid grid-3">${list.map(tileHtml)}</div></div>`
      : html`<ul class="list-plain">${list.map(rowHtml)}</ul>`;
}

function metaText(r) {
  return [r.course?.code || r.course?.title, r.kindInfo.label, r.file ? fileSize(r.file.size || r.sizeBytes) : isLink(r) ? "Online" : null].filter(Boolean).join(" · ");
}

function actionsHtml(r, compact) {
  const lbl = (text) => (compact ? raw("") : html`<span>${text}</span>`);
  if (isLink(r)) {
    return html`<a class="btn btn-outline btn-sm" href="${r.url}" target="_blank" rel="noopener noreferrer" data-open-link="${r.id}">${raw(icon("ExternalLink", { size: 15 }))}${lbl("Open")}</a>`;
  }
  if (!r.fileId) return html`<span class="text-xs text-muted">No file attached</span>`;
  return html`
    ${isPdf(r) ? html`<button type="button" class="btn btn-ghost btn-sm" data-preview="${r.id}" aria-label="Preview ${r.title}">${raw(icon("Eye", { size: 15 }))}${lbl("Preview")}</button>` : raw("")}
    <button type="button" class="btn btn-outline btn-sm" data-download="${r.id}" aria-label="Download ${r.title}">${raw(icon("Download", { size: 15 }))}${lbl("Download")}</button>`;
}

function tileHtml(r) {
  return html`
    <article class="res-tile">
      <div class="res-tile-top">
        <span class="icon-tile tone-${raw(r.kindInfo.tone)}">${raw(icon(r.kindInfo.icon, { size: 20 }))}</span>
        <span class="badge tone-${raw(r.kindInfo.tone)}">${r.kindInfo.label}</span>
      </div>
      <h3 class="res-tile-title">${r.title}</h3>
      <p class="file-tile-meta m-0">${metaText(r)}</p>
      <p class="file-tile-meta m-0">${r.module ? "Module: " + r.module.title + " · " : ""}${plural(r.downloads || 0, isLink(r) ? "view" : "download")}</p>
      <div class="res-tile-actions">${actionsHtml(r, false)}</div>
    </article>`;
}

function rowHtml(r) {
  return html`
    <li class="list-row">
      <span class="icon-tile icon-tile-sm tone-${raw(r.kindInfo.tone)}">${raw(icon(r.kindInfo.icon, { size: 16 }))}</span>
      <div class="list-row-main">
        <div class="list-row-title">${r.title}</div>
        <div class="list-row-sub">${metaText(r)}${r.file?.uploadedAt ? " · " + date(r.file.uploadedAt) : ""} · ${plural(r.downloads || 0, isLink(r) ? "view" : "download")}</div>
      </div>
      <div class="cluster res-row-actions">${actionsHtml(r, true)}</div>
    </li>`;
}

/* ---------- actions ---------- */

function wire() {
  const syncSearch = debounce(() => {
    setSearchParam("q", state.search.trim() || null);
    refresh();
  }, 150);
  on(ctx.root, "input", "[data-search]", (e, input) => {
    state.search = input.value;
    syncSearch();
  });
  on(ctx.root, "change", "[data-filter]", (e, select) => {
    state[select.dataset.filter] = select.value;
    setSearchParam(select.dataset.filter === "kind" ? "type" : "course", select.value || null);
    refresh();
  });
  on(ctx.root, "click", "[data-view]", (e, btn) => {
    state.view = btn.dataset.view;
    qsa("[data-view]", ctx.root).forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
    try {
      localStorage.setItem(VIEW_KEY, state.view);
    } catch {
      /* ignore */
    }
    refresh();
  });
  on(ctx.root, "click", "[data-clear]", () => {
    Object.assign(state, { search: "", course: "", kind: "" });
    ["q", "course", "type"].forEach((k) => setSearchParam(k, null));
    qs("[data-search]", ctx.root).value = "";
    qsa("[data-filter]", ctx.root).forEach((s) => (s.value = ""));
    refresh();
  });
  on(ctx.root, "click", "[data-download]", (e, btn) => download(btn.dataset.download, btn));
  on(ctx.root, "click", "[data-preview]", (e, btn) => preview(btn.dataset.preview));
  on(ctx.root, "click", "[data-open-link]", (e, a) => run(() => services.recordDownload(ctx.user, a.dataset.openLink)));
}

function findResource(id) {
  const r = rows().find((x) => x.id === id);
  if (!r) toast("That resource is no longer available — it may have been removed.", { type: "warning" });
  return r;
}

async function download(id, btn) {
  const r = findResource(id);
  if (!r) return;
  if (!r.file) return toast(`The file for "${r.title}" is missing. Ask your instructor to upload it again.`, { type: "warning" });
  const original = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;
  }
  try {
    await files.downloadFile(r.fileId);
    await run(() => services.recordDownload(ctx.user, r.id), { success: `Downloading "${r.file.name}"` });
  } catch (err) {
    console.error(err);
    toast(`Couldn't download "${r.file.name}": ${friendlyMessage(err)}`, { type: "danger", duration: 6000 });
  } finally {
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
}

async function preview(id) {
  const r = findResource(id);
  if (!r) return;
  if (!isPdf(r)) return toast("Only PDF files can be previewed. Download the file to open it.", { type: "info" });
  setSearchParam("id", r.id);
  const m = modal.open({
    title: r.title,
    size: "xl",
    body: html`<div class="pdf-frame" data-frame><div class="pdf-loading"><span class="spinner"></span>Loading preview…</div></div>`,
    footer: html`
      <span class="text-sm text-muted res-preview-meta">${r.file.name} · ${fileSize(r.file.size)}</span>
      <span data-newtab-slot></span>
      <button type="button" class="btn btn-primary" data-dl>${raw(icon("Download", { size: 16 }))}Download</button>`,
  });
  const clear = () => setSearchParam("id", null);
  m.root.querySelector("[data-modal-close]").addEventListener("click", clear);
  m.root.addEventListener("mousedown", (e) => e.target === m.root && clear());
  m.root.querySelector("[data-dl]").addEventListener("click", (e) => download(r.id, e.currentTarget));

  const frame = m.root.querySelector("[data-frame]");
  try {
    const url = await files.objectUrl(r.fileId);
    if (!url) throw new Error("File not found.");
    if (!url.startsWith("blob:")) {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) throw new Error("Could not load " + r.file.name);
    }
    frame.innerHTML = html`<iframe class="pdf-preview" src="${url}" title="Preview of ${r.title}"></iframe>`;
    m.root.querySelector("[data-newtab-slot]").outerHTML = html`<a class="btn btn-outline" href="${url}" target="_blank" rel="noopener noreferrer">${raw(icon("ExternalLink", { size: 16 }))}Open in new tab</a>`;
  } catch (err) {
    console.error(err);
    frame.innerHTML = emptyState({ icon: "TriangleAlert", title: "The preview couldn't load", text: friendlyMessage(err) + " You can still try downloading the file." });
  }
}

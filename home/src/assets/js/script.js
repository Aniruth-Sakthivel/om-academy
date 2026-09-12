/*
Author       : OM Academy
Description  : Home page scripts: header drawer, scroll spy, enquiry modal, announcements, gallery and lightbox
*/

// ES modules run in strict mode, so no "use strict" wrapper is needed.
import {
  WHATSAPP_NUMBER,
  WHATSAPP_UPDATES_TEXT,
  announcements,
  announcementFilters,
  tagTones,
  galleryItems,
  galleryFilters,
} from "./data.js";

// Helpers
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
const whatsappUrl = (text) => "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(text);

const ARROW_14 = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_12 = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const PIN_ICON = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/></svg>';

// Page scroll is locked while the drawer, the enquiry modal or the lightbox is open.
const overlays = { menu: false, enquiry: false, lightbox: false };

function setOverlay(name, open) {
  overlays[name] = open;
  document.body.style.overflow = Object.values(overlays).some(Boolean) ? "hidden" : "";
}

// Filter chips shared by Announcements and Gallery
function tabButton(label, count, pressed) {
  return `<button type="button" class="tab" data-filter="${esc(label)}" aria-pressed="${pressed}">${esc(label)}<span class="tab-count">${count}</span></button>`;
}

function setPressed(group, label) {
  qsa(".tab", group).forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.filter === label)));
}

// Header & drawer
function initMenu() {
  const nav = qs("#site-nav");
  const burger = qs(".hamburger");
  const backdrop = qs(".nav-backdrop");
  const closeBtn = qs(".drawer-close");

  function setOpen(open) {
    if (!nav || !burger || overlays.menu === open) return;
    setOverlay("menu", open);
    nav.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (backdrop) backdrop.hidden = !open;
    // Move focus into the drawer when it opens, and back to the menu button when it closes.
    const target = open ? closeBtn : burger;
    if (target && getComputedStyle(target).display !== "none") target.focus({ preventScroll: true });
  }

  if (burger) burger.addEventListener("click", () => setOpen(!overlays.menu));
  if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));
  if (backdrop) backdrop.addEventListener("click", () => setOpen(false));

  // Nav links scroll only after the menu has closed and page scroll is unlocked:
  // a native anchor jump started while body overflow is still hidden gets cancelled.
  qsa(".brand, #site-nav .nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = (link.getAttribute("href") || "").slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      const go = () => {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
        history.replaceState(null, "", "#" + id);
      };
      if (overlays.menu) {
        setOpen(false);
        setTimeout(go, 30);
      } else {
        go();
      }
    });
  });

  return { isOpen: () => overlays.menu, close: () => setOpen(false) };
}

// Scroll spy: mark the nav link whose section crosses the middle of the viewport.
function initScrollSpy() {
  if (!("IntersectionObserver" in window)) return;
  const links = qsa("#site-nav .nav-link");
  let active = "home";

  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.target.id === active) return;
      active = entry.target.id;
      links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === "#" + active));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  qsa("section[id], footer[id]").forEach((el) => spy.observe(el));
}

// Enquiry modal: any [data-enquire="Course"] or [data-enquire-topic="Notice title"] link opens it.
// Submitting builds a WhatsApp message and opens wa.me in a new tab; the visitor presses Send there.
function initEnquiry(menu) {
  const modal = qs("[data-enquiry]");
  if (!modal) return { isOpen: () => false, close() {} };

  const form = qs("[data-enquiry-form]", modal);
  const sent = qs("[data-enquiry-sent]", modal);
  const closeBtn = qs("[data-enquiry-close]", modal);
  let preset = { course: "", message: "" };
  let trigger = null;

  function fillForm() {
    form.reset();
    form.elements.namedItem("course").value = preset.course;
    form.elements.namedItem("message").value = preset.message;
    form.hidden = false;
    sent.hidden = true;
  }

  function open(nextPreset, from) {
    menu.close();
    preset = nextPreset;
    trigger = from || null;
    fillForm();
    modal.hidden = false;
    modal.scrollTop = 0;
    setOverlay("enquiry", true);
    closeBtn.focus();
  }

  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    setOverlay("enquiry", false);
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-enquire], [data-enquire-topic]");
    if (!link) return;
    event.preventDefault();
    const topic = link.getAttribute("data-enquire-topic");
    open(topic
      ? { course: "", message: "I'd like to know more about: " + topic }
      : { course: link.getAttribute("data-enquire") || "", message: "" }, link);
  });

  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  qs("[data-enquiry-again]", modal).addEventListener("click", () => {
    fillForm();
    form.elements.namedItem("name").focus();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const v = (key) => String(data.get(key) || "").trim();
    const message = [
      "New enquiry from the OM Academy website",
      "Name: " + v("name"),
      "Mobile: " + v("mobile"),
      v("email") && "Email: " + v("email"),
      "Qualification: " + v("qualification"),
      "Course: " + v("course"),
      "Preferred center: " + v("center"),
      v("source") && "Heard about us via: " + v("source"),
      v("message") && "Message: " + v("message"),
      "Wants course updates: " + (v("updates") ? "Yes" : "No"),
    ].filter(Boolean).join("\n");
    window.open(whatsappUrl(message), "_blank", "noopener");
    form.hidden = true;
    sent.hidden = false;
  });

  return { isOpen: () => overlays.enquiry, close };
}

// Announcements: filter tabs, search, the pinned latest notice and the list of earlier notices.
function initAnnouncements() {
  const tabs = qs("[data-ann-tabs]");
  const list = qs("[data-ann-list]");
  const count = qs("[data-ann-count]");
  const search = qs("#ann-search");
  if (!tabs || !list) return;

  const state = { filter: "All", query: "" };
  const items = announcements.map((a) => {
    const [day, month, year] = a.date.split(" ");
    return Object.assign({}, a, { day, month: month.toUpperCase(), year, tone: tagTones[a.tag] || "blue" });
  });
  const inFilter = (a, label) => label === "All" || a.tag === label.toUpperCase();

  const pinnedHtml = (a) => `
    <article class="ann-pinned">
      <div class="ann-pinned-dots" aria-hidden="true"></div>
      <div class="ann-pinned-body">
        <div class="ann-pinned-top">
          <span class="ann-pinned-label">${PIN_ICON} LATEST NOTICE</span>
          <span class="ann-pinned-tag tone-${a.tone}">${esc(a.tag)}</span>
        </div>
        <div class="ann-pinned-date">
          <span class="ann-day">${esc(a.day)}</span>
          <span class="ann-pinned-month">${esc(a.month)} ${esc(a.year)}</span>
        </div>
        <h3 class="ann-pinned-title">${esc(a.title)}</h3>
        <p class="ann-pinned-desc">${esc(a.desc)}</p>
        <a href="#enquire" data-enquire-topic="${esc(a.title)}" class="btn-pill btn-white btn-sm ann-ask">Ask about this ${ARROW_14}</a>
      </div>
    </article>`;

  const rowHtml = (a) => `
    <div class="ann-row tone-${a.tone}">
      <div class="ann-date">
        <div class="ann-date-day">${esc(a.day)}</div>
        <div class="ann-date-month">${esc(a.month)}</div>
      </div>
      <div class="ann-row-body">
        <div class="ann-meta">
          <span class="ann-tag">${esc(a.tag)}</span>
          <span class="ann-dot" aria-hidden="true"></span>
          <span class="ann-meta-date">${esc(a.date)}</span>
        </div>
        <h4 class="ann-row-title">${esc(a.title)}</h4>
        <p class="ann-row-desc">${esc(a.desc)}</p>
        <a href="#enquire" data-enquire-topic="${esc(a.title)}" class="ann-row-ask">Ask about this ${ARROW_12}</a>
      </div>
    </div>`;

  const boardHtml = ([featured, ...rest]) => `
    <div class="ann-layout">
      ${pinnedHtml(featured)}
      <div class="ann-list">
        <div class="ann-list-head">
          <h3 class="ann-list-title">Earlier notices</h3>
          <span class="ann-list-count">${plural(rest.length, "notice")}</span>
        </div>
        ${rest.map(rowHtml).join("")}
        ${rest.length ? "" : '<div class="ann-only">That\'s the only notice in this view.</div>'}
      </div>
    </div>`;

  const emptyHtml = `
    <div class="ann-empty">
      <div class="ann-empty-title">No announcements match your search</div>
      <p class="ann-empty-text">Try a different word, or show every category.</p>
      <button type="button" class="btn-pill btn-ghost" data-ann-reset>Show all announcements</button>
    </div>`;

  function render() {
    const needle = state.query.trim().toLowerCase();
    const shown = items
      .filter((a) => inFilter(a, state.filter))
      .filter((a) => !needle || (a.title + " " + a.desc + " " + a.tag).toLowerCase().includes(needle));
    if (count) count.textContent = "Showing " + plural(shown.length, "announcement");
    list.innerHTML = shown.length ? boardHtml(shown) : emptyHtml;
  }

  // Tabs are built once (their counts don't depend on the search) so keyboard focus survives filtering.
  tabs.innerHTML = announcementFilters
    .map((label) => tabButton(label, items.filter((a) => inFilter(a, label)).length, label === state.filter))
    .join("");

  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    state.filter = tab.dataset.filter;
    setPressed(tabs, state.filter);
    render();
  });

  if (search) {
    search.addEventListener("input", () => {
      state.query = search.value;
      render();
    });
  }

  list.addEventListener("click", (event) => {
    if (!event.target.closest("[data-ann-reset]")) return;
    state.filter = "All";
    state.query = "";
    if (search) search.value = "";
    setPressed(tabs, state.filter);
    render();
  });

  render();
}

// Lightbox: pages through the photos that were visible in the gallery when it opened.
function initLightbox() {
  const box = qs("[data-lightbox]");
  if (!box) return { isOpen: () => false, open() {}, close() {}, step() {} };

  const el = {
    counter: qs("[data-lb-counter]", box),
    title: qs("[data-lb-title]", box),
    img: qs("[data-lb-img]", box),
    tag: qs("[data-lb-tag]", box),
    captionTitle: qs("[data-lb-caption-title]", box),
    caption: qs("[data-lb-caption]", box),
    thumbs: qs("[data-lb-thumbs]", box),
    close: qs("[data-lb-close]", box),
  };
  const state = { list: [], pos: 0, zoom: 1, expanded: false };
  let trigger = null;

  function render() {
    const item = state.list[state.pos];
    if (!item) return;
    el.counter.textContent = state.pos + 1 + " / " + state.list.length;
    el.title.textContent = item.title;
    el.img.src = item.full;
    el.img.alt = item.title;
    el.img.style.transform = "scale(" + state.zoom + ")";
    el.tag.className = "lb-tag tone-" + item.tone;
    el.tag.textContent = item.tag;
    el.captionTitle.textContent = item.title;
    el.caption.textContent = item.caption;
    qsa(".lb-thumb-btn", el.thumbs).forEach((btn, i) => btn.setAttribute("aria-current", String(i === state.pos)));
    box.classList.toggle("is-expanded", state.expanded);
  }

  function show(pos) {
    state.pos = pos;
    state.zoom = 1;
    render();
  }

  function step(delta) {
    const n = state.list.length;
    if (n) show((state.pos + delta + n) % n);
  }

  function open(list, index, from) {
    state.list = list;
    state.pos = Math.max(0, list.findIndex((g) => g.index === index));
    state.zoom = 1;
    state.expanded = false;
    trigger = from || null;
    el.thumbs.innerHTML = list
      .map((g, i) => `<button type="button" class="lb-thumb-btn" data-pos="${i}" aria-label="Show ${esc(g.title)}" aria-current="false"><img class="lb-thumb" src="${esc(g.thumb)}" alt="" loading="lazy"></button>`)
      .join("");
    render();
    box.hidden = false;
    setOverlay("lightbox", true);
    el.close.focus();
  }

  function close() {
    if (box.hidden) return;
    box.hidden = true;
    setOverlay("lightbox", false);
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  el.close.addEventListener("click", close);
  qs("[data-lb-prev]", box).addEventListener("click", () => step(-1));
  qs("[data-lb-next]", box).addEventListener("click", () => step(1));
  qs("[data-lb-zoom-in]", box).addEventListener("click", () => {
    state.zoom = Math.min(2, state.zoom + 0.5);
    render();
  });
  qs("[data-lb-zoom-out]", box).addEventListener("click", () => {
    state.zoom = Math.max(1, state.zoom - 0.5);
    render();
  });
  qs("[data-lb-expand]", box).addEventListener("click", () => {
    state.expanded = !state.expanded;
    render();
  });
  el.thumbs.addEventListener("click", (event) => {
    const btn = event.target.closest(".lb-thumb-btn");
    if (btn) show(Number(btn.dataset.pos));
  });

  return { isOpen: () => overlays.lightbox, open, close, step };
}

// Gallery: filter tabs and the photo grid; a card opens the lightbox on the filtered photos.
function initGallery(lightbox) {
  const tabs = qs("[data-gallery-tabs]");
  const grid = qs("[data-gallery-grid]");
  const count = qs("[data-gallery-count]");
  if (!tabs || !grid) return;

  const state = { filter: "All" };
  const inFilter = (g, label) => label === "All" || g.group === label;
  const shown = () => galleryItems.filter((g) => inFilter(g, state.filter));

  const cardHtml = (g, i) => `
    <button type="button" class="gallery-card card-lift fu${i ? " delay-" + i * 60 : ""}" data-photo="${g.index}" aria-label="View photo: ${esc(g.title)}">
      <span class="gallery-card-media"><img src="${esc(g.card)}" alt="${esc(g.title)}" loading="lazy" decoding="async" width="600" height="450"></span>
      <span class="gallery-card-body">
        <span class="gallery-card-tag tone-${g.tone}">${esc(g.tag)}</span>
        <span class="gallery-card-title">${esc(g.title)}</span>
      </span>
    </button>`;

  function render() {
    const list = shown();
    if (count) count.textContent = plural(list.length, "photo");
    grid.innerHTML = list.map(cardHtml).join("");
  }

  tabs.innerHTML = galleryFilters
    .map((label) => tabButton(label, galleryItems.filter((g) => inFilter(g, label)).length, label === state.filter))
    .join("");

  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    state.filter = tab.dataset.filter;
    setPressed(tabs, state.filter);
    render();
  });

  grid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-photo]");
    if (card) lightbox.open(shown(), Number(card.dataset.photo), card);
  });

  render();
}

// WhatsApp "get updates" links use the number from data.js
function initWhatsappLinks() {
  qsa("[data-whatsapp-updates]").forEach((link) => {
    link.href = whatsappUrl(WHATSAPP_UPDATES_TEXT);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const menu = initMenu();
  initScrollSpy();
  const enquiry = initEnquiry(menu);
  const lightbox = initLightbox();
  initAnnouncements();
  initGallery(lightbox);
  initWhatsappLinks();

  // Escape closes whichever overlay is on top; arrow keys step through the lightbox.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (lightbox.isOpen()) lightbox.close();
      else if (enquiry.isOpen()) enquiry.close();
      else if (menu.isOpen()) menu.close();
    } else if (lightbox.isOpen() && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      lightbox.step(event.key === "ArrowRight" ? 1 : -1);
    }
  });
});

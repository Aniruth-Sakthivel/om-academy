# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is not a conventional software project — there is no `package.json`, build step, linter, or test suite. It is a single **Claude Design canvas** page for "OM Academy" (a government-recognized IT/skill training academy in Hisar, Haryana), intended to go live as the academy's website:

Folder layout — each page keeps its own files together:

```
home/                  the public website (home page)
  index.html           page markup + SEO head + one-line logic stub
  css/styles.css       all CSS
  js/app.js            page logic + content data
  js/support.js        vendored dc-runtime (only the home page uses it)
  assets/              images
```

`home/index.html` is a Claude Design canvas page (it was `index.dc.html`); the runtime doesn't care about the filename, but rename it back to `.dc.html` if you ever re-import it into the Claude Design canvas.

- [`home/index.html`](home/index.html) — the home page: the entire site as one long single-page document: Hero, Recognitions, Courses, Why Us, Admission Process, Announcements, Career Process, Gallery (+ lightbox), Centers, Testimonials, FAQ, CTA, Enquiry modal, Footer. Navigation uses same-page anchors (`#courses`, `#about`, `#admission`, `#announcements`, `#career`, `#gallery`, `#centers`, `#testimonials`, `#faq`, `#contact`). `#enquire` is an empty anchor — the enquiry form is a modal opened by the `openEnquiry` handler.
- `home/js/support.js` — a **generated** runtime bundle (header: `GENERATED from dc-runtime/src/*.ts — do not edit`). The `dc-runtime` source isn't in this repo, so treat it as vendored and read-only. At runtime it loads React 18 + ReactDOM from unpkg.com, hides the raw `<x-dc>` markup, and renders it client-side.
- `home/assets/` — `om-academy-building.jpeg` (the real Hisar center photo; 1848×4000, 1.6 MB, used only full-size in the lightbox) plus derived crops: `om-academy-building-1600.jpg` (hero), `om-academy-building-800.jpg` (gallery card, lightbox thumb, enquiry modal), `og-image.jpg` (1200×630 social preview).
- `home/css/styles.css` — all site CSS (tokens, components, accessibility and responsive rules), linked from the page `<head>` together with the Google Fonts links. There is no `<helmet>` block any more.
- `home/js/app.js` — the page logic: `window.OMAcademyPage(DCLogic)` returns `class Component extends DCLogic` (state, handlers, lifecycle hooks, and the content data in `renderVals()`). It is a classic `<script src>` loaded **before** `support.js`. The page's inline `<script type="text/x-dc" data-dc-script>` must stay as a one-line stub (`const Component = window.OMAcademyPage(DCLogic);`): the runtime compiles only that inline tag's text (`scriptEl.textContent` → `new Function(...)`), and its `fetch`-based `x-import` would fail on `file://`.
- Inline `style="…"` attributes on the markup stay inline — that is the Claude Design canvas convention and how the canvas edits elements. Only the stylesheet and logic were moved out. If the page is re-opened in the Claude Design canvas, `css/` and `js/` must travel with it.

## Working with the home page (`home/index.html`)

- The outer `<head>` is plain HTML (not processed by the runtime) and holds the title, meta description, Open Graph tags, favicon and JSON-LD — keep SEO tags there so crawlers see them without JS.
- `home/css/styles.css` holds all the CSS: custom properties (`--primary` royal blue `oklch(0.42 0.15 265)` ≈ `#23459d`, `--primary-dark` `oklch(0.32 0.12 265)`, `--primary-gradient` = `linear-gradient(165deg, primary 0%, primary-dark 100%)` — the client's navy brand, brightened at their request — plus `--primary-tint`, `--primary-bg`, `--accent` green `oklch(0.72 0.19 150)` (enquiry modal highlights), `--ink`, `--ink-soft`, `--gold`). Solid brand **backgrounds** use `var(--primary-gradient)`; text, borders and icons use the solid `var(--primary)`; brand-tinted neutrals use hue 264, Google Fonts, keyframes, shared classes (`.card-lift`, `.icon-tile`, `.btn-pill`/`.btn-primary`/`.btn-ghost`, `.eyebrow`, `.faq-item`, `.nav-link`, `.tab`, lightbox `.lb-*`), accessibility rules (`.skip-link`, `:focus-visible`, `prefers-reduced-motion`) and the responsive rules.
- **Responsive rules must target classes, never `[style*=...]` substrings.** React re-serializes inline styles (`grid-template-columns: repeat(3, minmax(0px, 1fr))`), so attribute-substring selectors match nothing at runtime even though they appear to work on the raw file. Layout hooks: `.grid-3`/`.grid-4`/`.grid-5`/`.grid-badges`, `.steps-row`/`.step-link`, `.footer-grid`, `.form-grid`, `.enq-overlay`/`.enq-close`/`.enq-grid`/`.enq-aside`/`.enq-brand`/`.enq-copy`/`.enq-lead`/`.enq-tiles`/`.enq-photo-wrap`/`.enq-photo`/`.enq-photo-fade`/`.enq-curve`/`.enq-form-panel`/`.enq-avatars` (the enquiry modal follows the client's reference: blue left panel with 6 white tiles, the building photo `home/assets/om-academy-building-tall.jpg` filling the bottom and fading up into the blue, and a curved right edge with a green stroke drawn by the `.enq-curve` SVG; at ≤900px the photo moves to a right-hand column and the curve is hidden, at ≤640px the tiles/lead are hidden and the photo is a 300px band), `.cta-card`, `.hero-badge`, `.header-inner`, `.ann-layout`/`.ann-pinned`/`.ann-row`/`.ann-search`/`.ann-subscribe`, `.filter-tabs`. Media rules need `!important` to beat the inline styles. Breakpoints: 900px (tablet) and 640px (phone), plus a 641–900px block for the step rows. The nav collapses to the hamburger at 1180px — the seven links plus logo need about 1160px — so re-measure if you add a nav item. Below that, `#site-nav` becomes an off-canvas drawer (`position:fixed`, slides in from the right, `.drawer-head`/`.nav-ico`/`.drawer-spacer`/`.drawer-note` are drawer-only). The header's `backdrop-filter` is switched off at that breakpoint, because a filtered ancestor becomes the containing block for `position:fixed` children and would trap the drawer inside the header bar. The `.nav-backdrop` lives inside the header so it dims the header bar too (z-index 1, drawer 2). `componentDidUpdate` moves focus to `.drawer-close` on open and back to `.hamburger` on close. Body scroll is locked while the menu is open, so nav links use the `navGo` handler: it closes the menu first and scrolls afterwards, since a native anchor jump started while body overflow is still hidden gets cancelled. A new grid section needs one of these classes, or a new class with rules at both breakpoints.
- **State and handlers** live in `home/js/app.js` (`class Component extends DCLogic`, returned by `window.OMAcademyPage`). `renderVals()` returns everything the template binds; handlers are closures that call `this.setState(...)`. Lifecycle hooks own document-level behaviour: `componentDidMount` adds the Escape/arrow-key listener and the scroll-spy `IntersectionObserver` (drives `.nav-link.active`), `componentDidUpdate` locks body scroll while a modal is open, `componentWillUnmount` cleans up.
- `{{ }}` holes are dotted-lookup-only. In content position they render escaped text, so per-item markup that differs (distinct icons) is hand-unrolled — see Courses, Why Us and the step rows. Attribute and event bindings work inside `sc-for` (`src="{{ g.card }}"`, `onClick="{{ f.select }}"`) — the Gallery grid, lightbox thumbnails and filter tabs use this. Give templated `<img>` tags `loading="lazy"` so the browser never requests the literal `{{ … }}` URL.
- React prop names: write camelCase attributes with a value (`autoFocus="true"`, `defaultValue="{{ x }}"`, `maxLength="10"`, `inputMode="numeric"`, `tabIndex="-1"`); bare or lowercase variants are ignored. `for=` is mapped to `htmlFor`, `class=` to `className`.
- Icons are inline stroke SVGs (24px grid, `stroke="currentColor"`, `aria-hidden="true"`) — never emoji. Styling is inline (`style="..."`) with `oklch(...)` colors via the custom properties.
- A CSS class that sets `opacity` overrides an SVG's `opacity="…"` attribute — put opacity in the inline style instead (see the `.splash` decorations).
- **Sticky header**: the page wrapper uses `overflow-x:clip`. An `overflow:hidden` ancestor silently disables `position:sticky`.
- **Encoding**: keep the file UTF-8 without BOM. Don't round-trip it through PowerShell `Set-Content`/`Out-File` — that previously produced `Â·`/`âœ“` mojibake.

## Enquiries

There is no backend. `submitEnquiry` builds a text message from the form and opens `https://wa.me/<WHATSAPP_NUMBER>?text=…` in a new tab; the visitor presses Send in WhatsApp. `WHATSAPP_NUMBER` is a constant at the top of `renderVals()` in `home/js/app.js` (currently the Hisar number, 919992887708); the Announcements "Get updates on WhatsApp" link uses it too. "Ask about this" on a notice opens the modal via `openEnquiryAbout`, which pre-fills the message textarea through `enquiryMessage`.

## Previewing

Serve the folder over HTTP so the runtime executes: `.claude/launch.json` defines `om-academy-static` (`python -m http.server 8765`); open `http://localhost:8765/home/`. The Claude Code Browser pane loads `file://` as a static snapshot, so there it only shows raw `{{ }}` placeholders; a regular browser can open the file directly, but serve over HTTP to test the way production will run. Add a `?v=` cache-buster when reloading after edits — the Python server sends no cache headers and browsers happily reuse a stale copy. There is no test suite — verify at 375px, 768px and 1280px widths.

## Content notes

Only one real photo exists; the other gallery items are Unsplash stand-ins captioned "Representative photo". Unverified pending owner confirmation: Hansi and Barwala center details, the testimonials, "500+ students" / "25+ placement partners" / "500+ photos", "Skill India" / "Digital India" partnerships, "100% support" and "24/7 Student Support". Announcements are dated May–Aug 2026 and need refreshing.

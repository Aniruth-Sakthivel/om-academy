# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The website for "OM Academy", a government-recognized IT/skill training academy in Hisar, Haryana. It is one long single-page site built from plain HTML partials, SCSS and vanilla JavaScript with Vite. There is no framework, backend, linter or test suite.

The structure follows the Dreams ERP HTML template:
- **Vite, `@@include` partials and `script.js` format:** `C:\Dreams-Project\dreams-erp\tailwind\`.
- **SCSS layout:** `C:\Dreams-Project\dreams-erp\assets\scss\`.

All tooling lives in `home/`. Nothing (no `package.json`, no `node_modules`) sits at the repo root.

```
home/
  package.json          devDependencies only: vite, sass, vite-plugin-static-copy
  vite.config.js        root "src", base "./", outDir "../dist", dev server port 3000
  plugins/vite-plugin-file-include.js   @@include / @@if, copied verbatim from Dreams ERP
  src/
    index.html          the page
    partials/           title-meta, header, topbar, footer, enquiry-modal, lightbox, script
    assets/
      scss/             main.scss + utils/ base/ components/ layout/ pages/home/
      js/               script.js (the entry), data.js (content)
      img/              photos
  dist/                 build output (gitignored)
```

## Commands

```bash
cd home
npm install        # once
npm run dev        # http://localhost:3000
npm run build      # writes home/dist/
npm run preview    # serves home/dist/ on port 4173
```

`.claude/launch.json` defines two configs:
- `om-academy-home`: the dev server.
- `om-academy-dist`: `vite preview` of the last build.

npm 12 blocks the install scripts for esbuild and @parcel/watcher. Both work without them.

## HTML (`src/index.html` + `src/partials/`)

**Page skeleton** (Dreams ERP format):
- `<head>`: `@@include('partials/title-meta.html', {"title": "…"})` and `@@include('partials/header.html', {"page": "index"})`.
- `<body>`: `.main-wrapper` containing the topbar, `<main id="main">` and the footer. The enquiry modal, the lightbox and `partials/script.html` follow the wrapper.

**Adding pages:** every top-level `src/*.html` file is a page, auto-registered by `getHtmlEntries()`. Subfolders are not scanned.

**Plugin gotchas:**
- The include context is parsed as JSON after `'` is replaced with `"`, so never put an apostrophe in a context value.
- Keep contexts flat (no nested braces).
- Never put `@@include` or `@@if` inside an HTML comment; that broke Dreams ERP's build.
- `@@key` is a plain global text replacement.
- Partials are not in Vite's module graph. The `reload-on-html-change` plugin reloads the page when any `.html` file changes.

**Styling rules:**
- There are no inline `style="…"` attributes; every element is styled by classes. The only inline styles are the ones JS sets at runtime: the body scroll lock and the lightbox zoom transform.
- Icons are inline stroke SVGs on a 24px grid with `aria-hidden="true"`, never emoji. They use `stroke="currentColor"` / `fill="currentColor"` and take `color` from a class.
- Decorative fills (hero wave, FAQ star, testimonial bubble, enquiry curve) are set in SCSS, not as SVG attributes.

**Images:** reference them as `assets/img/…`, relative and with no leading slash.
- The preserve plugin in `vite.config.js` hides `assets/img/` tags (img `src`, prefetch `href`, `og:image` `content`) from Vite.
- `vite-plugin-static-copy` then copies the folder unchanged to `dist/assets/img/`.
- The same path therefore works in the HTML, in `data.js` and in the build.

**SEO:** title, description, Open Graph and JSON-LD live in `partials/title-meta.html`, so crawlers see them without JS.

**`#enquire`** is an empty div; the enquiry form is the modal in `partials/enquiry-modal.html`.

## SCSS (`src/assets/scss/`)

**Module structure:**
- `main.scss` `@use`s the partials in this order: utils, base, components, layout, pages.
- Module system only: `@use`, no `@import`.
- Each partial starts with `@use "../utils/variables" as *;` and `@use "../utils/mixins" as *;`. Under `pages/home/` the path is `../../utils/…`.

**`utils/_variables.scss`:**
- Brand custom properties on `:root`:
  - `--primary`: royal blue `oklch(0.42 0.15 265)` ≈ `#23459d`, the client's navy brightened at their request.
  - `--primary-dark`, `--primary-gradient`, `--primary-tint`, `--primary-bg`.
  - `--accent`: green, used for the enquiry modal highlights.
  - `--ink`, `--ink-soft`, `--gold`.
- SCSS mirrors of those properties (`$primary: var(--primary)`), plus neutrals, radii and shadows.
- Solid brand backgrounds use `$primary-gradient`. Text, borders and icons use `$primary`.

**Tones:**
- The `$tones` map defines blue, green, purple, navy, amber and rust. Keys are quoted, otherwise Sass reads them as colours.
- `components/_tones.scss` turns each tone into a `.tone-*` class that sets `--tone-bg` / `--tone-fg`.
- Course cards, badges, partner cards, notices, career steps and photo tags read those variables.
- JS data carries `tone: "green"`, never raw colour values.

**`utils/_mixins.scss`:**
- `respond-below(xs|sm|md|nav)` = max-width 380 / 640 / 900 / 1180px.
- `respond-between(sm, md)` = 641–900px.
- `flex-center`, `title-font($weight)`, `link-color($color)`.

**Responsive rules** sit with their component, at the end of each partial, md before sm. They need no `!important` because nothing is inline.

**`link-color`:** the global `a:hover` recolours links. An anchor with its own colour must use `@include link-color(…)`, or it turns `--primary-dark` on hover.

**Entrance animation:** `.fu` is the fade-up entrance. The `.delay-{ms}` stagger classes come from an `@each` list in `base/_animations.scss`; add a value there if you need a new delay.

**Opacity:** a class that sets `opacity` overrides an SVG's `opacity` attribute, so per-use opacity goes in the modifier class.

**Header and nav drawer:**
- The nav collapses to the drawer below 1180px. The seven links plus the logo need about 1160px, so re-measure if you add a nav item.
- Below that width, `#site-nav` becomes a fixed off-canvas drawer.
- The header drops `backdrop-filter` at that breakpoint. A filtered ancestor becomes the containing block for `position:fixed` children and would trap the drawer inside the header bar.
- `.nav-backdrop` lives inside the header (z-index 1; the drawer is 2).

**Sticky header:** `.main-wrapper` uses `overflow-x:clip`. An `overflow:hidden` ancestor silently disables `position:sticky`.

**New grids:** use `.grid-3`, `.grid-4` or `.grid-5` (they collapse at md and sm), or add a class with rules for both breakpoints.

## JS (`src/assets/js/`)

**Entry and structure:**
- `script.js` is the only entry: `<script type="module">` in `partials/script.html`. It imports content from `data.js`.
- It is split into commented sections, like Dreams ERP's `script.js`: helpers, `initMenu`, `initScrollSpy`, `initEnquiry`, `initAnnouncements`, `initLightbox`, `initGallery`, `initWhatsappLinks`. All of them run on `DOMContentLoaded`.
- The build names the bundle `dist/assets/js/index.js`, after the page.

**Hooks are data attributes:**

| Area | Attributes |
|---|---|
| Enquiry triggers (delegated click) | `[data-enquire="Course"]` preselects the course; `[data-enquire-topic="…"]` prefills the message |
| Enquiry modal | `[data-enquiry]`, `[data-enquiry-form]`, `[data-enquiry-sent]`, `[data-enquiry-close]`, `[data-enquiry-again]` |
| Announcements | `[data-ann-tabs]`, `[data-ann-list]`, `[data-ann-count]` |
| Gallery | `[data-gallery-tabs]`, `[data-gallery-grid]`, `[data-gallery-count]` |
| Lightbox | `[data-lightbox]` plus `[data-lb-*]` |
| WhatsApp updates link | `[data-whatsapp-updates]` |

**Overlays** (drawer, enquiry modal, lightbox):
- They toggle the `hidden` attribute. `setOverlay()` locks body scroll while any of them is open.
- Escape closes the lightbox first, then the modal, then the drawer. Arrow keys step through the lightbox.
- Focus moves to the close button when an overlay opens, and back to the trigger when it closes.

**Nav links** (and the brand link) close the drawer first and scroll 30ms later. A native anchor jump started while body overflow is still hidden gets cancelled.

**Filter tabs** are rendered once; afterwards only `aria-pressed` changes (the styling keys off it), so keyboard focus survives filtering.

**Rendering:** only the announcement board, the gallery grid, the filter tabs and the lightbox contents are rendered by JS. Lists re-render from template strings, and interpolated text goes through `esc()`. Everything else is static HTML.

## Enquiries

There is no backend. Submitting the enquiry form builds a text message and opens `https://wa.me/<WHATSAPP_NUMBER>?text=…` in a new tab; the visitor presses Send in WhatsApp.

`WHATSAPP_NUMBER` is in `data.js` (currently the Hisar number, 919992887708). It also drives the Announcements "Get updates on WhatsApp" link. Update these by hand, because they don't read the constant:
- the `tel:` and `wa.me` links in the drawer and footer partials;
- the number written in the enquiry form note.

"Ask about this" on a notice prefills the message. A course "Enquire" link preselects the course.

## Previewing

Use the Browser pane with `om-academy-home`. HMR updates CSS and JS in place and reloads on any `.html` change. To check the production bundle, run `npm run build` and then use `om-academy-dist`. There is no test suite; verify at 375px, 768px and 1280px widths.

## Encoding

Keep files UTF-8 without BOM. Don't round-trip them through PowerShell `Set-Content`/`Out-File`; that previously produced `Â·`/`âœ“` mojibake.

## Content notes

Only one real photo exists. The other gallery items in `data.js` are Unsplash stand-ins captioned "Representative photo".

Unverified, pending owner confirmation:
- the Hansi and Barwala center details;
- the testimonials;
- the "500+ students", "25+ placement partners" and "500+ photos" figures;
- the "Skill India" / "Digital India" partnerships;
- the "100% support" and "24/7 Student Support" claims.

Announcements are dated May–Aug 2026 and need refreshing.

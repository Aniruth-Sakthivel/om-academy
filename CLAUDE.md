# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is not a conventional software project — there is no `package.json`, build step, linter, or test suite. It is a single **Claude Design canvas** page for "OM Academy" (a government-recognized IT/skill training academy in Haryana):

- [`index.dc.html`](index.dc.html) — the entire site as one long single-page document: Hero, Recognitions, Courses, Why Us, Admission Process, Announcements, Important Dates, Career Process, Gallery, Centers, Testimonials, FAQ, CTA, Enquiry form, Footer. All in-page navigation uses `#anchor` links (`#courses`, `#gallery`, `#announcements`, `#important-dates`, `#enquire`, etc.) — there are no separate page files.
- `support.js` — a **generated** runtime bundle. Its header says `GENERATED from dc-runtime/src/*.ts — do not edit. Rebuild with 'cd dc-runtime && bun run build'`. That `dc-runtime` source directory is not part of this repo checkout, so treat `support.js` as a vendored, read-only file — never hand-edit it.
- `assets/` — real image assets used by the page (currently just `om-academy-building.jpeg`, the real photo of the Hisar center).

## Working with `index.dc.html`

The file is a single self-contained document wrapped in an `<x-dc>` root element, loaded by `support.js` (the dc-runtime). Structure to know before editing:

- A `<helmet>` block up top holds `<link>`/`<style>` tags: CSS custom properties (`--violet`, `--ink`, `--ink-soft`, etc.), Google Fonts, keyframe animations (`fadeUp`/`floatSlow`/`pulseRing`/`bob`/`spinSlower`), shared component classes (`.card-lift`, `.icon-tile`, `.btn-pill`/`.btn-primary`/`.btn-ghost`, `.eyebrow`, `.squiggle`, `.faq-item`, `.nav-link`, `.cal-cell`), and the responsive rules (see below).
- **Mobile nav**: below 880px the nav collapses behind a hamburger button. This is state-driven, not CSS-only — `renderVals()` computes `menuOpen`/`menuClosed`/`navClass` from `this.state.menuOpen`, and `toggleMenu` is a handler bound via `onClick="{{ toggleMenu }}"` that calls `this.setState(...)`. The two hamburger/close icon SVGs are each wrapped in `<sc-if value="{{ menuOpen }}">` / `<sc-if value="{{ menuClosed }}">`.
- **Responsive grid collapsing** is done generically via attribute selectors matching inline styles, e.g. `div[style*="grid-template-columns:repeat(3"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}` inside `@media` blocks — this avoids having to hand-edit every section's grid for each breakpoint. When adding a new grid section, its column pattern (`repeat(N,...)`, `1.5fr 1fr`, etc.) needs a matching entry in these rules if it isn't already covered.
- `{{ }}` holes are dotted-lookup-only bindings from the `class Component extends DCLogic { renderVals() {...} }` script block at the bottom of the file — they render as escaped text in content position, so any per-item icon/markup that varies needs to be hand-unrolled as literal HTML rather than injected through a hole (see the Learning Categories / Why Choose Us / Gallery sections for the pattern: explicit blocks with inline SVG instead of a `sc-for` loop, when each item needs a distinct icon). Attribute bindings (`style="color:{{ x.color }}"`, `href="{{ x.mapsUrl }}"`) render the raw value and work fine in loops.
- Icons are inline stroke-based SVGs (24px grid, `stroke="currentColor"`) — never emoji.
- Styling is inline (`style="..."`) throughout, using `oklch(...)` color values (via the CSS custom properties where possible) — match that convention rather than introducing hex/rgb colors or a separate stylesheet.
- Fonts: `Poppins` (headings/brand) and `Inter` (body), loaded via Google Fonts in the helmet.
- All internal links are same-page anchors (`#courses`, `#gallery`, `#announcements`, `#important-dates`, `#enquire`, `#contact`, etc.) — there's no multi-file routing to worry about.

Since there's no build tooling, verify changes by opening `index.dc.html` directly (e.g. in a browser preview) rather than looking for a dev server or test command — there isn't one. Note that a plain browser preview does not execute the dc-runtime's `{{ }}`/`sc-for`/`sc-if`/`onClick` template logic (it needs the real Claude Design canvas runtime) — data-bound sections will show raw `{{ }}` placeholders in a plain preview; that's expected, not a bug.

## Content notes

Only one real photo exists in the repo (`assets/om-academy-building.jpeg`, the Hisar center exterior); the Gallery section's other photos are sourced from Unsplash. Hansi and Barwala center details in `renderVals()` are unverified placeholder data pending confirmation.

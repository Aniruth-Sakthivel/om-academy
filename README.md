# OM Academy website

Single-page website for OM Academy (Skills & IT Education, Hisar, Haryana), built with plain HTML partials, SCSS and vanilla JavaScript on [Vite](https://vite.dev). It follows the Dreams ERP HTML template format: `@@include` partials, `src/assets/{scss,js,img}` and one script entry.

## Files

Everything lives in `home/`:

- `src/index.html` — the page. Shared blocks come in with `@@include('partials/…')`.
- `src/partials/` — `title-meta.html` (title, SEO and Open Graph tags, JSON-LD), `header.html` (fonts, stylesheet), `topbar.html` (header and mobile drawer), `footer.html`, `enquiry-modal.html`, `lightbox.html` and `script.html`.
- `src/assets/scss/` — `main.scss`, which pulls in the `utils/` (variables, mixins), `base/`, `components/`, `layout/` and `pages/home/` partials.
- `src/assets/js/script.js` — page behaviour: menu drawer, scroll spy, enquiry modal, announcements, gallery and lightbox.
- `src/assets/js/data.js` — content: the WhatsApp number, announcements and gallery photos.
- `src/assets/img/` — the real Hisar center photo and web-sized crops (`-1600` for the hero, `-800` for cards, `-tall` for the enquiry modal, `og-image.jpg` for link previews).
- `plugins/vite-plugin-file-include.js` — the `@@include` / `@@if` plugin, copied from Dreams ERP.
- `vite.config.js` — Vite settings (source root `src/`, output `dist/`, dev server on port 3000).

## Develop

```bash
cd home
npm install
npm run dev
```

Then open http://localhost:3000. Edits to SCSS and JS update in place; edits to any `.html` file reload the page.

## Build and deploy

```bash
npm run build
```

This writes `home/dist/`: `index.html`, `assets/css/style.css`, `assets/js/` and `assets/img/`. Upload the contents of `dist/` to the web root. `npm run preview` serves the build locally. The built site has no runtime dependencies other than Google Fonts.

## Updating content

- **Announcements** — `announcements` in `src/assets/js/data.js`. The `tag` must be `IMPORTANT`, `NOTICE`, `UPDATE` or `SCHOLARSHIP` to appear under a filter; `tagTones` picks its colour.
- **Gallery** — `galleryItems` in `data.js`. Put real photos in `src/assets/img/` and replace the Unsplash stand-ins.
- **Enquiry WhatsApp number** — `WHATSAPP_NUMBER` in `data.js`. The phone and WhatsApp links in the header drawer, footer and enquiry form text are written into the HTML partials, so update those too.
- **Centers, testimonials, hero stats, partners, courses, FAQ** — directly in `src/index.html`.
- **Colours and spacing** — `src/assets/scss/utils/_variables.scss`.

Save files as UTF-8 without BOM.

## Before going live

- Confirm the WhatsApp number, the Hansi and Barwala center details, the testimonials, and the stats and partnership claims on the page.
- Replace the stock gallery photos with real ones and refresh the announcements.
- Once the domain is known, make `og:image` an absolute URL.

import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { viteStaticCopy } from "vite-plugin-static-copy";
import fileInclude from "./plugins/vite-plugin-file-include.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keep tags that point at assets/img/ (img src, prefetch href, og:image content) out of Vite's asset pipeline.
// viteStaticCopy ships the folder unchanged, so the same relative paths work in the HTML, in data.js and in dist/.
function preserveImagesPlugin() {
  const stores = new Map();
  let counter = 0;
  const imgTagRegex = /<[^>]*?(?:src|href|content)=["'](?:\.\/)?assets\/img\/[^"']+["'][^>]*?>/gi;

  return [
    {
      name: "preserve-images-pre",
      enforce: "pre",
      transformIndexHtml: {
        order: "pre",
        handler(html, ctx) {
          const store = new Map();
          stores.set(ctx.filename, store);
          return html.replace(imgTagRegex, (match) => {
            const placeholder = `<!--__PRESERVE_IMG_${counter++}__-->`;
            store.set(placeholder, match);
            return placeholder;
          });
        },
      },
    },
    {
      name: "preserve-images-post",
      enforce: "post",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          const store = stores.get(ctx.filename);
          if (!store) return html;
          for (const [placeholder, tag] of store) html = html.replace(placeholder, tag);
          stores.delete(ctx.filename);
          return html;
        },
      },
    },
  ];
}

// Partials are pulled in by @@include, not imported, so Vite doesn't know a page depends on them.
// Reload the page whenever any .html file under src/ changes.
function reloadOnHtmlChange() {
  return {
    name: "reload-on-html-change",
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".html")) {
        server.ws.send({ type: "full-reload" });
        return [];
      }
    },
  };
}

// Every top-level src/*.html file is a page.
function getHtmlEntries() {
  const srcDir = resolve(__dirname, "src");
  const entries = {};
  readdirSync(srcDir)
    .filter((file) => file.endsWith(".html"))
    .forEach((file) => {
      entries[file.replace(".html", "")] = resolve(srcDir, file);
    });
  return entries;
}

export default defineConfig(({ command }) => ({
  root: "src",
  base: "./",
  server: {
    port: 3000,
  },
  plugins: [
    fileInclude(),
    preserveImagesPlugin(),
    reloadOnHtmlChange(),
    command === "build"
      ? viteStaticCopy({ targets: [{ src: "assets/img", dest: "." }] })
      : [],
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: getHtmlEntries(),
      output: {
        entryFileNames: "assets/js/[name].js",
        chunkFileNames: "assets/js/[name].js",
        assetFileNames: (assetInfo) => {
          const name = (assetInfo.names && assetInfo.names[0]) || assetInfo.name || "";
          if (name.endsWith(".css")) return "assets/css/style.css";
          return "assets/[name].[ext]";
        },
      },
    },
  },
}));

import fs from "fs";
import path from "path";

export default function fileInclude() {
  return {
    name: "vite-plugin-file-include",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        return processIncludes(html, path.dirname(ctx.filename), {});
      },
    },
  };
}

function processIncludes(html, basePath, context) {
  // Process @@include directives - handles both with and without context
  var includeRegex = /@@include\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g;

  html = html.replace(includeRegex, function (match, includePath, contextStr) {
    var resolvedPath = path.resolve(basePath, includePath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn("[file-include] File not found: " + resolvedPath);
      return "";
    }
    var content = fs.readFileSync(resolvedPath, "utf-8");

    var includeContext = Object.assign({}, context);
    if (contextStr) {
      try {
        var parsed = JSON.parse(contextStr.replace(/'/g, '"'));
        Object.assign(includeContext, parsed);
      } catch (e) {
        console.warn("[file-include] Failed to parse context: " + contextStr);
      }
    }

    return processIncludes(content, path.dirname(resolvedPath), includeContext);
  });

  // Process @@if blocks with brace-depth tracking
  html = processIfBlocks(html, context);
  
  // Clean extra blank lines inside <head>
  html = html.replace(
    /(<head[^>]*>)([\s\S]*?)(<\/head>)/i,
    function (match, openTag, content, closeTag) {
      const cleanedContent = content
        .replace(/(\r?\n[ \t]*){3,}/g, '\n\n')
        .replace(/\n<!--/g, '\n    <!--')
        .replace(/\n<link/g, '\n    <link')
        .replace(/\n<script/g, '\n    <script');

      return openTag + cleanedContent + closeTag;
    }
  );

  // Clean only script/comment formatting before </body>
  html = html.replace(
    /([\s\S]*?)(<\/body>)/i,
    function (match, content, closeTag) {
      const cleanedContent = content
        .replace(/(\r?\n[ \t]*){3,}/g, '\n\n')
        .replace(/\n<!--/g, '\n    <!--')
        .replace(/\n<script/g, '\n    <script');

      return cleanedContent + closeTag;
    }
  );

  // Replace remaining @@variable references
  for (var key in context) {
    html = html.replace(new RegExp("@@" + key, "g"), context[key]);
  }

  return html;
}

function processIfBlocks(html, context) {
  var result = "";
  var i = 0;

  while (i < html.length) {
    var ifIndex = html.indexOf("@@if", i);
    if (ifIndex === -1) {
      result += html.slice(i);
      break;
    }

    result += html.slice(i, ifIndex);

    // Find condition in parentheses
    var parenStart = html.indexOf("(", ifIndex);
    if (parenStart === -1) { result += html.slice(ifIndex); break; }

    var parenDepth = 0;
    var parenEnd = -1;
    for (var j = parenStart; j < html.length; j++) {
      if (html[j] === "(") parenDepth++;
      if (html[j] === ")") { parenDepth--; if (parenDepth === 0) { parenEnd = j; break; } }
    }
    if (parenEnd === -1) { result += html.slice(ifIndex); break; }

    var condition = html.slice(parenStart + 1, parenEnd);

    // Find opening brace
    var braceStart = html.indexOf("{", parenEnd);
    if (braceStart === -1) { result += html.slice(ifIndex); break; }

    // Match braces with depth tracking
    var braceDepth = 0;
    var braceEnd = -1;
    for (var k = braceStart; k < html.length; k++) {
      if (html[k] === "{") braceDepth++;
      if (html[k] === "}") { braceDepth--; if (braceDepth === 0) { braceEnd = k; break; } }
    }
    if (braceEnd === -1) { result += html.slice(ifIndex); break; }

    var blockContent = html.slice(braceStart + 1, braceEnd);

    if (evaluateCondition(condition, context)) {
      result += blockContent;
    }

    i = braceEnd + 1;
  }

  return result;
}

function evaluateCondition(condition, context) {
  try {
    var keys = Object.keys(context);
    var values = keys.map(function (k) { return context[k]; });
    var fn = new Function(keys.join(","), "return (" + condition + ");");
    return fn.apply(null, values);
  } catch (e) {
    console.warn("[file-include] Failed to evaluate condition: " + condition);
    return true;
  }
}

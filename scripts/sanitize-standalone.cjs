const fs = require("fs");
const path = require("path");

const ALLOWED_ROOT_ENTRIES = new Set([".next", "node_modules", "package.json", "server.js"]);

function sanitizeStandalone(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const standaloneRoot = path.resolve(resolvedProjectRoot, ".next", "standalone");
  const relative = path.relative(resolvedProjectRoot, standaloneRoot);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative !== path.join(".next", "standalone")) {
    throw new Error(`Refusing to sanitize unexpected standalone path: ${standaloneRoot}`);
  }
  if (!fs.existsSync(path.join(standaloneRoot, "server.js"))) {
    throw new Error(`Next standalone server entry is missing: ${standaloneRoot}`);
  }

  for (const entry of fs.readdirSync(standaloneRoot, { withFileTypes: true })) {
    if (ALLOWED_ROOT_ENTRIES.has(entry.name)) continue;
    fs.rmSync(path.join(standaloneRoot, entry.name), { recursive: true, force: true });
  }

  for (const entry of fs.readdirSync(standaloneRoot)) {
    if (/^\.env(?:\.|$)/i.test(entry)) {
      throw new Error(`Standalone sanitization failed to remove environment file: ${entry}`);
    }
  }
}

if (require.main === module) {
  sanitizeStandalone(path.resolve(__dirname, ".."));
}

module.exports = { ALLOWED_ROOT_ENTRIES, sanitizeStandalone };

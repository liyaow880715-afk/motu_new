const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");

const { ensureSafeWorkdir } = require("./safe-workdir.cjs");
const { sanitizeStandalone } = require("./sanitize-standalone.cjs");

const projectRoot = path.resolve(__dirname, "..");
const safeCwd = ensureSafeWorkdir(projectRoot);
const nextBin = path.join(safeCwd, "node_modules", "next", "dist", "bin", "next");
const command = process.argv[2];

if (command === "dev" || command === "build") {
  const nextCacheDir = path.join(safeCwd, ".next");
  if (fs.existsSync(nextCacheDir)) {
    fs.rmSync(nextCacheDir, { recursive: true, force: true });
  }
}

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: safeCwd,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  if (code === 0 && command === "build") {
    try {
      sanitizeStandalone(projectRoot);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
      return;
    }
  }
  process.exit(code ?? 0);
});

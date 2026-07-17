const fs = require("fs");
const os = require("os");
const path = require("path");

function getSafeAliasPath() {
  return path.join(os.tmpdir(), "banana-mall-safe-workdir");
}

function ensureSafeWorkdir(targetDir) {
  const aliasPath = getSafeAliasPath();

  if (fs.existsSync(aliasPath)) {
    try {
      const stats = fs.lstatSync(aliasPath);
      if (stats.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(aliasPath);
        const resolved = path.resolve(path.dirname(aliasPath), currentTarget);
        if (resolved === targetDir) {
          return aliasPath;
        }
      }
      fs.rmSync(aliasPath, { recursive: true, force: true });
    } catch {
      try { fs.unlinkSync(aliasPath); } catch {}
      try { fs.rmSync(aliasPath, { recursive: true, force: true }); } catch {}
    }
  }

  try {
    fs.symlinkSync(targetDir, aliasPath, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EEXIST") {
      try { fs.unlinkSync(aliasPath); } catch {}
      fs.symlinkSync(targetDir, aliasPath, process.platform === "win32" ? "junction" : "dir");
    } else {
      throw error;
    }
  }
  return aliasPath;
}

module.exports = {
  ensureSafeWorkdir,
};

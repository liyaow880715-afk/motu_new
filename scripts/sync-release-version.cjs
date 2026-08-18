const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const rawVersion = String(process.env.RELEASE_VERSION ?? "").trim();

if (!rawVersion) {
  console.log("No release version provided; keeping the checked-in package version.");
  process.exit(0);
}

const version = rawVersion.replace(/^v/i, "");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version: ${rawVersion}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const packagePath = path.join(projectRoot, "package.json");
const lockfilePath = path.join(projectRoot, "package-lock.json");
const packageJson = readJson(packagePath);
const lockfile = readJson(lockfilePath);

packageJson.version = version;
lockfile.version = version;
if (lockfile.packages && lockfile.packages[""]) {
  lockfile.packages[""].version = version;
}

writeJson(packagePath, packageJson);
writeJson(lockfilePath, lockfile);
console.log(`Using release version ${version}.`);

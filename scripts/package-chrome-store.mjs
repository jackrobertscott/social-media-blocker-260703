import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(rootDir, "package.json");
const lockPath = path.join(rootDir, "package-lock.json");
const manifestPath = path.join(rootDir, "public", "manifest.json");
const distDir = path.join(rootDir, "dist");
const bumpArg = process.argv[2] ?? "patch";

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed ${
            signal ? `with signal ${signal}` : `with exit code ${code}`
          }`
        )
      );
    });
  });

const capture = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed ${
            signal ? `with signal ${signal}` : `with exit code ${code}`
          }${stderr ? `\n${stderr}` : ""}`
        )
      );
    });
  });

const parseChromeVersion = (version) => {
  const parts = version.split(".");
  if (parts.length !== 3) {
    throw new Error(`Expected a Chrome-compatible x.y.z version, got ${version}`);
  }

  return parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`Chrome-compatible versions can only contain integers, got ${version}`);
    }

    const value = Number(part);
    if (!Number.isSafeInteger(value) || value > 65535) {
      throw new Error(`Chrome version component out of range in ${version}`);
    }

    return value;
  });
};

const compareVersions = (left, right) => {
  const leftParts = parseChromeVersion(left);
  const rightParts = parseChromeVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
};

const bumpVersion = (currentVersion, bump) => {
  const parts = parseChromeVersion(currentVersion);
  if (bump === "major") {
    return `${parts[0] + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }

  if (bump === "patch") {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }

  parseChromeVersion(bump);
  if (compareVersions(bump, currentVersion) <= 0) {
    throw new Error(`Explicit version ${bump} must be greater than current version ${currentVersion}`);
  }

  return bump;
};

const updateVersions = async (nextVersion) => {
  const packageJson = await readJson(packagePath);
  packageJson.version = nextVersion;
  await writeJson(packagePath, packageJson);

  const lock = await readJson(lockPath);
  if (typeof lock.version === "string") {
    lock.version = nextVersion;
  }
  if (lock.packages?.[""] && typeof lock.packages[""].version === "string") {
    lock.packages[""].version = nextVersion;
  }
  await writeJson(lockPath, lock);

  const manifest = await readJson(manifestPath);
  manifest.version = nextVersion;
  await writeJson(manifestPath, manifest);
};

const validateZip = async (zipPath, expectedVersion) => {
  const entries = (await capture("unzip", ["-Z1", zipPath]))
    .split(/\r?\n/)
    .filter(Boolean);

  if (!entries.includes("manifest.json")) {
    throw new Error("Package ZIP must contain manifest.json at the root");
  }

  const unwantedEntry = entries.find((entry) =>
    ["dist/", "src/", "node_modules/", ".git/", "__MACOSX/"].some((prefix) =>
      entry.startsWith(prefix)
    )
  );
  if (unwantedEntry) {
    throw new Error(`Package ZIP contains an unwanted development path: ${unwantedEntry}`);
  }

  const manifest = JSON.parse(await capture("unzip", ["-p", zipPath, "manifest.json"]));
  if (manifest.manifest_version !== 3) {
    throw new Error(`Expected manifest_version 3, got ${manifest.manifest_version}`);
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(`Expected manifest version ${expectedVersion}, got ${manifest.version}`);
  }
};

const packageJson = await readJson(packagePath);
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, bumpArg);
const zipName = `social-media-blocker-${nextVersion}-chrome-store.zip`;
const zipPath = path.join(rootDir, zipName);

console.log(`Preparing Chrome Web Store package: ${currentVersion} -> ${nextVersion}`);
await run("npm", ["run", "typecheck"]);
await updateVersions(nextVersion);
await run("npm", ["run", "build"]);
await rm(zipPath, { force: true });
await run("zip", ["-r", "-X", path.join("..", zipName), "."], { cwd: distDir });
await validateZip(zipPath, nextVersion);

console.log(`Created ${zipName}`);
console.log("Upload this ZIP in the Chrome Web Store Developer Dashboard.");

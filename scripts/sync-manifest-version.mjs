import { readFile, writeFile } from "node:fs/promises";

const packageUrl = new URL("../package.json", import.meta.url);
const manifestUrl = new URL("../public/manifest.json", import.meta.url);

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const writeJson = async (url, value) => {
  await writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
};

const packageJson = await readJson(packageUrl);
const manifest = await readJson(manifestUrl);

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  throw new Error(
    `Chrome package versions must be x.y.z integers; package.json has ${packageJson.version}`
  );
}

if (manifest.version !== packageJson.version) {
  manifest.version = packageJson.version;
  await writeJson(manifestUrl, manifest);
  console.log(`Synced public/manifest.json version to ${packageJson.version}`);
} else {
  console.log(`public/manifest.json already at ${packageJson.version}`);
}

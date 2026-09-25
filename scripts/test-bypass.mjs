import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const buildDir = await mkdtemp(join(tmpdir(), "social-media-blocker-test-"));

try {
  await writeFile(join(buildDir, "package.json"), '{"type":"module"}\n');
  execFileSync(resolve(root, "node_modules/.bin/tsc"), [
    "-p", resolve(root, "tsconfig.json"), "--outDir", buildDir,
  ], { cwd: root, stdio: "inherit" });
  const result = spawnSync(process.execPath, ["--test", "test/bypass.test.mjs"], {
    cwd: root,
    env: { ...process.env, TEST_BUILD_DIR: buildDir },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(buildDir, { recursive: true, force: true });
}

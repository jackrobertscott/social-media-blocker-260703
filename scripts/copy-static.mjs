import { cp, mkdir } from "node:fs/promises";

const distUrl = new URL("../dist/", import.meta.url);
const publicUrl = new URL("../public/", import.meta.url);

await mkdir(distUrl, { recursive: true });
await cp(publicUrl, distUrl, { recursive: true });

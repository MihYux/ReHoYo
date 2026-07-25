import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const output = path.join(root, ".packaging", "server");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(path.join(standalone, "server.js")))) {
  throw new Error("Next.js standalone server was not generated. Check next.config.ts output.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(standalone, "server.js"), path.join(output, "server.js"));
await cp(path.join(standalone, "package.json"), path.join(output, "package.json"));
await cp(path.join(standalone, "node_modules"), path.join(output, "server_modules"), { recursive: true });
await cp(path.join(standalone, ".next"), path.join(output, ".next"), { recursive: true });
await mkdir(path.join(output, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(output, ".next", "static"), { recursive: true });

const publicDir = path.join(root, "public");
if (await exists(publicDir)) {
  await cp(publicDir, path.join(output, "public"), { recursive: true });
}

console.log(`Prepared Electron server at ${output}`);

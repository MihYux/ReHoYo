import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(root, "release", "win-unpacked", "ReHoYo.exe");
const serverRoot = path.join(root, "release", "win-unpacked", "resources", "app-server");
const serverEntry = path.join(serverRoot, "server.js");

const port = await new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", () => {
    const address = listener.address();
    const selected = typeof address === "object" && address ? address.port : 0;
    listener.close((error) => error ? reject(error) : resolve(selected));
  });
});

const dataDir = await mkdtemp(path.join(os.tmpdir(), "rehoyo-packaged-smoke-"));
const child = spawn(executable, [serverEntry], {
  cwd: serverRoot,
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DATA_DIR: dataDir,
  },
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += String(chunk); });
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

try {
  const deadline = Date.now() + 20_000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (!response?.ok) {
    throw new Error(`Packaged server failed. exit=${child.exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  const apiResponse = await fetch(`http://127.0.0.1:${port}/api/project/current`);
  if (!apiResponse.ok) {
    const body = await apiResponse.text();
    throw new Error(`Packaged API returned HTTP ${apiResponse.status}.\nbody:\n${body}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  console.log(`Packaged Electron server returned HTTP ${response.status}; project API returned HTTP ${apiResponse.status}.`);
} finally {
  if (child.exitCode === null) child.kill();
}

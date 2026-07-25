import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpackedRoot = path.join(root, "release", "win-unpacked");
const executableName = (await readdir(unpackedRoot)).find((name) => name.toLowerCase().endsWith(".exe") && !["elevate.exe", "uninstall.exe"].includes(name.toLowerCase()));
if (!executableName) throw new Error(`No packaged application executable found in ${unpackedRoot}.`);
const executable = path.join(unpackedRoot, executableName);
const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  windowsHide: true,
  env: process.env,
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += String(chunk); });
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

const outcome = await Promise.race([
  new Promise((resolve) => child.once("exit", (code, signal) => resolve({ exited: true, code, signal }))),
  new Promise((resolve) => setTimeout(() => resolve({ exited: false }), 12_000)),
]);

if (outcome.exited) {
  throw new Error(`Packaged app exited early. code=${outcome.code} signal=${outcome.signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

child.kill();
console.log("Packaged ReHoYo remained running after startup.");

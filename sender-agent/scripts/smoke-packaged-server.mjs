import { spawn } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unpackedRoot = path.join(root, "release", "win-unpacked");
const executableName = (await readdir(unpackedRoot)).find((name) => name.toLowerCase().endsWith(".exe") && !["elevate.exe", "uninstall.exe"].includes(name.toLowerCase()));
if (!executableName) throw new Error(`No packaged application executable found in ${unpackedRoot}.`);
const executable = path.join(unpackedRoot, executableName);
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
    NODE_PATH: path.join(serverRoot, "server_modules"),
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
  const demoFileName = "【内部模拟】崩坏星穹铁道2.0版本发行执行层输入材料.md";
  const demoText = `# 《崩坏：星穹铁道》2.0「假如在午夜入梦」版本发行执行层输入材料\n> 数据冻结时间：2024 年 1 月 2 日\n> 版本上线时间：2024 年 2 月 6 日\n# 1｜产品侧版本移交单\n# 2｜版本经营目标输入`;
  const form = new FormData();
  form.append("files", new Blob([demoText], { type: "text/markdown" }), demoFileName);
  const uploadResponse = await fetch(`http://127.0.0.1:${port}/api/sources`, { method: "POST", body: form });
  if (!uploadResponse.ok) throw new Error(`Packaged upload API returned HTTP ${uploadResponse.status}: ${await uploadResponse.text()}`);
  const fixtureResponse = await fetch(`http://127.0.0.1:${port}/api/project/current`);
  const fixtureSnapshot = await fixtureResponse.json();
  if (!fixtureSnapshot?.project?.embeddedDemo?.eligible) throw new Error("Packaged server did not detect the embedded demo fixture.");
  console.log(`Packaged Electron server returned HTTP ${response.status}; project API returned HTTP ${apiResponse.status}; embedded fixture detected.`);
} finally {
  if (child.exitCode === null) child.kill();
}

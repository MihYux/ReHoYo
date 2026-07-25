import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ICON = path.join(__dirname, process.platform === "win32" ? "app-icon.ico" : "app-icon.png");
let serverProcess = null;
let applicationUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 45_000, serverState = () => ({ exited: false, error: "" })) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.setTimeout(1_000, () => request.destroy());
      request.once("error", () => {
        const state = serverState();
        if (state.exited) {
          reject(new Error(`ReHoYo server exited before startup.${state.error ? `\n\n${state.error}` : ""}`));
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`ReHoYo server did not start within ${timeoutMs / 1000} seconds.`));
          return;
        }
        setTimeout(probe, 250);
      });
    };
    probe();
  });
}

async function startPackagedServer() {
  const serverRoot = path.join(process.resourcesPath, "app-server");
  const serverEntry = path.join(serverRoot, "server.js");
  const port = await reservePort();
  const dataDir = path.join(app.getPath("userData"), ".data");
  applicationUrl = `http://127.0.0.1:${port}`;
  let serverError = "";

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dataDir,
    },
  });

  serverProcess.stdout?.on("data", (chunk) => console.log(`[server] ${String(chunk).trimEnd()}`));
  serverProcess.stderr?.on("data", (chunk) => {
    const message = String(chunk).trimEnd();
    serverError = `${serverError}\n${message}`.trim().slice(-4_000);
    console.error(`[server] ${message}`);
  });
  serverProcess.once("exit", (code, signal) => {
    if (code && code !== 0) console.error(`ReHoYo server exited with code ${code} (${signal || "no signal"}).`);
  });

  await waitForServer(applicationUrl, 45_000, () => ({
    exited: serverProcess?.exitCode !== null,
    error: serverError,
  }));
}

function createWindow() {
  const allowedOrigin = new URL(applicationUrl).origin;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#F5F8FA",
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === allowedOrigin) return;
    } catch {
      // Invalid or non-web destinations remain blocked.
    }
    event.preventDefault();
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
  });

  void window.loadURL(applicationUrl);
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) await startPackagedServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox("ReHoYo failed to start", error instanceof Error ? error.message : String(error));
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

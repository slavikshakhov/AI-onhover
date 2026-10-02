import "./check-node.mjs";
import { spawn } from "node:child_process";
import { createServer as createSocketServer } from "node:net";
import { mkdtemp, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import electron from "electron";
import { createServer } from "vite";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let server, child, control, socketServer, temporary, poll, forceTimer;
let stopping = false;
let appPid, startupTimer;
let finishStartup;
const startupFinished = new Promise((resolve) => {
  finishStartup = resolve;
});
let logOffset = 0;
let flushing = Promise.resolve();
const flush = () => {
  flushing = flushing.then(async () => {
    if (!temporary) return;
    const bytes = await readFile(path.join(temporary, "electron.log")).catch(
      () => Buffer.alloc(0),
    );
    if (bytes.length > logOffset)
      process.stdout.write(bytes.subarray(logOffset));
    logOffset = bytes.length;
  });
  return flushing;
};
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (control) control.write('{"type":"shutdown"}\n');
  else child?.kill("SIGTERM");
  await startupFinished;
  clearTimeout(startupTimer);
  // open -W is only a waiter; the control socket shuts down the actual app.
  if (child && child.exitCode === null && child.signalCode === null) {
    forceTimer = setTimeout(() => {
      control?.destroy();
      if (appPid) {
        try {
          process.kill(appPid, "SIGKILL");
        } catch {}
      }
      child?.kill("SIGTERM");
    }, 5000);
    await once(child, "exit").catch(() => {});
    clearTimeout(forceTimer);
  }
  clearInterval(poll);
  await flush();
  control?.destroy();
  socketServer?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));
try {
  child = spawn(
    process.execPath,
    [
      path.join(cwd, "node_modules/typescript/bin/tsc"),
      "-p",
      "tsconfig.electron.json",
    ],
    { cwd, stdio: "inherit", env },
  );
  const [compileCode] = await once(child, "exit");
  child = undefined;
  if (stopping) {
    /* interrupted during compilation */
  } else if (compileCode !== 0) void stop(compileCode ?? 1);
  else {
    server = await createServer({ root: cwd });
    await server.listen();
    if (stopping) await server.close();
    else {
      env.VITE_DEV_SERVER_URL = server.resolvedUrls.local[0];
      if (process.platform === "darwin") {
        temporary = await mkdtemp(path.join(tmpdir(), "hover-dev-"));
        await chmod(temporary, 0o700);
        const socketPath = path.join(temporary, "control.sock");
        const logPath = path.join(temporary, "electron.log");
        await writeFile(logPath, "", { mode: 0o600 });
        socketServer = createSocketServer((socket) => {
          if (control || stopping) {
            socket.destroy();
            return;
          }
          control = socket;
          socket.on("error", () => {});
          let reply = "";
          socket.setEncoding("utf8");
          socket.on("data", (chunk) => {
            reply += chunk;
            const end = reply.indexOf("\n");
            if (end < 0) return;
            const message = JSON.parse(reply.slice(0, end));
            reply = reply.slice(end + 1);
            if (message.type === "started" && Number.isInteger(message.pid)) {
              appPid = message.pid;
              clearTimeout(startupTimer);
            }
          });
          socket.write(
            JSON.stringify({
              type: "start",
              cwd,
              env,
              entry: path.join(cwd, "dist-electron/electron/main.js"),
            }) + "\n",
          );
        });
        socketServer.listen(socketPath);
        await once(socketServer, "listening");
        await chmod(socketPath, 0o600);
        if (stopping) throw new Error("Startup interrupted");
        child = spawn(
          "/usr/bin/open",
          [
            "-n",
            "-W",
            "-a",
            electron.slice(0, electron.indexOf(".app") + 4),
            "--stdout",
            logPath,
            "--stderr",
            logPath,
            "--args",
            path.join(cwd, "scripts/dev-bootstrap.cjs"),
            socketPath,
            ...(process.env.HOVER_DEV_DEBUG_PORT
              ? [
                  "--remote-debugging-address=127.0.0.1",
                  `--remote-debugging-port=${Number(process.env.HOVER_DEV_DEBUG_PORT)}`,
                ]
              : []),
          ],
          { cwd, env, stdio: "inherit" },
        );
        startupTimer = setTimeout(() => {
          console.error(
            "Electron did not connect to the development launcher.",
          );
          void stop(1);
        }, 15000);
        poll = setInterval(() => void flush(), 200);
        console.log(
          `Development app launching through macOS LaunchServices (${env.VITE_DEV_SERVER_URL}).`,
        );
      } else {
        child = spawn(electron, [cwd], { cwd, env, stdio: "inherit" });
      }
      child.on("error", () => {
        console.error("Could not launch Electron.");
        void stop(1);
      });
      child.on("exit", (code) => void stop(code ?? 0));
    }
  }
} catch (error) {
  if (!stopping)
    console.error("Development startup failed:", error.code ?? error.message);
  void stop(1);
} finally {
  finishStartup();
}

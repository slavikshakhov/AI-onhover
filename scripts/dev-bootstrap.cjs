// LaunchServices does not inherit the terminal's cwd/environment reliably.
// Receive both over a private local socket; never put secrets in launch arguments.
const { app } = require("electron");
const path = require("node:path");
const { name } = require("../package.json");
app.setName(name);
app.setPath("userData", path.join(app.getPath("appData"), name));
const { connect } = require("node:net");
const { pathToFileURL } = require("node:url");
const socket = connect(process.argv[2]);
let buffer = "";
let started = false;
const timer = setTimeout(() => app.exit(1), 15000);
socket.setEncoding("utf8");
socket.on("error", () => app.exit(1));
socket.on("close", () => app.quit());
socket.on("data", (chunk) => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\n")) !== -1) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.type === "shutdown") {
      app.quit();
      continue;
    }
    if (started || message.type !== "start") continue;
    started = true;
    clearTimeout(timer);
    process.chdir(message.cwd);
    // Remove stale values inherited from LaunchServices before restoring the shell.
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, message.env);
    delete process.env.ELECTRON_RUN_AS_NODE;
    socket.write(JSON.stringify({ type: "started", pid: process.pid }) + "\n");
    import(pathToFileURL(message.entry).href).catch(() => {
      console.error(
        "Could not load the development application. Run npm run build to check compilation.",
      );
      app.exit(1);
    });
  }
});

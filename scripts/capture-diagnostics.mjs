import "./check-node.mjs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const executable = require("electron");
const probe = fileURLToPath(new URL("./capture-probe.cjs", import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Explicit --capture requests actual OS-controlled capture. Otherwise status only.
// Run --launch-services to compare attribution with a direct child-process launch.
const args = process.argv.slice(2).filter((a) => a !== "--launch-services");
const launchServices = process.argv.includes("--launch-services");
const child = spawn(
  launchServices ? "/usr/bin/open" : executable,
  launchServices
    ? [
        "-n",
        "-W",
        "-a",
        executable.slice(0, executable.indexOf(".app") + 4),
        "--args",
        probe,
        ...args,
      ]
    : [probe, ...args],
  { env, stdio: "inherit" },
);
child.on("error", () => {
  console.error("Could not launch capture diagnostics");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

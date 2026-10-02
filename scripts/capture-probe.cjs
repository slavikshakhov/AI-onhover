// Standalone probe: deliberately does not load the application or dotenv.
const { app, desktopCapturer, screen, systemPreferences } = require("electron");
const { writeFileSync } = require("node:fs");
app
  .whenReady()
  .then(async () => {
    const result = {
      executable: process.execPath,
      pid: process.pid,
      parentPid: process.ppid,
      electron: process.versions.electron,
      macOS: require("node:os").release(),
    };
    const readStatus = () => {
      try {
        return systemPreferences.getMediaAccessStatus("screen");
      } catch {
        return "unavailable";
      }
    };
    result.permissionBefore = readStatus();
    result.displays = screen.getAllDisplays().map((d) => String(d.id));
    if (process.argv.includes("--capture")) {
      let timer;
      const started = Date.now();
      try {
        const sources = await Promise.race([
          desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 32, height: 32 },
            fetchWindowIcons: false,
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Object.assign(new Error(), { code: "ERR_CAPTURE_TIMEOUT" }),
                ),
              30000,
            );
          }),
        ]);
        result.sources = sources.map((s) => ({
          displayId: s.display_id,
          empty: s.thumbnail.isEmpty(),
          size: s.thumbnail.getSize(),
        }));
        result.outcome = !sources.length
          ? "no-sources"
          : sources.every((s) => s.thumbnail.isEmpty())
            ? "empty-thumbnails"
            : "thumbnail-returned";
        result.stage =
          result.outcome === "no-sources" ? "source-selection" : "thumbnail";
        // A nonempty image does not prove all other apps are visible; no pixels are inspected or persisted.
      } catch (error) {
        result.stage = "desktop-capturer";
        result.outcome =
          error?.code === "ERR_CAPTURE_TIMEOUT" ? "timeout" : "rejected";
        result.errorType = error instanceof Error ? error.name : typeof error;
        const message = typeof error === "string" ? error : error?.message;
        // This isolated probe has no application environment or image payloads.
        result.errorMessage = String(message ?? "").slice(0, 1000);
      } finally {
        clearTimeout(timer);
      }
      result.elapsedMs = Date.now() - started;
      result.permissionAfter = readStatus();
    }
    const json = JSON.stringify(result, null, 2);
    const reportIndex = process.argv.indexOf("--report");
    if (reportIndex !== -1 && process.argv[reportIndex + 1])
      writeFileSync(process.argv[reportIndex + 1], json + "\n", {
        mode: 0o600,
      });
    console.log(json);
  })
  .catch(() => {
    console.error("Capture diagnostic setup failed");
    process.exitCode = 1;
  })
  .finally(() => app.quit());

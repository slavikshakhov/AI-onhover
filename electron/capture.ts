import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
  session,
  systemPreferences,
  type NativeImage,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { cropRegion } from "./region.js";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const regionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();
export type CaptureResult = {
  image?: string;
  thumbnail?: string;
  error?: string;
  cancelled?: boolean;
  category?: string;
};
export class RegionCapture {
  private pending?: Promise<CaptureResult>;
  private cancelCurrent?: () => void;
  constructor(
    private getWindow: () => BrowserWindow,
    private demo: boolean,
  ) {}
  cancel() {
    this.cancelCurrent?.();
  }
  capture(): Promise<CaptureResult> {
    if (this.pending) return this.pending;
    this.pending = this.run().finally(() => {
      this.pending = undefined;
      this.cancelCurrent = undefined;
    });
    return this.pending;
  }
  private async run(): Promise<CaptureResult> {
    const assistant = this.getWindow();
    let overlay: BrowserWindow | undefined;
    let cancelled = false;
    let complete: ((r: CaptureResult) => void) | undefined;
    let fullImage: NativeImage | undefined;
    this.cancelCurrent = () => {
      cancelled = true;
      complete?.({ cancelled: true });
      if (overlay && !overlay.isDestroyed()) overlay.close();
    };
    let stage = "display-selection";
    let permission = "not-checked";
    const executable = process.execPath;
    const appBundle = executable.match(/^.*?\.app(?=\/)/)?.[0];
    const diagnostic = (
      event: string,
      details: Record<string, unknown> = {},
    ) => {
      // Only metadata: never image bytes, renderer payloads, source names, or raw errors.
      console.info(
        "[screen-capture]",
        JSON.stringify({
          event,
          stage,
          permission,
          executable,
          appBundle,
          pid: process.pid,
          parentPid: process.ppid,
          ...details,
        }),
      );
    };
    const failure = (
      category: string,
      message: string,
      error?: unknown,
    ): CaptureResult => {
      const backendMessage =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : undefined;
      const safeMessages = [
        "Failed to get sources",
        "Failed to get sources.",
        "Could not get sources",
        "Failed to get screen sources",
      ];
      diagnostic("failure", {
        category,
        errorMessage:
          backendMessage && safeMessages.includes(backendMessage)
            ? backendMessage
            : undefined,
        errorType: error instanceof Error ? error.name : typeof error,
        // Raw exception messages/stacks may contain sensitive payloads.
        errorCode:
          error &&
          typeof error === "object" &&
          "code" in error &&
          /^(?:E[A-Z_]+|ERR_[A-Z_]+)$/.test(String(error.code))
            ? error.code
            : undefined,
      });
      return { category, error: `${message} [${category}]` };
    };
    const readPermission = () => {
      try {
        permission =
          process.platform === "darwin" && !this.demo
            ? systemPreferences.getMediaAccessStatus("screen")
            : "not-applicable";
        diagnostic("permission-status");
      } catch (error) {
        permission = "unavailable";
        diagnostic("permission-status-unavailable", {
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    };
    try {
      const display = screen.getDisplayMatching(assistant.getBounds());
      stage = "permission-check";
      readPermission();
      // This is an explicit user capture request. The status API is diagnostic,
      // not an authorization gate: desktopCapturer invokes the OS-controlled
      // capture backend, which remains responsible for consent and enforcement.
      stage = "assistant-hide";
      assistant.hide();
      // Let the compositor remove the assistant before taking the still frame.
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (cancelled) return { cancelled: true };
      if (!this.demo) {
        stage = "desktop-capturer";
        const sourcePromise = desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: {
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor),
          },
          fetchWindowIcons: false,
        });
        let permissionTimer: ReturnType<typeof setTimeout>;
        const sources = await Promise.race([
          sourcePromise,
          new Promise<never>((_resolve, reject) => {
            permissionTimer = setTimeout(
              () =>
                reject(
                  Object.assign(new Error("Desktop capture timed out"), {
                    code: "ERR_CAPTURE_TIMEOUT",
                  }),
                ),
              30000,
            );
          }),
        ]).finally(() => clearTimeout(permissionTimer));
        if (cancelled) return { cancelled: true };
        readPermission();
        diagnostic("sources", {
          count: sources.length,
          targetDisplayId: String(display.id),
          displayIds: sources.map((source) => source.display_id),
        });
        stage = "source-selection";
        const source = sources.find((s) => s.display_id === String(display.id));
        if (!source)
          return failure(
            "source-not-found",
            "No capture source matched the assistant's display.",
          );
        stage = "thumbnail";
        if (source.thumbnail.isEmpty())
          return failure(
            "empty-thumbnail",
            "The selected display returned an empty screenshot.",
          );
        diagnostic("thumbnail-ready", { size: source.thumbnail.getSize() });
        fullImage = source.thumbnail;
      }
      stage = "overlay-setup";
      const isolated = session.fromPartition("capture-memory");
      isolated.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      isolated.setPermissionCheckHandler(() => false);
      overlay = new BrowserWindow({
        ...display.bounds,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        title: "Select screenshot region",
        backgroundColor: "#182032",
        webPreferences: {
          preload: path.join(dirname, "capture-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: isolated,
        },
      });
      overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      overlay.webContents.on("will-navigate", (e) => e.preventDefault());
      const window = overlay;
      const trusted = (event: Electron.IpcMainInvokeEvent) =>
        event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame;
      ipcMain.handle("capture:frame", (event) => {
        if (!trusted(event)) throw new Error("Untrusted capture window");
        return { demo: this.demo, image: fullImage?.toDataURL() };
      });
      const result = new Promise<CaptureResult>((resolve) => {
        complete = resolve;
      });
      ipcMain.handle("capture:select", (event, value, demoImage) => {
        if (!trusted(event) || cancelled) return;
        try {
          stage = "region-crop";
          const rect = regionSchema.parse(value);
          // Demo pixels originate only from this isolated selector, never the real desktop.
          if (this.demo) {
            if (
              typeof demoImage !== "string" ||
              demoImage.length > 8_000_000 ||
              !demoImage.startsWith("data:image/png;base64,")
            )
              throw new Error("Invalid demo image");
            fullImage = nativeImage.createFromDataURL(demoImage);
          }
          if (!fullImage || fullImage.isEmpty()) throw new Error("No image");
          const crop = fullImage.crop(
            cropRegion(rect, display.size, fullImage.getSize()),
          );
          // Preserve the selected region at native capture resolution; only the UI preview is reduced.
          const croppedSize = crop.getSize();
          const scale = Math.min(
            100 / croppedSize.width,
            60 / croppedSize.height,
            1,
          );
          diagnostic("region-captured", { size: croppedSize });
          complete?.({
            image: crop.toDataURL(),
            thumbnail: crop
              .resize({
                width: Math.max(1, Math.round(croppedSize.width * scale)),
                height: Math.max(1, Math.round(croppedSize.height * scale)),
              })
              .toDataURL(),
          });
        } catch (error) {
          complete?.(
            failure(
              "region-crop",
              "Could not crop the selected region.",
              error,
            ),
          );
        }
      });
      ipcMain.handle("capture:cancel", (event) => {
        if (trusted(event)) complete?.({ cancelled: true });
      });
      ipcMain.handle("capture:failed", (event) => {
        if (trusted(event))
          complete?.(
            failure(
              "overlay-render",
              "The region selector could not render the screenshot.",
            ),
          );
      });
      window.webContents.on("render-process-gone", (_event, details) => {
        diagnostic("renderer-exited", {
          reason: details.reason,
          exitCode: details.exitCode,
        });
        complete?.(
          failure("overlay-render", "The region selector renderer exited."),
        );
      });
      stage = "overlay-load";
      window.on("closed", () => complete?.({ cancelled: true }));
      await window.loadFile(path.join(dirname, "../../electron/capture.html"));
      if (cancelled) return { cancelled: true };
      stage = "region-selection";
      diagnostic("overlay-ready");
      window.show();
      window.focus();
      const timeout = setTimeout(
        () =>
          complete?.(
            failure("region-selection-timeout", "Region selection timed out."),
          ),
        120000,
      );
      try {
        return await result;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (stage === "desktop-capturer") readPermission();
      const timedOut =
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_CAPTURE_TIMEOUT";
      return failure(
        timedOut ? "desktop-capturer-timeout" : stage,
        `Screen capture failed during ${stage}.`,
        error,
      );
    } finally {
      fullImage = undefined;
      ipcMain.removeHandler("capture:frame");
      ipcMain.removeHandler("capture:select");
      ipcMain.removeHandler("capture:cancel");
      ipcMain.removeHandler("capture:failed");
      if (overlay && !overlay.isDestroyed()) overlay.destroy();
      if (!assistant.isDestroyed()) {
        assistant.show();
        assistant.focus();
      }
    }
  }
}

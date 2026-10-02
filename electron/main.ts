import { RegionCapture } from "./capture.js";
import { randomUUID } from "node:crypto";
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "dotenv/config";
import { z } from "zod";
import { requestSchema, budgetSchema } from "../src/shared.js";
import { Topic } from "./service.js";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const demo = process.env.DEMO_MODE === "1";
const topic = new Topic(
  demo,
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_TEXT_MODEL,
  process.env.OPENAI_TRANSCRIBE_MODEL,
  undefined,
  process.env.OPENAI_REVIEW_MODEL,
);
const screenshotTopic = new Topic(
  demo,
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_TEXT_MODEL,
  process.env.OPENAI_TRANSCRIBE_MODEL,
  undefined,
  process.env.OPENAI_REVIEW_MODEL,
);
let attachmentId = "";
let captureEpoch = 0;
const screenshotRequests = new Map<string, ReturnType<Topic["ask"]>>();
let capture: RegionCapture;
let win: BrowserWindow;
const clearAll = () => {
  captureEpoch++;
  capture?.cancel();
  topic.reset();
  screenshotTopic.reset();
  attachmentId = "";
  screenshotRequests.clear();
};
if (!app.requestSingleInstanceLock()) app.exit(0);
app.commandLine.appendSwitch("disable-http-cache");
app.whenReady().then(() => {
  const s = session.fromPartition("hover-memory");
  const trusted = (url: string) =>
    process.env.VITE_DEV_SERVER_URL
      ? new URL(url).origin === new URL(process.env.VITE_DEV_SERVER_URL).origin
      : url === new URL("../../dist/index.html", import.meta.url).href;
  s.setPermissionCheckHandler(
    (wc, p, origin, details) =>
      wc === win?.webContents &&
      p === "media" &&
      trusted(details.requestingUrl || origin),
  );
  s.setPermissionRequestHandler((wc, p, callback, details) =>
    callback(
      wc === win?.webContents &&
        p === "media" &&
        trusted(details.requestingUrl) &&
        "mediaTypes" in details &&
        details.mediaTypes?.every((x: string) => x === "audio") === true,
    ),
  );
  win = new BrowserWindow({
    width: 480,
    height: 700,
    minWidth: 420,
    minHeight: 600,
    title: "Hover · Ask AI",
    backgroundColor: "#10141e",
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: s,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  const handle = (channel: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw new Error("Untrusted sender");
      return fn(...args);
    });
  handle("details", (version, path) =>
    topic.details(
      z.string().uuid().parse(version),
      z.array(z.number().int().min(0).max(4)).min(1).max(32).parse(path),
    ),
  );
  handle("code", (version, path, budget) =>
    topic.code(
      z.string().uuid().parse(version),
      z.array(z.number().int().min(0).max(4)).max(32).parse(path),
      budgetSchema.parse(budget),
    ),
  );
  capture = new RegionCapture(() => win, demo);
  let captureRequest: Promise<unknown> | undefined;
  handle("screenshot:capture", () => {
    if (captureRequest) return captureRequest;
    const token = captureEpoch;
    captureRequest = (async () => {
      const result = await capture.capture();
      if (token !== captureEpoch) return { cancelled: true };
      if (!result.image || !result.thumbnail)
        return {
          error: result.error,
          category: result.category,
          cancelled: result.cancelled,
        };
      screenshotRequests.clear();
      attachmentId = randomUUID();
      screenshotTopic.setImage(result.image);
      void screenshotTopic.analyzeScreenshot({
        lines: 8,
        columns: 80,
        fragments: 4,
      });
      return { attachment: { id: attachmentId, thumbnail: result.thumbnail } };
    })().finally(() => {
      captureRequest = undefined;
    });
    return captureRequest;
  });
  handle("screenshot:analyze", (shotId, budget) => {
    if (z.string().uuid().parse(shotId) !== attachmentId)
      return { id: "", empty: true };
    return screenshotTopic.analyzeScreenshot(budgetSchema.parse(budget));
  });
  handle("screenshot:remove", () => {
    captureEpoch++;
    capture.cancel();
    attachmentId = "";
    screenshotRequests.clear();
    screenshotTopic.reset();
  });
  handle("screenshot:ask", (shotId, r) => {
    if (z.string().uuid().parse(shotId) !== attachmentId)
      return { id: r?.id, empty: true };
    const parsed = requestSchema.parse(r);
    if ((parsed.audio?.byteLength ?? 0) > 8 * 1024 * 1024)
      throw new Error("Audio too large");
    const existing = screenshotRequests.get(parsed.id);
    if (existing) return existing;
    if (screenshotRequests.size >= 12)
      screenshotRequests.delete(screenshotRequests.keys().next().value!);
    const pending = screenshotTopic.ask({ ...parsed, mode: "code" });
    screenshotRequests.set(parsed.id, pending);
    return pending;
  });
  handle("screenshot:shorten", (shotId, id, budget) => {
    if (z.string().uuid().parse(shotId) !== attachmentId)
      return { id, empty: true };
    return screenshotTopic.shorten(
      z.string().uuid().parse(id),
      budgetSchema.parse(budget),
    );
  });
  handle("answer:compact", (scope, id, value) => {
    const target =
      z.enum(["concept", "screenshot"]).parse(scope) === "concept"
        ? topic
        : screenshotTopic;
    const size = z
      .object({
        width: z.number().finite().positive().max(10000),
        height: z.number().finite().positive().max(10000),
      })
      .strict()
      .parse(value);
    return target.compact(z.string().max(200).parse(id), size);
  });
  handle("session:set", (value) => {
    const context = z.string().max(2000).parse(value).trim();
    clearAll();
    topic.setSessionContext(context);
    screenshotTopic.setSessionContext(context);
  });
  handle("session:transcribe", (value) => {
    const clip = z
      .object({
        audio: z
          .instanceof(Uint8Array)
          .refine((a) => a.byteLength <= 8 * 1024 * 1024)
          .optional(),
        mime: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]).optional(),
      })
      .strict()
      .parse(value);
    return topic.transcribeContext(clip.audio, clip.mime);
  });
  handle("config", () => ({ demo }));
  handle("ask", (r) => {
    const parsed = requestSchema.parse(r);
    if ((parsed.audio?.byteLength ?? 0) > 8 * 1024 * 1024)
      throw new Error("Audio too large");
    return topic.ask(parsed);
  });
  handle("shorten", (id, b) =>
    topic.shorten(z.string().uuid().parse(id), budgetSchema.parse(b)),
  );
  handle("reset", () => clearAll());
  handle("pin", (v) => win.setAlwaysOnTop(z.boolean().parse(v)));
  handle(
    "microphone",
    async () =>
      process.platform !== "darwin" ||
      (await systemPreferences.askForMediaAccess("microphone")),
  );
  win.on("blur", () => win.webContents.send("window-blur"));
  win.on("closed", () => clearAll());
  if (process.env.VITE_DEV_SERVER_URL)
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(dirname, "../../dist/index.html"));
});
app.on("window-all-closed", () => {
  clearAll();
  app.quit();
});
app.on("before-quit", () => clearAll());

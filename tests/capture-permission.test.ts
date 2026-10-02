import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(() => "denied"),
  sources: vi.fn(),
}));
vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor() {
      throw new Error("overlay setup failure");
    }
  },
  desktopCapturer: { getSources: mocks.sources },
  ipcMain: { removeHandler: vi.fn() },
  nativeImage: {},
  screen: {
    getDisplayMatching: () => ({
      id: 2,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      size: { width: 100, height: 100 },
      scaleFactor: 1,
    }),
  },
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
    }),
  },
  systemPreferences: { getMediaAccessStatus: mocks.permission },
}));
import { RegionCapture } from "../electron/capture";

const win = () => ({
  getBounds: () => ({}),
  hide: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  isDestroyed: () => false,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permission.mockReturnValue("denied");
});
it.each(["denied", "restricted", "not-determined", "unknown", "granted"])(
  "attempts OS-controlled capture when the preliminary status is %s",
  async (status) => {
    mocks.permission.mockReturnValue(status);
    mocks.sources.mockRejectedValueOnce(new Error("backend failure"));
    const window = win();
    const result = await new RegionCapture(
      () => window as any,
      false,
    ).capture();
    expect(mocks.sources).toHaveBeenCalledOnce();
    expect(mocks.sources).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["screen"] }),
    );
    expect(window.hide).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(result.category).toBe("desktop-capturer");
    expect(result.error).not.toContain("permission denied");
  },
);
it("reads status before and after each attempt without caching", async () => {
  if (process.platform !== "darwin") return;
  const capture = new RegionCapture(() => win() as any, false);
  mocks.sources.mockResolvedValue([]);
  await capture.capture();
  mocks.permission.mockReturnValue("granted");
  await capture.capture();
  expect(mocks.permission).toHaveBeenCalledTimes(4);
  expect(mocks.permission).toHaveBeenCalledWith("screen");
  expect(mocks.sources).toHaveBeenCalledTimes(2);
});
it("still invokes capture if the diagnostic status API throws", async () => {
  mocks.permission.mockImplementationOnce(() => {
    throw new Error("status unavailable");
  });
  mocks.sources.mockResolvedValueOnce([]);
  expect(
    (await new RegionCapture(() => win() as any, false).capture()).category,
  ).toBe("source-not-found");
  expect(mocks.sources).toHaveBeenCalledOnce();
});
it("distinguishes missing sources and empty thumbnails", async () => {
  mocks.permission.mockReturnValue("granted");
  mocks.sources.mockResolvedValueOnce([]);
  const capture = new RegionCapture(() => win() as any, false);
  expect((await capture.capture()).category).toBe("source-not-found");
  mocks.sources.mockResolvedValueOnce([
    { display_id: "2", thumbnail: { isEmpty: () => true } },
  ]);
  expect((await capture.capture()).category).toBe("empty-thumbnail");
});
it.each(["unknown", "denied"])(
  "accepts OS-returned pixels despite %s status and identifies overlay failure",
  async (status) => {
    mocks.permission.mockReturnValue(status);
    mocks.sources.mockResolvedValueOnce([
      {
        display_id: "2",
        thumbnail: {
          isEmpty: () => false,
          getSize: () => ({ width: 100, height: 100 }),
        },
      },
    ]);
    const result = await new RegionCapture(() => win() as any, false).capture();
    expect(result.category).toBe("overlay-setup");
    expect(result.error).not.toContain("permission");
  },
);
it.each([new Error("SECRET_IMAGE_OR_KEY"), "SECRET_IMAGE_OR_KEY"])(
  "never logs raw error payloads (%s)",
  async (error) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mocks.permission.mockReturnValue("granted");
      mocks.sources.mockRejectedValueOnce(error);
      await new RegionCapture(() => win() as any, false).capture();
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "SECRET_IMAGE_OR_KEY",
      );
    } finally {
      log.mockRestore();
    }
  },
);

it("categorizes a stalled source request as a backend timeout", async () => {
  vi.useFakeTimers();
  try {
    mocks.permission.mockReturnValue("granted");
    mocks.sources.mockReturnValueOnce(new Promise(() => {}));
    const capture = new RegionCapture(() => win() as any, false).capture();
    await vi.advanceTimersByTimeAsync(30250);
    expect((await capture).category).toBe("desktop-capturer-timeout");
  } finally {
    vi.useRealTimers();
  }
});

it.each(["Failed to get sources", "Failed to get sources."])(
  "logs the allowlisted backend string rejection: %s",
  async (message) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      mocks.sources.mockRejectedValueOnce(message);
      const result = await new RegionCapture(
        () => win() as any,
        false,
      ).capture();
      expect(result.category).toBe("desktop-capturer");
      expect(JSON.stringify(log.mock.calls)).toContain(message);
    } finally {
      log.mockRestore();
    }
  },
);

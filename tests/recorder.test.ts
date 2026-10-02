import { it, expect, vi, afterEach } from "vitest";
import { Recorder } from "../src/recorder";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("releases a microphone that arrives after pointer exit without starting recording", async () => {
  let resolve!: (stream: unknown) => void;
  const stop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: () => new Promise((r) => (resolve = r)) },
  });
  const recorder = new Recorder();
  const pending = recorder.start(vi.fn());
  expect(await recorder.stop()).toBeUndefined();
  resolve({ getTracks: () => [{ stop }] });
  expect(await pending).toBe(false);
  expect(stop).toHaveBeenCalledOnce();
});
it("propagates microphone denial for useful UI handling", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    },
  });
  await expect(new Recorder().start(vi.fn())).rejects.toHaveProperty(
    "name",
    "NotAllowedError",
  );
});
it("ignores silence, enforces thirty seconds, and releases resources", async () => {
  vi.useFakeTimers();
  const stop = vi.fn(),
    close = vi.fn(async () => {}),
    limit = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop }] }),
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = async () => {};
      close = close;
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return {
          fftSize: 1024,
          getFloatTimeDomainData: (data: Float32Array) => data.fill(0),
        };
      }
    },
  );
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported() {
        return true;
      }
      state = "recording";
      mimeType = "audio/webm";
      onstop = () => {};
      ondataavailable = () => {};
      start() {}
      stop() {
        this.state = "inactive";
        this.onstop();
      }
    },
  );
  const r = new Recorder();
  await r.start(limit);
  await vi.advanceTimersByTimeAsync(30000);
  expect(limit).toHaveBeenCalledOnce();
  expect(await r.stop()).toBeUndefined();
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

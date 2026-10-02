import { afterEach, expect, it, vi } from "vitest";
import { withTimeout } from "../src/operation";
afterEach(() => vi.useRealTimers());
it("settles success and failure without leaving a timeout", async () => {
  vi.useFakeTimers();
  await expect(withTimeout(Promise.resolve(1), 5000)).resolves.toBe(1);
  await expect(
    withTimeout(Promise.reject(new Error("failed")), 5000),
  ).rejects.toThrow("failed");
  expect(vi.getTimerCount()).toBe(0);
});
it("releases an unanswered operation and ignores a late response", async () => {
  vi.useFakeTimers();
  let finish!: (value: string) => void;
  const pending = withTimeout(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
    5000,
  );
  const check = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(5000);
  await check;
  finish("late");
  await expect(withTimeout(Promise.resolve("retry"), 5000)).resolves.toBe(
    "retry",
  );
  expect(vi.getTimerCount()).toBe(0);
});

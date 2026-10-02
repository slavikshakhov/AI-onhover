/** Partition only at source-line boundaries; joining pages restores the exact source. */
export function codePages(
  code: string,
  fits: (text: string) => boolean,
): string[] | undefined {
  if (fits(code)) return [code];
  const lines = code.split("\n");
  if (lines.length < 2) return undefined;
  let low = 1,
    high = lines.length - 1,
    last = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(lines.slice(0, mid).join("\n"))) {
      last = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  if (!last || !fits(lines.slice(last).join("\n"))) return undefined;
  // Prefer blank lines and ends of blocks, provided BOTH complete pages fit.
  for (let split = last; split > 0; split--) {
    if (!fits(lines.slice(split).join("\n"))) break;
    if (
      !lines[split - 1].trim() ||
      /^[}\])][;,]?$/.test(lines[split - 1].trim())
    )
      return [lines.slice(0, split).join("\n"), lines.slice(split).join("\n")];
  }
  return [lines.slice(0, last).join("\n"), lines.slice(last).join("\n")];
}

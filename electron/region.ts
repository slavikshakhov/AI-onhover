export type Region = { x: number; y: number; width: number; height: number };
export function cropRegion(
  region: Region,
  viewport: { width: number; height: number },
  image: { width: number; height: number },
): Region {
  const left = Math.max(0, Math.min(viewport.width, region.x));
  const top = Math.max(0, Math.min(viewport.height, region.y));
  const right = Math.max(
    left,
    Math.min(viewport.width, region.x + region.width),
  );
  const bottom = Math.max(
    top,
    Math.min(viewport.height, region.y + region.height),
  );
  if (right - left < 8 || bottom - top < 8)
    throw new Error("Select a region at least 8 pixels wide and high.");
  const x = Math.floor((left * image.width) / viewport.width),
    y = Math.floor((top * image.height) / viewport.height);
  return {
    x,
    y,
    width: Math.min(
      image.width - x,
      Math.ceil((right * image.width) / viewport.width) - x,
    ),
    height: Math.min(
      image.height - y,
      Math.ceil((bottom * image.height) / viewport.height) - y,
    ),
  };
}

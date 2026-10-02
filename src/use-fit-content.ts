import { useLayoutEffect, useState, type RefObject } from "react";

// Measure actual wrapping at the fixed readable size. Never change window bounds.
export function useFitContent(
  viewport: RefObject<HTMLElement>,
  source: RefObject<HTMLElement>,
  identity: unknown,
) {
  const [limit, setLimit] = useState(false);
  useLayoutEffect(() => {
    const area = viewport.current;
    const text = source.current;
    if (!area || !text) return;
    const measure = () =>
      setLimit(
        text.getBoundingClientRect().height > area.clientHeight + 1 ||
          text.scrollWidth > area.clientWidth + 1,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(text);
    measure();
    return () => observer.disconnect();
  }, [identity]);
  return limit;
}

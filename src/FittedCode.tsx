import { useLayoutEffect, useRef } from "react";
import type { CodeResult } from "./shared";

export function FittedCode({
  result,
}: {
  result: CodeResult;
  screenshot: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (area.current) {
      area.current.scrollTop = 0;
      area.current.scrollLeft = 0;
    }
  }, [result.answer]);
  return (
    <div
      className="solution-viewport"
      ref={area}
      tabIndex={0}
      aria-label="Code answer"
    >
      <pre className="solution-text display-source">
        <code>{result.answer!.code}</code>
      </pre>
    </div>
  );
}

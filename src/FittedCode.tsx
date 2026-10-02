import { useLayoutEffect, useRef, useState } from "react";
import type { Answer, CodeResult } from "./shared";
import { codePages } from "./code-pages";
import { DwellAction } from "./DwellAction";

type Cached = {
  pending?: Promise<CodeResult>;
  answer?: Answer;
  error?: string;
};
let cache = new WeakMap<Answer, Cached>();
export function clearFittedCodeCache() {
  cache = new WeakMap();
}

export function FittedCode({
  result,
  screenshot,
}: {
  result: CodeResult;
  screenshot: boolean;
}) {
  const full = result.answer!;
  const area = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLPreElement>(null);
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState<string[]>();
  const [page, setPage] = useState(0);
  const [waiting, setWaiting] = useState(true);
  let entry = cache.get(full);
  if (!entry) {
    entry = {};
    cache.set(full, entry);
  }
  const stored = entry;
  useLayoutEffect(() => {
    let alive = true;
    const viewport = area.current!;
    const measure = () => {
      if (viewport.clientHeight <= 0 || viewport.clientWidth <= 0) {
        setPages(undefined);
        setWaiting(false);
        return;
      }
      const fits = (text: string) => {
        source.current!.textContent = text;
        return (
          source.current!.getBoundingClientRect().height <=
            viewport.clientHeight + 0.1 &&
          source.current!.scrollWidth <= viewport.clientWidth
        );
      };
      const original = codePages(full.code, fits);
      const compact =
        !original && stored.answer
          ? codePages(stored.answer.code, fits)
          : undefined;
      source.current!.textContent = full.code;
      setPages(original ?? compact);
      setPage(0);
      if (original || compact) {
        setWaiting(false);
        return;
      }
      if (stored.answer || stored.error || !result.fitId) {
        setWaiting(false);
        return;
      }
      setWaiting(true);
      if (!stored.pending) {
        stored.pending = window.assistant
          .compact(screenshot ? "screenshot" : "concept", result.fitId, {
            width: viewport.clientWidth,
            height: viewport.clientHeight,
          })
          .then((response) => {
            if (response.answer?.code && !response.answer.incomplete)
              stored.answer = response.answer;
            else
              stored.error =
                response.error ?? "A complete compact answer was unavailable.";
            return response;
          })
          .catch(() => {
            stored.error = "Could not create a compact answer.";
            return { error: stored.error };
          });
      }
      void stored.pending.then(() => {
        if (alive) setRevision((n) => n + 1);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [full, revision, result.fitId, screenshot]);
  return (
    <>
      <div className="solution-viewport" ref={area}>
        <div className="code-measure" aria-hidden="true">
          <pre ref={source} className="solution-text">
            {full.code}
          </pre>
        </div>
        {pages ? (
          <pre className="solution-text display-source">
            <code>{pages[Math.min(page, pages.length - 1)]}</code>
          </pre>
        ) : (
          <div className="fit-message" role={waiting ? "status" : "alert"}>
            {waiting
              ? "Preparing a more compact example…"
              : `${stored.error ? stored.error + " " : ""}The complete answer cannot fit in two readable pages at this window size. No truncated code is shown. Enlarge the window to view more.`}
          </div>
        )}
      </div>
      <div className="code-page-navigation" aria-label="Code pages">
        {pages?.length === 2 && (
          <>
            <span>{page + 1} of 2</span>
            <DwellAction onActivate={() => setPage((p) => 1 - p)}>
              {page === 0 ? "Next" : "Back"}
            </DwellAction>
          </>
        )}
      </div>
    </>
  );
}

import { FittedCode } from "./FittedCode";
import { useFitContent } from "./use-fit-content";
import { outputText } from "./shared";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  type Answer,
  type DetailResult,
  type Selection,
  type CodeResult,
  overflows,
} from "./shared";
const keyOf = (path: number[]) => path.join(".");
const isAncestor = (parent: number[], path: number[]) =>
  parent.every((n, i) => path[i] === n) && parent.length <= path.length;

function HoverAction({
  children,
  onActivate,
  disabled = false,
}: {
  children: React.ReactNode;
  onActivate: () => void;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const armed = useRef(false);
  const stop = () => {
    clearTimeout(timer.current);
    armed.current = false;
  };
  useEffect(() => stop, []);
  const start = () => {
    if (disabled || armed.current) return;
    armed.current = true;
    timer.current = setTimeout(onActivate, 600);
  };
  return (
    <button
      disabled={disabled}
      className="detail-action"
      onPointerMove={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
      onClick={onActivate}
    >
      {children}
    </button>
  );
}

function Concept({
  label,
  path,
  active,
  selected,
  activate,
  children,
  enabled,
}: {
  label: string;
  path: number[];
  active: boolean;
  selected: boolean;
  activate: () => void;
  children?: React.ReactNode;
  enabled: boolean;
}) {
  const row = useRef<HTMLButtonElement>(null);
  const dwell = useRef<ReturnType<typeof setTimeout>>();
  const armed = useRef(false);
  const cancel = () => {
    clearTimeout(dwell.current);
    armed.current = false;
  };
  useEffect(
    () => () => {
      cancel();
    },
    [],
  );
  const arm = () => {
    if (!enabled || (active && selected) || armed.current) return;
    armed.current = true;
    dwell.current = setTimeout(() => {
      armed.current = false;
      if (
        row.current?.matches(":hover") ||
        document.activeElement === row.current
      )
        activate();
    }, 600);
  };
  return (
    <li
      className={`summary-bullet ${active ? "expanded" : ""} ${selected ? "active-selection" : ""}`}
      data-path={keyOf(path)}
      onPointerMove={(e) => {
        if (
          (e.target as Element).closest("[data-path]") === e.currentTarget &&
          (e.movementX || e.movementY)
        )
          arm();
      }}
      onPointerLeave={cancel}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) cancel();
      }}
    >
      <button
        ref={row}
        className="bullet-label"
        aria-expanded={active}
        aria-current={selected ? "true" : undefined}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (e.movementX || e.movementY) arm();
        }}
        onPointerLeave={cancel}
        onFocus={(event) => {
          if (event.target === event.currentTarget) arm();
        }}
      >
        {label}
      </button>
      {children}
    </li>
  );
}

export function AnswerPanel({
  answer,
  version,
  panel,
  content,
  fallback,
  enabled,
  demo,
  selection,
  onSelect,
  codeView,
  onReturn,
  screenshotView,
  onScreenshotReturn,
  captureFrozen,
  sessionView,
}: {
  answer?: Answer;
  version: string;
  panel: RefObject<HTMLDivElement>;
  content: RefObject<HTMLDivElement>;
  fallback: boolean;
  enabled: boolean;
  demo?: boolean;
  selection?: Selection;
  onSelect: (selection: Selection) => void;
  codeView?: CodeResult & { loading?: boolean };
  onReturn: () => void;
  screenshotView?: CodeResult & { loading?: boolean };
  onScreenshotReturn: () => void;
  captureFrozen: boolean;
  sessionView?: React.ReactNode;
}) {
  const [branch, setBranch] = useState<number[]>([]);
  const [results, setResults] = useState<Record<string, DetailResult>>({});
  const cache = useRef(new Map<string, Promise<DetailResult>>());
  const alive = useRef(true);
  const [tooSmall, setTooSmall] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    alive.current = true;
    const ro = new ResizeObserver(() => {
      setSize((n) => n + 1);
      setTooSmall(false);
    });
    if (panel.current) ro.observe(panel.current);
    return () => {
      alive.current = false;
      ro.disconnect();
    };
  }, []);
  const activate = (path: number[]) => {
    onSelect({ path, label: labelFor(path) });
    setBranch(path);
    setTooSmall(false);
    const key = keyOf(path);
    let pending = cache.current.get(key);
    if (!pending) {
      pending = window.assistant
        .details(version, path)
        .catch(() => ({ error: "Details unavailable for this answer." }));
      cache.current.set(key, pending);
      pending.then((value) => {
        if (alive.current)
          setResults((old) => ({
            ...old,
            [key]:
              value.children || value.error
                ? value
                : { error: "This answer is no longer current." },
          }));
      });
    }
  };
  const childrenFor = (path: number[]) => results[keyOf(path)];
  const labelFor = (path: number[]): string =>
    path.length === 1
      ? answer!.fragments[path[0]]
      : (childrenFor(path.slice(0, -1))?.children?.[path.at(-1)!] ?? "");
  const renderNode = (
    label: string,
    path: number[],
    expand = true,
  ): React.ReactNode => {
    const active = expand && isAncestor(path, branch);
    const result = childrenFor(path);
    let children = result?.children;
    return (
      <Concept
        key={keyOf(path)}
        label={label}
        path={path}
        active={active}
        selected={keyOf(selection?.path ?? []) === keyOf(path)}
        activate={() => activate(path)}
        enabled={
          enabled && !fallback && !codeView && !screenshotView && !captureFrozen
        }
      >
        {active &&
          (children ? (
            <ul className="concept-children">
              {children.map((child, index) =>
                renderNode(child, [...path, index]),
              )}
            </ul>
          ) : (
            <div className="detail-loading" role="status">
              {result?.error ?? "◌ Loading concepts…"}
            </div>
          ))}
      </Concept>
    );
  };
  useLayoutEffect(() => {
    if (!branch.length || !overlay.current) return;
    if (
      overlay.current.getBoundingClientRect().height <=
        overlay.current.parentElement!.clientHeight + 1 &&
      overlay.current.scrollWidth <=
        overlay.current.parentElement!.clientWidth + 1
    ) {
      setTooSmall(false);
      return;
    }
    setTooSmall(true);
  }, [branch, results, size]);
  const summary = (expand: boolean) => (
    <>
      <h1>{answer!.title}</h1>
      {answer!.code && (
        <>
          <div className="code-label">
            {answer!.language}
            {answer!.incomplete ? " · Incomplete snippet" : ""}
          </div>
          <pre>
            <code>{answer!.code}</code>
          </pre>
        </>
      )}
      <ul className="concept-list">
        {answer!.fragments.map((s, i) => renderNode(s, [i], expand))}
      </ul>
    </>
  );
  return (
    <section className="answer-shell" aria-label="Answer" aria-live="polite">
      {sessionView}
      <div
        ref={panel}
        className={`answer-panel ${fallback || codeView || screenshotView ? "measuring" : ""} ${branch.length ? "summary-under-detail" : ""}`}
        aria-hidden={
          !!branch.length || fallback || !!codeView || !!screenshotView
        }
      >
        <div ref={content}>
          {answer ? (
            summary(false)
          ) : (
            <div className="welcome">
              <span className="spark">✳</span>
              <h1>A little space to think.</h1>
              <p>
                {demo
                  ? "Try a simulated conversation about JavaScript arrays. No microphone or network needed."
                  : "Hold your pointer over a mode, ask aloud, then move away."}
              </p>
            </div>
          )}
        </div>
      </div>
      {fallback && !branch.length && !codeView && !screenshotView && (
        <div className="fallback">
          <strong>Answer needs more space</strong>
          <p>Enlarge this window to see the complete answer.</p>
        </div>
      )}
      {!!branch.length && answer && (
        <>
          <div
            className={`answer-panel details-layer  ${codeView || screenshotView ? "measuring" : ""}`}
          >
            <div className="detail-navigation">
              <HoverAction
                onActivate={() => {
                  setBranch(branch.slice(0, -1));
                  setTooSmall(false);
                }}
              >
                ← Hover to return
              </HoverAction>
            </div>
            <div className="tree-viewport">
              <div
                ref={overlay}
                className={
                  tooSmall ? "tree-content needs-space" : "tree-content"
                }
              >
                {summary(true)}
              </div>
              {tooSmall && (
                <div className="fit-message" role="alert">
                  Enlarge the window to see this expanded branch.
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {codeView && !screenshotView && (
        <CodePanel result={codeView} onReturn={onReturn} />
      )}
      {screenshotView && (
        <CodePanel
          screenshot
          result={screenshotView}
          onReturn={onScreenshotReturn}
          returnLabel="Return to explanation"
        />
      )}
    </section>
  );
}

export function CodePanel({
  result,
  onReturn,
  returnLabel = "Return to explanation",
  screenshot = false,
}: {
  result: CodeResult & { loading?: boolean };
  onReturn: () => void;
  returnLabel?: string;
  screenshot?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const fullContent = useRef<HTMLDivElement>(null);
  const measuredOverflow = useFitContent(body, fullContent, result);
  const overflow = measuredOverflow && !result.answer?.code;
  useLayoutEffect(() => {
    if (body.current) {
      body.current.scrollTop = 0;
      body.current.scrollLeft = 0;
    }
  }, [result.answer]);
  if (!screenshot && result.answer?.incomplete) {
    return (
      <div className="code-panel">
        <HoverAction onActivate={onReturn}>← {returnLabel}</HoverAction>
        <span role="alert">
          Incomplete code example. No partial solution was accepted.
        </span>
      </div>
    );
  }

  if (
    result.answer?.code &&
    !result.answer.incomplete &&
    (!screenshot ||
      result.answer.intent === "implement" ||
      result.answer.intent === "debug")
  ) {
    return (
      <div className="code-panel solution-panel">
        <div className="panel-controls">
          <HoverAction onActivate={onReturn}>← {returnLabel}</HoverAction>
        </div>
        <FittedCode
          key={result.answer.code}
          result={result}
          screenshot={screenshot}
        />
      </div>
    );
  }
  return (
    <div className="code-panel">
      <HoverAction onActivate={onReturn}>← {returnLabel}</HoverAction>
      <div
        ref={body}
        className={`code-content ${screenshot ? "screenshot-content" : ""} ${result.answer?.code ? "scrollable-code" : ""}`}
      >
        <div
          ref={fullContent}
          className={`fit-content ${overflow ? "needs-space" : ""}`}
        >
          {result.loading ? (
            <span role="status">Processing answer…</span>
          ) : result.error ? (
            <span role="alert">{result.error}</span>
          ) : result.answer ? (
            <>
              {(!screenshot || result.answer.intent !== "output") &&
                result.answer.title && <h1>{result.answer.title}</h1>}
              {!!result.answer.outputs?.length && (
                <ul className="output-results">
                  {result.answer.outputs.map((output, i) => (
                    <li key={i}>{outputText(output)}</li>
                  ))}
                </ul>
              )}
              {result.answer.code && (
                <>
                  <div className="code-label">
                    {result.answer.language}
                    {result.answer.incomplete ? " · Incomplete snippet" : ""}
                  </div>
                  <pre>
                    <code>{result.answer.code}</code>
                  </pre>
                </>
              )}
              <ul>
                {result.answer.fragments.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          ) : (
            <span>Ask about the attached screenshot.</span>
          )}
        </div>
        {overflow && (
          <div className="fit-message" role="alert">
            Enlarge the window to see the complete answer.
          </div>
        )}
      </div>
    </div>
  );
}

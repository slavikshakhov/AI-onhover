import { withTimeout } from "./operation";
import { DwellAction } from "./DwellAction";
import { clearFittedCodeCache } from "./FittedCode";
import { AnswerPanel } from "./AnswerPanel";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type Answer,
  type Bridge,
  type Mode,
  type Selection,
  type CodeResult,
  type ScreenshotAttachment,
  budgetFor,
  overflows,
} from "./shared";
import { HoverGate } from "./hover";
import { Recorder } from "./recorder";
import "./style.css";
declare global {
  interface Window {
    assistant: Bridge;
  }
}
type Phase = "Ready" | "Listening" | "Processing" | "Error";
function Target({
  label,
  detail,
  kind,
  delay,
  disabled,
  onStart,
  onStop,
}: {
  label: string;
  detail: string;
  kind: string;
  delay: number;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const handlers = useRef({ onStart, onStop });
  handlers.current = { onStart, onStop };
  const [arming, setArming] = useState(false);
  const gate = useRef<HoverGate>();
  if (!gate.current)
    gate.current = new HoverGate(
      delay,
      () => {
        setArming(false);
        handlers.current.onStart();
      },
      () => handlers.current.onStop(),
    );
  useEffect(() => {
    if (disabled) {
      gate.current?.cancel();
      setArming(false);
    }
  }, [disabled]);
  useEffect(() => () => gate.current?.cancel(), []);
  const enter = () => {
    gate.current!.enter(!disabled);
    if (!disabled) setArming(true);
  };
  const leave = () => {
    gate.current!.leave();
    setArming(false);
  };
  useEffect(() => {
    const cancel = () => {
      gate.current?.cancel();
      setArming(false);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  return (
    <button
      className={`target ${kind} ${arming ? "arming" : ""}`}
      style={{ "--dwell": `${delay}ms` } as React.CSSProperties}
      aria-disabled={disabled}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onBlur={leave}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          enter();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          leave();
        }
      }}
    >
      <strong>{label}</strong>
      <span>{detail}</span>
      <i />
    </button>
  );
}
function App() {
  const [sessionContext, setSessionContext] = useState("");
  const [contextDraft, setContextDraft] = useState("");
  const [contextOpen, setContextOpen] = useState(true);
  const [contextSaving, setContextSaving] = useState(false);
  const contextTicket = useRef(0);
  const [demo, setDemo] = useState<boolean>();
  const [configError, setConfigError] = useState(false);
  const configTicket = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("Ready");
  const phaseRef = useRef<Phase>("Ready");
  const [message, setMessage] = useState("Hover. Ask. Keep your flow.");
  const [answer, setAnswer] = useState<Answer>();
  const [answerVersion, setAnswerVersion] = useState("");
  const [selection, setSelection] = useState<Selection>();
  const [codeView, setCodeView] = useState<
    CodeResult & { loading?: boolean }
  >();
  const codeTicket = useRef(0);
  const savedCode = useRef<{ key: string; result: CodeResult }>();
  useEffect(() => {
    codeTicket.current++;
    savedCode.current = undefined;
    setSelection(undefined);
    setCodeView(undefined);
  }, [answerVersion]);

  const [fallback, setFallback] = useState(false);
  const [pin, setPin] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const recorder = useRef(new Recorder());
  const epoch = useRef(0);
  const request = useRef("");
  const recording = useRef<"explain" | "screenshot" | "context">();
  const demoTimer = useRef<ReturnType<typeof setTimeout>>();
  const [revision, setRevision] = useState(0);
  const [attachment, setAttachment] = useState<ScreenshotAttachment>();
  const captureOperation = useRef(0);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [afterCapture, setAfterCapture] = useState(false);
  const [screenshotActive, setScreenshotActive] = useState(false);
  const screenshotActiveRef = useRef(false);
  screenshotActiveRef.current = screenshotActive;
  const [screenshotPending, setScreenshotPending] = useState(false);
  const [screenshotResult, setScreenshotResult] = useState<CodeResult>();
  const screenshotRequest = useRef("");
  const screenshotTicket = useRef(0);
  const recordingShot = useRef("");

  const state = (p: Phase, m: string) => {
    phaseRef.current = p;
    setPhase(p);
    setMessage(m);
  };
  const budget = () =>
    budgetFor(
      panel.current?.clientWidth ?? 380,
      panel.current?.clientHeight ?? 160,
    );
  const loadConfig = async () => {
    const ticket = ++configTicket.current;
    setConfigError(false);
    try {
      const config = await withTimeout(window.assistant.config(), 5000);
      if (ticket !== configTicket.current) return;
      setDemo(config.demo);
    } catch {
      if (ticket !== configTicket.current) return;
      setConfigError(true);
    }
  };
  useEffect(() => {
    void loadConfig();
    return () => {
      configTicket.current++;
    };
  }, []);
  const discard = () => {
    if (recording.current) epoch.current++;
    recording.current = undefined;
    clearTimeout(demoTimer.current);
    void recorder.current.stop(true);
    if (phaseRef.current === "Listening")
      state("Ready", "Recording discarded. Leave and re-enter to ask.");
  };
  useEffect(() => {
    const blur = () => discard();
    const off = window.assistant.onBlur(blur);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", blur);
    return () => {
      off();
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", blur);
      discard();
    };
  }, []);
  useEffect(() => {
    if (phase !== "Listening") return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const finish = async () => {
    const mode = recording.current;
    if (!mode) return;
    recording.current = undefined;
    clearTimeout(demoTimer.current);
    const token = epoch.current;
    const dictationTicket = contextTicket.current;
    state("Processing", "Preparing your question…");
    try {
      const clip = demo ? undefined : await recorder.current.stop();
      if (token !== epoch.current) return;
      if (!demo && !clip) {
        state("Ready", "No speech detected. Try speaking a little louder.");
        return;
      }
      if (mode === "context") {
        const result = await window.assistant.transcribeContext(clip ?? {});
        if (
          token !== epoch.current ||
          dictationTicket !== contextTicket.current
        )
          return;
        if (result.error) state("Error", result.error);
        else {
          if (result.text) setContextDraft(result.text);
          state("Ready", "Review the context, then hover Apply.");
        }
        return;
      }
      const id = crypto.randomUUID();
      if (mode === "screenshot") {
        const shotId = recordingShot.current;
        const ticket = ++screenshotTicket.current;
        screenshotRequest.current = id;

        state(
          "Processing",
          demo
            ? "Simulating screenshot answer…"
            : "Transcribing screenshot question…",
        );
        const result = await window.assistant.askScreenshot(shotId, {
          id,
          mode: "code",
          budget: budget(),
          ...clip,
        });
        if (ticket !== screenshotTicket.current || token !== epoch.current)
          return;
        setScreenshotPending(false);
        if (result.answer) {
          setScreenshotResult({ answer: result.answer, fitId: result.fitId });

          if (screenshotActiveRef.current && !recording.current)
            state(
              "Ready",
              "Screenshot answer ready. Explain returns to the saved explanation.",
            );
        } else if (result.error) {
          setScreenshotResult({ error: result.error });
          if (screenshotActiveRef.current && !recording.current)
            state("Error", result.error);
        } else if (screenshotActiveRef.current && !recording.current)
          state("Ready", "No screenshot question detected.");
        return;
      }
      request.current = id;

      state(
        "Processing",
        demo ? "Simulating an answer…" : "Transcribing and thinking…",
      );
      const result = await window.assistant.ask({
        id,
        mode,
        budget: budget(),
        ...clip,
      });
      if (token !== epoch.current || request.current !== id) return;
      if (result.error) state("Error", result.error);
      else if (result.answer) {
        setAnswerVersion(result.version ?? id);
        setAnswer(result.answer);
        setFallback(false);
        state(
          "Ready",
          "Hover an item to select it, then hover Code for an example.",
        );
      } else state("Ready", "No question detected. Try again.");
    } catch {
      if (
        token !== epoch.current ||
        (mode === "context" && dictationTicket !== contextTicket.current)
      )
        return;
      if (mode === "screenshot") setScreenshotPending(false);
      if (token === epoch.current)
        state("Error", "Could not submit the question. Please try again.");
    }
  };
  const start = async (mode: "explain" | "screenshot" | "context") => {
    if (!enabled || phaseRef.current === "Processing" || recording.current)
      return;
    if (mode === "screenshot") {
      if (!attachment || screenshotPending) return;
      recordingShot.current = attachment.id;
      setScreenshotActive(true);
    } else {
      setCodeView(undefined);
      codeTicket.current++;
    }
    if (mode !== "context") setContextOpen(false);
    const token = epoch.current;
    recording.current = mode;
    state(
      "Listening",
      demo
        ? "SIMULATED recording · leave the square to submit"
        : "Microphone starting…",
    );
    if (demo) {
      demoTimer.current = setTimeout(() => void finish(), 30000);
      return;
    }
    try {
      const started = await recorder.current.start(() => void finish());
      if (token !== epoch.current || recording.current !== mode) return;
      if (started)
        state("Listening", "● Recording · leave the square to submit");
    } catch (e) {
      if (token !== epoch.current) return;
      recording.current = undefined;
      state("Error", microphoneError(e));
    }
  };
  const showCode = async () => {
    if (
      !answer ||
      !answerVersion ||
      (phaseRef.current === "Processing" && !screenshotPending) ||
      phaseRef.current === "Listening"
    )
      return;
    setContextOpen(false);
    setScreenshotActive(false);
    const target = {
      version: answerVersion,
      path: [...(selection?.path ?? [])],
    };
    const key = target.version + ":" + target.path.join(".");
    if (savedCode.current?.key === key) {
      setCodeView(savedCode.current.result);
      state(
        "Ready",
        "Cached example. Hover Return to explanation to continue.",
      );
      return;
    }
    const ticket = ++codeTicket.current;
    const token = epoch.current;
    setCodeView({ loading: true });
    state("Processing", "Generating code for the selected item…");
    try {
      const result = await window.assistant.code(
        target.version,
        target.path,
        budget(),
      );
      if (ticket !== codeTicket.current || token !== epoch.current) return;
      savedCode.current = { key, result };
      setCodeView(
        result.answer || result.error
          ? result
          : { error: "This explanation is no longer current." },
      );
      state(
        result.error ? "Error" : "Ready",
        result.error ?? "Hover Return to explanation to continue exploring.",
      );
    } catch {
      if (ticket === codeTicket.current) {
        setCodeView({ error: "Could not request code." });
        state("Error", "Could not request code.");
      }
    }
  };
  const returnToExplanation = () => {
    codeTicket.current++;
    setCodeView(undefined);
    state("Ready", "Explanation restored. Hover another item to select it.");
  };
  const returnFromScreenshot = () => {
    setContextOpen(false);
    setScreenshotActive(false);
    setCodeView(undefined);
    state(
      "Ready",
      "Explanation restored. Leave Explain and re-enter to ask a new question.",
    );
  };
  const captureScreenshot = async () => {
    if (
      captureBusy ||
      phaseRef.current === "Listening" ||
      (phaseRef.current === "Processing" && !screenshotPending)
    )
      return;
    setContextOpen(false);
    const operation = ++captureOperation.current;
    setCaptureBusy(true);
    setAfterCapture(true);
    state("Ready", "Select a screen region. Capture does not record audio.");
    const token = epoch.current;
    try {
      const result = await window.assistant.capture();
      if (token !== epoch.current || operation !== captureOperation.current)
        return;
      if (result.attachment) {
        const ticket = ++screenshotTicket.current;
        setAttachment(result.attachment);
        setScreenshotResult(undefined);
        setScreenshotPending(true);
        screenshotRequest.current = "";
        setScreenshotActive(true);
        screenshotActiveRef.current = true;
        setCaptureBusy(false);
        state("Processing", "Analyzing screenshot… No microphone is active.");
        const initial = await window.assistant.analyzeScreenshot(
          result.attachment.id,
          budget(),
        );
        if (token !== epoch.current || ticket !== screenshotTicket.current)
          return;
        setScreenshotPending(false);
        setScreenshotResult(
          initial.answer || initial.error
            ? initial
            : { error: "Screenshot analysis is no longer current." },
        );
        screenshotRequest.current = initial.id;
        if (screenshotActiveRef.current && !recording.current)
          state(
            initial.error ? "Error" : "Ready",
            initial.error ??
              "Screenshot answer ready. Ask about screenshot for a follow-up.",
          );
      } else
        state(
          result.error ? "Error" : "Ready",
          result.error ?? "Capture cancelled.",
        );
    } catch {
      if (token === epoch.current && operation === captureOperation.current) {
        setScreenshotPending(false);
        state(
          "Error",
          "Screenshot capture or analysis failed. Please try again.",
        );
      }
    } finally {
      if (token === epoch.current && operation === captureOperation.current)
        setCaptureBusy(false);
    }
  };
  const removeScreenshot = () => {
    screenshotTicket.current++;
    setScreenshotPending(false);
    setAttachment(undefined);
    setScreenshotResult(undefined);
    setScreenshotActive(false);
    screenshotRequest.current = "";
    void window.assistant.removeScreenshot();
    state("Ready", "Screenshot removed.");
  };
  const reset = (remote = true) => {
    clearFittedCodeCache();
    discard();
    epoch.current++;
    request.current = "";
    captureOperation.current++;
    setCaptureBusy(false);
    setAfterCapture(false);

    codeTicket.current++;
    savedCode.current = undefined;
    setSelection(undefined);
    setCodeView(undefined);
    screenshotTicket.current++;
    setScreenshotPending(false);
    setAttachment(undefined);
    setScreenshotResult(undefined);
    setScreenshotActive(false);
    screenshotRequest.current = "";
    setAnswerVersion("");
    setAnswer(undefined);
    setFallback(false);
    state("Ready", "New topic. Hover a square to begin.");
    if (remote)
      void window.assistant
        .reset()
        .catch(() => state("Error", "Could not reset. Restart the app."));
  };
  const applyContext = async (value = contextDraft) => {
    reset(false);
    setContextSaving(true);
    state("Processing", "Applying session context…");
    const token = epoch.current;
    try {
      await withTimeout(window.assistant.setSessionContext(value.trim()), 5000);
      if (token !== epoch.current) return;
      setSessionContext(value.trim());
      setContextDraft(value.trim());
      setContextOpen(false);
      state(
        "Ready",
        value.trim() ? "Session context applied." : "Session context cleared.",
      );
    } catch {
      if (token === epoch.current)
        state("Error", "Could not apply session context. Try again.");
    } finally {
      setContextSaving(false);
    }
  };
  const editContext = () => {
    contextTicket.current++;
    discard();
    setContextDraft(sessionContext);
    setContextOpen(true);
  };
  useEffect(() => {
    const observer = new ResizeObserver(() => setRevision((x) => x + 1));
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [answerVersion]);
  useLayoutEffect(() => {
    if (
      codeView ||
      screenshotActive ||
      captureBusy ||
      !answer ||
      !content.current ||
      !panel.current
    )
      return;

    setFallback(overflows(panel.current));
  }, [answer, revision, !!codeView, screenshotActive, captureBusy]);
  const setup = async () => {
    if (demo) {
      setEnabled(true);
      return;
    }
    try {
      if (!(await window.assistant.microphone()))
        throw new DOMException("Denied", "NotAllowedError");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setEnabled(true);
      state("Ready", "Microphone ready. Hover a square to ask.");
    } catch (e) {
      state("Error", microphoneError(e));
    }
  };
  return (
    <main
      onPointerMove={(e) => {
        if (
          afterCapture &&
          !captureBusy &&
          !(e.target as Element).closest("button")
        )
          setAfterCapture(false);
      }}
    >
      <header>
        <div className="brand">
          hover<span> / ask ai</span>
        </div>
        <button
          className="pin"
          aria-pressed={pin}
          onClick={() => {
            void window.assistant.pin(!pin).then(() => setPin(!pin));
          }}
        >
          ↑ {pin ? "Pinned" : "Pin"}
        </button>
      </header>
      <div className="meta">
        <span className={`status ${phase.toLowerCase()}`}>
          {phase === "Listening" ? "● " : ""}
          {phase}
          {phase === "Listening" ? ` · ${seconds}/30s` : ""}
        </span>
        <span className="badge">
          {demo === undefined
            ? configError
              ? "Connection unavailable"
              : "Connecting"
            : demo
              ? "DEMO · SIMULATED"
              : "OPENAI · LIVE"}
        </span>
      </div>
      <div className="session-summary">
        <span title={sessionContext}>
          Session: {sessionContext || "No defaults"}
        </span>
        <DwellAction
          disabled={contextOpen || contextSaving || captureBusy}
          onActivate={editContext}
        >
          Edit context
        </DwellAction>
      </div>
      <AnswerPanel
        key={answerVersion}
        answer={answer}
        version={answerVersion}
        panel={panel}
        content={content}
        fallback={fallback}
        enabled={phase === "Ready" || phase === "Error"}
        demo={demo}
        selection={selection}
        onSelect={setSelection}
        codeView={codeView}
        onReturn={returnToExplanation}
        screenshotView={
          screenshotActive
            ? { ...screenshotResult, loading: screenshotPending }
            : undefined
        }
        onScreenshotReturn={returnFromScreenshot}
        captureFrozen={captureBusy || contextOpen}
        sessionView={
          contextOpen ? (
            <section className="session-editor" aria-label="Session context">
              <label htmlFor="session-context">Session context</label>
              <textarea
                id="session-context"
                value={contextDraft}
                maxLength={2000}
                disabled={contextSaving}
                onChange={(e) => setContextDraft(e.target.value)}
                placeholder="Front end: Angular and TypeScript; back end: Java and Spring Boot."
              />
              <p>
                Optional defaults. Apply or skip, or hover Explain/Capture to
                begin. Explicit questions and screenshots take precedence.
              </p>
              <div className="session-actions">
                <DwellAction
                  disabled={contextSaving || phase === "Listening"}
                  onActivate={() => void applyContext()}
                >
                  Apply
                </DwellAction>
                <DwellAction
                  disabled={contextSaving}
                  onActivate={() => {
                    contextTicket.current++;
                    discard();
                    setContextOpen(false);
                    if (phaseRef.current === "Processing" && !request.current)
                      state("Ready", "Session setup skipped.");
                  }}
                >
                  Skip
                </DwellAction>
                <DwellAction
                  disabled={contextSaving}
                  onActivate={() => void applyContext("")}
                >
                  Clear context
                </DwellAction>
                <Target
                  label="Dictate"
                  detail="Hold to record"
                  kind="context-record"
                  delay={500}
                  disabled={!enabled || contextSaving || phase === "Processing"}
                  onStart={() => void start("context")}
                  onStop={() => {
                    if (recording.current === "context") void finish();
                  }}
                />
              </div>
            </section>
          ) : undefined
        }
      />
      <div
        className="message"
        role={phase === "Error" || configError ? "alert" : "status"}
      >
        {configError && phase === "Ready"
          ? "Connection unavailable. Retry connection or restart the app."
          : message}
        <div className="code-target">
          {selection
            ? `Code for: ${selection.label}`
            : answer
              ? `Code for: ${answer.title}`
              : "Code requires a concept explanation."}
        </div>
      </div>
      {!enabled && (
        <button
          className="setup"
          disabled={demo === undefined && !configError}
          onClick={() => void (configError ? loadConfig() : setup())}
        >
          {configError
            ? "Retry connection"
            : demo === undefined
              ? "Connecting…"
              : demo
                ? "Start demo"
                : "Enable microphone"}
        </button>
      )}
      <div className="controls">
        <Target
          label="Explain"
          detail={screenshotActive ? "Return to explanation" : "Hold to ask"}
          kind="blue"
          delay={350}
          disabled={
            contextSaving ||
            (!enabled && !screenshotActive) ||
            afterCapture ||
            captureBusy ||
            (phase === "Processing" && !screenshotActive)
          }
          onStart={() =>
            screenshotActiveRef.current
              ? returnFromScreenshot()
              : void start("explain")
          }
          onStop={() => {
            if (recording.current === "explain") void finish();
          }}
        />
        <Target
          label="Code"
          detail="Hover for example"
          kind="purple"
          delay={600}
          disabled={
            contextSaving ||
            !answer ||
            afterCapture ||
            captureBusy ||
            (phase === "Processing" && !screenshotPending) ||
            phase === "Listening"
          }
          onStart={() => void showCode()}
          onStop={() => {}}
        />
        <Target
          label="New topic"
          detail="Hover 1 sec"
          kind="reset"
          delay={1000}
          disabled={contextOpen || contextSaving || captureBusy}
          onStart={reset}
          onStop={() => {}}
        />
      </div>
      <section className="screenshot-controls" aria-label="Screenshot controls">
        <div className="screenshot-actions">
          <Target
            label="Capture screenshot"
            detail="Hover 700 ms · drag region"
            kind="capture"
            delay={700}
            disabled={
              contextSaving ||
              afterCapture ||
              captureBusy ||
              phase === "Listening" ||
              (phase === "Processing" && !screenshotPending)
            }
            onStart={() => void captureScreenshot()}
            onStop={() => {}}
          />
          <Target
            label="Ask about screenshot"
            detail={attachment ? "Hold to speak" : "Capture an image first"}
            kind="screenshot-ask"
            delay={350}
            disabled={
              contextOpen ||
              contextSaving ||
              !enabled ||
              !attachment ||
              screenshotPending ||
              afterCapture ||
              captureBusy ||
              phase === "Processing"
            }
            onStart={() => void start("screenshot")}
            onStop={() => {
              if (recording.current === "screenshot") void finish();
            }}
          />
        </div>
        {attachment && (
          <div className="screenshot-attached">
            <img
              src={attachment.thumbnail}
              alt="Attached screenshot thumbnail"
            />
            <span>Screenshot ready{demo ? " · Simulated" : ""}</span>
            {(screenshotResult || screenshotPending) && (
              <Target
                label="View screenshot answer"
                detail="Return without recording"
                kind="shot-nav"
                delay={600}
                disabled={
                  contextOpen ||
                  contextSaving ||
                  afterCapture ||
                  captureBusy ||
                  phase === "Listening" ||
                  phase === "Processing"
                }
                onStart={() => {
                  setScreenshotActive(true);
                  state(
                    screenshotPending
                      ? "Processing"
                      : screenshotResult?.error
                        ? "Error"
                        : "Ready",
                    screenshotPending
                      ? "Analyzing screenshot…"
                      : (screenshotResult?.error ?? "Saved screenshot answer."),
                  );
                }}
                onStop={() => {}}
              />
            )}
            <Target
              label="Remove"
              detail="Hover"
              kind="shot-nav"
              delay={700}
              disabled={
                contextOpen ||
                contextSaving ||
                afterCapture ||
                captureBusy ||
                phase === "Listening" ||
                phase === "Processing"
              }
              onStart={removeScreenshot}
              onStop={() => {}}
            />
          </div>
        )}
        {afterCapture && (
          <span className="capture-rearm">
            Move into a gap or footer, then enter a control.
          </span>
        )}
      </section>
      <footer>Rest your pointer here · Tab + hold Space also works</footer>
    </main>
  );
}
function microphoneError(e: unknown) {
  const name = e instanceof DOMException ? e.name : "";
  return name === "NotAllowedError"
    ? "Microphone denied. Allow access in system privacy settings, then try again."
    : name === "NotFoundError"
      ? "No microphone found. Connect a microphone and try again."
      : "Microphone unavailable. Check system access and other audio apps, then try again.";
}
createRoot(document.getElementById("root")!).render(<App />);

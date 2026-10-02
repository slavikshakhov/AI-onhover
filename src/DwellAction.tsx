import { useEffect, useRef, useState, type ReactNode } from "react";

/** One activation per pointer entry, even when the label/action changes in place. */
export function DwellAction({
  children,
  onActivate,
  disabled = false,
}: {
  children: ReactNode;
  onActivate: () => void;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inside = useRef(false);
  const action = useRef(onActivate);
  action.current = onActivate;
  const [arming, setArming] = useState(false);
  const cancel = () => {
    clearTimeout(timer.current);
    setArming(false);
  };
  const leave = () => {
    cancel();
    inside.current = false;
  };
  const enter = () => {
    if (inside.current) return;
    inside.current = true;
    if (disabled) return;
    setArming(true);
    timer.current = setTimeout(() => {
      setArming(false);
      action.current();
    }, 500);
  };
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return (
    <button
      className={`detail-action dwell-action ${arming ? "arming" : ""}`}
      disabled={disabled}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      {children}
      <i aria-hidden="true" />
    </button>
  );
}

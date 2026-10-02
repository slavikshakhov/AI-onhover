(async () => {
  const { demo, image } = await window.region.frame();
  const canvas = document.getElementById("screen");
  const context = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  if (demo) {
    context.fillStyle = "#142030";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#d6e5ff";
    context.font = "24px monospace";
    context.fillText("DEMO SCREEN · SIMULATED", 80, 100);
    context.font = "32px monospace";
    context.fillText("let x = 2;", 80, 170);
    context.fillText("x += 3;", 80, 225);
    context.fillText("// What is the final value of x?", 80, 285);
  } else {
    const img = new Image();
    img.src = image;
    await img.decode();
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  let start;
  let done = false;
  const selection = document.getElementById("selection");
  const rect = (e) => ({
    x: Math.min(start.x, e.clientX),
    y: Math.min(start.y, e.clientY),
    width: Math.abs(e.clientX - start.x),
    height: Math.abs(e.clientY - start.y),
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || done) return;
    start = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    selection.style.display = "block";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!start || done) return;
    const r = rect(e);
    Object.assign(selection.style, {
      left: r.x + "px",
      top: r.y + "px",
      width: r.width + "px",
      height: r.height + "px",
    });
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!start || done) return;
    const r = rect(e);
    if (r.width < 8 || r.height < 8) {
      start = undefined;
      selection.style.display = "none";
      return;
    }
    done = true;
    void window.region.select(
      r,
      demo ? canvas.toDataURL("image/png") : undefined,
    );
  });
  canvas.addEventListener("pointercancel", () => {
    start = undefined;
    selection.style.display = "none";
  });
  let cancelTimer;
  const cancel = document.getElementById("cancel");
  cancel.addEventListener("pointerenter", () => {
    cancelTimer = setTimeout(() => window.region.cancel(), 300);
  });
  cancel.addEventListener("pointerleave", () => clearTimeout(cancelTimer));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") void window.region.cancel();
  });
})().catch(() => window.region.failed());

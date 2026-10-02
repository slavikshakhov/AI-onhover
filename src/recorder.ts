export type Clip = {
  audio: Uint8Array<ArrayBuffer>;
  mime: "audio/webm" | "audio/ogg" | "audio/mp4";
};
export class Recorder {
  private token = 0;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private sample?: ReturnType<typeof setInterval>;
  private limit?: ReturnType<typeof setTimeout>;
  private voiced = 0;
  private chunks: Blob[] = [];
  async start(onLimit: () => void) {
    const token = ++this.token;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    if (token !== this.token) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (token !== this.token) {
        this.cleanup();
        return false;
      }
      const source = this.context.createMediaStreamSource(stream);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      this.voiced = 0;
      this.sample = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(
          data.reduce((sum, v) => sum + v * v, 0) / data.length,
        );
        if (rms > 0.012) this.voiced += 50;
      }, 50);
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("Unsupported audio recorder");
      this.chunks = [];
      this.recorder = new MediaRecorder(stream, { mimeType: mime });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.start();
      this.limit = setTimeout(onLimit, 30000);
      return true;
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }
  async stop(discard = false): Promise<Clip | undefined> {
    ++this.token;
    const recorder = this.recorder;
    this.recorder = undefined;
    if (!recorder) {
      this.cleanup();
      return;
    }
    const voiced = this.voiced;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob());
    });
    this.chunks = [];
    this.cleanup();
    if (discard || voiced < 200 || blob.size < 100) return;
    return {
      audio: new Uint8Array(await blob.arrayBuffer()),
      mime: recorder.mimeType.split(";")[0] as Clip["mime"],
    };
  }
  private cleanup() {
    clearInterval(this.sample);
    clearTimeout(this.limit);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}

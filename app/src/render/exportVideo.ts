export interface RecordOptions {
  canvas: HTMLCanvasElement;
  mime: string;
  totalMs: number;
  /** 按已播放时长绘制一帧 */
  paint: (elapsed: number) => void;
  fps?: number;
  /** 不传则一次性收集数据 */
  timeslice?: number;
  bitsPerSecond?: number;
}

export interface RecordHandle {
  done: Promise<Blob | null>;
  cancel: () => void;
}

/** 基于 canvas.captureStream + MediaRecorder 的通用录制器（不依赖 Vue） */
export function recordCanvas(opts: RecordOptions): RecordHandle {
  const stream = opts.canvas.captureStream(opts.fps ?? 60);
  const rec = new MediaRecorder(stream, {
    mimeType: opts.mime,
    videoBitsPerSecond: opts.bitsPerSecond ?? 12_000_000,
  });
  const chunks: Blob[] = [];
  let cancelled = false;
  let raf = 0;
  let resolveDone: (b: Blob | null) => void = () => {};
  const done = new Promise<Blob | null>((res) => {
    resolveDone = res;
  });

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.onstop = () => {
    resolveDone(cancelled || !chunks.length ? null : new Blob(chunks, { type: opts.mime }));
  };

  if (opts.timeslice) rec.start(opts.timeslice);
  else rec.start();

  const t0 = performance.now();
  const tick = (now: number) => {
    if (cancelled) return;
    const el = Math.min(now - t0, opts.totalMs);
    opts.paint(el);
    if (el < opts.totalMs) {
      raf = requestAnimationFrame(tick);
    } else {
      setTimeout(() => {
        if (cancelled) return;
        try {
          rec.stop();
        } catch {
          resolveDone(null);
        }
      }, 120);
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        rec.stop();
      } catch {
        resolveDone(null);
      }
    },
  };
}

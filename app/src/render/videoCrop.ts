import type { VideoCrop, VideoTrim } from '../core/types';

/** 裁切结果：画面构图 + 可选播出时段 */
export interface VideoCropResult {
  crop: VideoCrop;
  trim?: VideoTrim;
}

/**
 * 把裁切区域铺满容器（容器需 position:relative + overflow:hidden）。
 * 裁切框与播出面板（396×604）同比例，因此元素比例仍等于视频原始比例，不会二次变形。
 */
export function cropBoxStyle(crop?: VideoCrop): Record<string, string> | null {
  if (!crop) return null;
  return {
    position: 'absolute',
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
  };
}

/** canvas 绘制：按裁切区域 cover 填充目标矩形；无裁切时等同整帧 cover */
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  crop: VideoCrop | undefined,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const sx = (crop ? crop.x : 0) * vw;
  const sy = (crop ? crop.y : 0) * vh;
  const sw = (crop ? crop.w : 1) * vw;
  const sh = (crop ? crop.h : 1) * vh;
  const k = Math.max(dw / sw, dh / sh);
  ctx.drawImage(video, sx, sy, sw, sh, dx + (dw - sw * k) / 2, dy + (dh - sh * k) / 2, sw * k, sh * k);
}

/**
 * 让视频只在截取区间内循环（预览 / 小窗播放用）。
 * 返回解绑函数；未设置截取时保持普通循环。
 */
export function bindVideoTrim(el: HTMLVideoElement, trim?: VideoTrim): () => void {
  el.loop = !trim;
  if (!trim) return () => {};
  const seekStart = (): void => {
    if (!Number.isFinite(el.duration)) return;
    const t = Math.min(trim.start, Math.max(0, el.duration - 0.05));
    if (el.readyState >= 1) el.currentTime = t;
  };
  const onTime = (): void => {
    if (el.currentTime >= trim.end - 0.02) seekStart();
  };
  el.addEventListener('loadedmetadata', seekStart);
  el.addEventListener('timeupdate', onTime);
  seekStart();
  return () => {
    el.removeEventListener('loadedmetadata', seekStart);
    el.removeEventListener('timeupdate', onTime);
  };
}

/** 导出录制时按帧率把播放位置拉回区间起点，保证 canvas 取到的画面始终在选段内 */
export function wrapVideoTrim(el: HTMLVideoElement, trim?: VideoTrim): void {
  if (!trim || !Number.isFinite(el.duration)) return;
  if (el.currentTime >= trim.end - 0.03) el.currentTime = trim.start;
}

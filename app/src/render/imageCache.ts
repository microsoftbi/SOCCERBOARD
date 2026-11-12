const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = cache.get(src);
  if (cached && cached.complete && cached.naturalWidth) return Promise.resolve(cached);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const p = new Promise<HTMLImageElement>((resolve) => {
    const img = cached ?? new Image();
    cache.set(src, img);
    img.onload = () => {
      pending.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      pending.delete(src);
      resolve(img);
    };
    img.src = src;
    if (img.complete) {
      pending.delete(src);
      resolve(img);
    }
  });
  pending.set(src, p);
  return p;
}

export function imageFor(photo: string | null | undefined): HTMLImageElement | null {
  if (!photo) return null;
  return cache.get(photo) ?? null;
}

export function ensurePlayerImages(players: Array<{ photo: string | null }>): Promise<unknown> {
  return Promise.all(players.filter((p) => p.photo).map((p) => loadImage(p.photo!)));
}

/* ---------- 球员视频缓存（队员介绍导出用） ---------- */

const videoCache = new Map<string, HTMLVideoElement>();

/** 球员 id 只在球队内唯一，缓存键必须带上 teamId */
function vkey(teamId: number, playerId: number): string {
  return `${teamId}:${playerId}`;
}

/** 取已解码、可绘制的视频元素；未就绪返回 null（调用方回退照片） */
export function videoFor(teamId: number, playerId: number): HTMLVideoElement | null {
  const v = videoCache.get(vkey(teamId, playerId));
  return v && v.readyState >= 2 && v.videoWidth > 0 ? v : null;
}

/** 取缓存中的视频元素（不要求已解码），用于播放控制；绘制前用 videoFor 判断 */
export function videoElFor(teamId: number, playerId: number): HTMLVideoElement | null {
  return videoCache.get(vkey(teamId, playerId)) ?? null;
}

/** 为带视频标记的球员预加载隐藏 video（录制导出前调用） */
export async function ensurePlayerVideos<T extends { id: number; video: boolean }>(
  teamId: number,
  players: T[],
  getUrl: (player: T) => Promise<string | null>,
): Promise<void> {
  const targets = players.filter((p) => p.video && !videoCache.has(vkey(teamId, p.id)));
  await Promise.all(
    targets.map(async (p) => {
      const url = await getUrl(p);
      if (!url) return;
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      await new Promise<void>((resolve) => {
        const done = (): void => resolve();
        v.addEventListener('loadeddata', done, { once: true });
        v.addEventListener('error', done, { once: true });
        setTimeout(done, 8000); // 卡住时兜底放行，导出回退照片
      });
      if (v.readyState >= 2) videoCache.set(vkey(teamId, p.id), v);
    }),
  );
}

export function eachVideo(fn: (v: HTMLVideoElement) => void): void {
  videoCache.forEach(fn);
}

/** 保存/移除/删除视频后丢弃旧元素，下次导出重新加载 */
export function dropVideo(teamId: number, playerId: number): void {
  const v = videoCache.get(vkey(teamId, playerId));
  if (!v) return;
  v.pause();
  v.removeAttribute('src');
  v.load();
  videoCache.delete(vkey(teamId, playerId));
}

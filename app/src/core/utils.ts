import { FONT_MONO } from './formations';
import { filledPlayers, playerById } from './team';
import type { LineupTeam } from './types';

export function fileName(t: LineupTeam, ext: string): string {
  const base = (t.code.trim() || t.name.trim() || 'team').replace(/[^\w\u4e00-\u9fa5-]+/g, '');
  return `${base}_${t.count}人制_${t.formation}.${ext}`;
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const cand = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of cand) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* 忽略不支持的类型 */
    }
  }
  return null;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

function hex2rgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorClose(a: string, b: string): boolean {
  const pa = hex2rgb(a);
  const pb = hex2rgb(b);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) < 70;
}

export function buildJson(t: LineupTeam): object {
  const slots = t.slots || [];
  return {
    app: 'SOCCERBOARD',
    version: 1,
    exportedAt: new Date().toISOString(),
    team: {
      side: t.side === 'home' ? 'home' : 'away',
      name: t.name.trim(),
      code: t.code.trim() || null,
      color: t.color,
    },
    match: { playersOnPitch: t.count },
    formation: t.formation,
    slots: slots.map((s) => {
      const p = s.pid != null ? playerById(t, s.pid) : null;
      return {
        pos: s.pos,
        x: s.x,
        y: s.y,
        player: p
          ? { num: +p.num || null, name: p.name.trim(), position: p.pos || null, captain: !!p.captain }
          : null,
      };
    }),
    squad: filledPlayers(t).map((p) => ({
      num: +p.num || null,
      name: p.name.trim(),
      position: p.pos || null,
      captain: !!p.captain,
      hasPhoto: !!p.photo,
      onPitch: slots.some((s) => s.pid === p.id),
    })),
  };
}

export const MONO = FONT_MONO;

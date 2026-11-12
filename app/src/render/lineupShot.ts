import { FONT_MONO, FONT_SYS, LABEL } from '../core/formations';
import type { LineupTeam } from '../core/types';
import { imageFor } from './imageCache';
import type { ShowItem } from './showcase';
import { drawVideoCover } from './videoCrop';

/** 合影版面：1920×1080 横版转播画面 */
export const LS_W = 1920;
export const LS_H = 1080;

/** 位置分区：守门员 → 后卫 → 中场 → 前锋 */
const RANK: Record<string, number> = {};
['GK'].forEach((k) => (RANK[k] = 0));
['LB', 'RB', 'CB', 'LCB', 'RCB', 'LWB', 'RWB'].forEach((k) => (RANK[k] = 1));
['CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM'].forEach((k) => (RANK[k] = 2));
['LW', 'RW', 'ST', 'LST', 'RST', 'SS', 'CF'].forEach((k) => (RANK[k] = 3));

/** 位置线名称：守门员 / 后卫 / 中场 / 前场 */
export const LINE_LABELS = ['守门员', '后卫', '中场', '前场'] as const;

/** 球员所属位置线（0 门将 · 1 后卫 · 2 中场 · 3 前场） */
export function lineRank(item: ShowItem): number {
  return RANK[item.pos] ?? RANK[item.p.pos] ?? 3;
}

/** 按守门员→后卫→中场→前锋排序，同位置内从左到右 */
export function sortLineup(items: ShowItem[]): ShowItem[] {
  return [...items].sort((a, b) => {
    const ra = lineRank(a);
    const rb = lineRank(b);
    if (ra !== rb) return ra - rb;
    return a.x - b.x;
  });
}

export function posLabel(pos: string): string {
  return LABEL[pos] || pos || '球员';
}

export interface LineupShotOptions {
  team: LineupTeam;
  /** 已排序的首发，用于左侧球场点位 */
  all: ShowItem[];
  /** 当前这一组球员 */
  items: ShowItem[];
  showField: boolean;
  showNames: boolean;
  showInfo: boolean;
  infoVs: string;
  infoLine: string;
  /** 有视频的球员返回可绘制的视频元素，缺省则回退照片 */
  videoOf?: (item: ShowItem) => HTMLVideoElement | null;
}

function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(200,16,46,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(x: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number, r: number): void {
  const rad = Math.min(r, pw / 2, ph / 2);
  x.beginPath();
  x.moveTo(px + rad, py);
  x.arcTo(px + pw, py, px + pw, py + ph, rad);
  x.arcTo(px + pw, py + ph, px, py + ph, rad);
  x.arcTo(px, py + ph, px, py, rad);
  x.arcTo(px, py, px + pw, py, rad);
  x.closePath();
}

function fitText(x: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (x.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawCover(
  x: CanvasRenderingContext2D,
  img: HTMLImageElement,
  px: number,
  py: number,
  pw: number,
  ph: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(pw / iw, ph / ih);
  const w = iw * s;
  const h = ih * s;
  x.drawImage(img, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
}

export function paintLineupShot(x: CanvasRenderingContext2D, o: LineupShotOptions): void {
  const t = o.team;
  const n = o.items.length;
  x.clearRect(0, 0, LS_W, LS_H);

  /* ---------- 背景：深色渐变 + 球场纹理 ---------- */
  const bg = x.createLinearGradient(0, 0, 0, LS_H);
  bg.addColorStop(0, '#0a1712');
  bg.addColorStop(0.52, '#07110a');
  bg.addColorStop(1, '#030705');
  x.fillStyle = bg;
  x.fillRect(0, 0, LS_W, LS_H);

  x.save();
  x.beginPath();
  x.rect(0, 468, LS_W, LS_H - 468);
  x.clip();
  x.fillStyle = '#0a1c13';
  x.fillRect(0, 468, LS_W, LS_H - 468);
  const stripe = LS_W / 26;
  for (let i = 0; i < 26; i += 2) {
    x.fillStyle = 'rgba(255,255,255,.02)';
    x.fillRect(i * stripe, 468, stripe, LS_H - 468);
  }
  x.strokeStyle = 'rgba(255,255,255,.045)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, 704);
  x.lineTo(LS_W, 704);
  x.stroke();
  x.restore();

  const glow = x.createRadialGradient(1130, 580, 80, 1130, 580, 780);
  glow.addColorStop(0, withAlpha(t.color, 0.16));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glow;
  x.fillRect(320, 0, LS_W - 320, LS_H);

  const topFade = x.createLinearGradient(0, 0, 0, 300);
  topFade.addColorStop(0, 'rgba(0,0,0,.58)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = topFade;
  x.fillRect(0, 0, LS_W, 300);

  const botFade = x.createLinearGradient(0, LS_H - 280, 0, LS_H);
  botFade.addColorStop(0, 'rgba(0,0,0,0)');
  botFade.addColorStop(1, 'rgba(0,0,0,.74)');
  x.fillStyle = botFade;
  x.fillRect(0, LS_H - 280, LS_W, 280);

  /* ---------- 顶部：队徽 + 队名 ---------- */
  const c = { x: 72, y: 62, s: 78 };
  rr(x, c.x, c.y, c.s, c.s, 14);
  x.fillStyle = t.color;
  x.fill();
  x.fillStyle = '#fff';
  x.font = `800 30px ${FONT_MONO}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText((t.code.trim() || 'SB').slice(0, 4).toUpperCase(), c.x + c.s / 2, c.y + c.s / 2 + 2);

  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.font = `600 15px ${FONT_MONO}`;
  x.fillText('STARTING LINE-UP · 首发阵容', c.x + c.s + 28, c.y + 16);
  x.fillStyle = '#fff';
  x.font = `800 46px ${FONT_SYS}`;
  x.fillText(fitText(x, (t.name.trim() || 'TEAM').toUpperCase(), 620), c.x + c.s + 28, c.y + 62);
  rr(x, c.x + c.s + 28, c.y + 76, 200, 5, 3);
  x.fillStyle = t.color;
  x.fill();

  if (o.showInfo && o.infoVs) {
    x.textAlign = 'right';
    x.fillStyle = '#fff';
    x.font = `700 30px ${FONT_SYS}`;
    x.fillText(fitText(x, o.infoVs, 560), 1848, 104);
    if (o.infoLine) {
      x.fillStyle = 'rgba(255,255,255,.58)';
      x.font = `500 17px ${FONT_SYS}`;
      x.fillText(fitText(x, o.infoLine, 560), 1848, 138);
    }
  }

  /* ---------- 左侧：小球场 + 阵型 + 主教练 ---------- */
  if (o.showField) {
    const P = { x: 72, y: 176, w: 372, h: 832 };
    rr(x, P.x, P.y, P.w, P.h, 18);
    x.fillStyle = 'rgba(6,14,10,.62)';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.1)';
    x.lineWidth = 1;
    x.stroke();

    const F = { x: P.x + 24, y: P.y + 24, w: P.w - 48, h: 500 };
    rr(x, F.x, F.y, F.w, F.h, 12);
    x.fillStyle = '#0d2016';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.12)';
    x.stroke();

    const ins = 12;
    x.strokeStyle = 'rgba(255,255,255,.2)';
    x.lineWidth = 2;
    x.strokeRect(F.x + ins, F.y + ins, F.w - ins * 2, F.h - ins * 2);
    x.beginPath();
    x.moveTo(F.x + ins, F.y + F.h / 2);
    x.lineTo(F.x + F.w - ins, F.y + F.h / 2);
    x.stroke();
    x.beginPath();
    x.arc(F.x + F.w / 2, F.y + F.h / 2, 56, 0, Math.PI * 2);
    x.stroke();
    x.strokeRect(F.x + F.w * 0.24, F.y + ins, F.w * 0.52, 70);
    x.strokeRect(F.x + F.w * 0.24, F.y + F.h - ins - 70, F.w * 0.52, 70);

    const pad = 26;
    const mx = (v: number): number => F.x + pad + (v / 100) * (F.w - pad * 2);
    const my = (v: number): number => F.y + pad + (v / 100) * (F.h - pad * 2);
    const active = new Set(o.items.map((i) => i.p.id));
    for (const it of o.all) {
      const px = mx(it.x);
      const py = my(it.y);
      const on = active.has(it.p.id);
      x.beginPath();
      x.arc(px, py, 17, 0, Math.PI * 2);
      x.fillStyle = on ? t.color : 'rgba(255,255,255,.12)';
      x.fill();
      x.lineWidth = on ? 2.5 : 1.5;
      x.strokeStyle = on ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.3)';
      x.stroke();
      x.fillStyle = on ? '#fff' : 'rgba(255,255,255,.62)';
      x.font = `700 14px ${FONT_MONO}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(fitText(x, it.p.num || '—', 26), px, py + 1);
    }

    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#fff';
    x.font = `800 42px ${FONT_MONO}`;
    x.fillText(t.formation, P.x + 26, F.y + F.h + 66);
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.font = `600 15px ${FONT_SYS}`;
    x.fillText(`${t.count} 人制 · ${t.side === 'home' ? '主队' : '客队'}`, P.x + 26, F.y + F.h + 96);

    const dy = F.y + F.h + 132;
    x.beginPath();
    x.moveTo(P.x + 26, dy);
    x.lineTo(P.x + P.w - 26, dy);
    x.strokeStyle = 'rgba(255,255,255,.14)';
    x.lineWidth = 1;
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.font = `700 18px ${FONT_MONO}`;
    x.fillText('C O A C H · 主教练', P.x + 26, dy + 40);
    x.fillStyle = '#fff';
    x.font = `700 38px ${FONT_SYS}`;
    x.fillText(fitText(x, (t.coach || '').trim() || '—', P.w - 52), P.x + 26, dy + 90);
  }

  /* ---------- 右侧：球员合影 ---------- */
  const areaX = 480;
  const areaW = 1368;
  const areaTop = 176;
  const areaBottom = 1008;
  const nameH = 74;
  const nameGap = 12;
  const gap = 26;
  const ratio = n <= 2 ? 1.6 : 2.1;
  /** 姓名条占用的额外高度（不显示姓名条时为 0） */
  const nameBlockH = o.showNames ? nameGap + nameH : 0;

  if (!n) {
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.35)';
    x.font = `600 26px ${FONT_SYS}`;
    x.fillText('还没有已落位的首发球员', areaX + areaW / 2, 560);
    return;
  }

  const cellW = Math.min((areaBottom - areaTop - nameBlockH) / ratio, (areaW - gap * (n - 1)) / n);
  const totalW = cellW * n + gap * (n - 1);
  const startX = areaX + (areaW - totalW) / 2;
  const photoH = cellW * ratio;
  // 照片 + 姓名条整体在内容区内垂直居中
  const blockH = photoH + nameBlockH;
  const photoTop = areaTop + (areaBottom - areaTop - blockH) / 2;
  const photoBottom = photoTop + photoH;

  for (let i = 0; i < n; i++) {
    const it = o.items[i];
    const px = startX + i * (cellW + gap);
    const py = photoTop;

    /* 照片（缺图时画剪影） */
    x.save();
    rr(x, px, py, cellW, photoH, 10);
    x.clip();
    x.fillStyle = '#0c1813';
    x.fillRect(px, py, cellW, photoH);
    const img = imageFor(it.p.photo);
    const vid = o.videoOf?.(it) || null;
    if (vid && vid.readyState >= 2 && vid.videoWidth) {
      drawVideoCover(x, vid, it.p.videoCrop, px, py, cellW, photoH);
    } else if (img && img.complete && img.naturalWidth) {
      drawCover(x, img, px, py, cellW, photoH);
    } else {
      x.fillStyle = 'rgba(255,255,255,.1)';
      x.beginPath();
      x.arc(px + cellW / 2, py + photoH * 0.3, cellW * 0.155, 0, Math.PI * 2);
      x.fill();
      rr(x, px + cellW * 0.24, py + photoH * 0.42, cellW * 0.52, photoH * 0.34, cellW * 0.16);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,.08)';
      x.font = `800 ${Math.round(cellW * 0.52)}px ${FONT_MONO}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(it.p.num || '—', px + cellW / 2, py + photoH * 0.76);
    }
    const scrim = x.createLinearGradient(0, py + photoH * 0.6, 0, py + photoH);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(1, 'rgba(0,0,0,.74)');
    x.fillStyle = scrim;
    x.fillRect(px, py + photoH * 0.6, cellW, photoH * 0.4);
    x.restore();

    rr(x, px, py, cellW, photoH, 10);
    x.strokeStyle = 'rgba(255,255,255,.16)';
    x.lineWidth = 1;
    x.stroke();

    /* 姓名条 */
    if (o.showNames) {
      const by = photoBottom + nameGap;
      rr(x, px, by, cellW, nameH, 8);
      x.fillStyle = 'rgba(0,0,0,.62)';
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,.12)';
      x.stroke();
      x.fillStyle = t.color;
      x.fillRect(px, by, cellW, 3);

      x.textBaseline = 'middle';
      x.textAlign = 'left';
      x.fillStyle = '#fff';
      x.font = `800 22px ${FONT_MONO}`;
      x.fillText(fitText(x, it.p.num || '—', 46), px + 14, by + nameH / 2 + 2);

      x.textAlign = 'center';
      x.font = `700 24px ${FONT_SYS}`;
      const wide = cellW >= 300;
      x.fillText(
        fitText(x, it.p.name.trim() || '未命名', cellW - (wide ? 150 : 86)),
        px + cellW / 2 + (wide ? 8 : 16),
        by + nameH / 2 + 2,
      );

      if (wide) {
        x.textAlign = 'right';
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.font = `600 14px ${FONT_SYS}`;
        x.fillText(fitText(x, posLabel(it.pos), 84), px + cellW - 14, by + nameH / 2 + 2);
      }
    }
  }

  /* ---------- 水印 ---------- */
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = 'rgba(255,255,255,.3)';
  x.font = `600 13px ${FONT_MONO}`;
  x.fillText('S O C C E R B O A R D   ·   首 发 阵 容', LS_W / 2, 1052);
}

import { FONT_MONO, FONT_SYS, FORMATIONS, LABEL } from '../core/formations';
import { filledPlayers, playerById } from '../core/team';
import type { LineupTeam, Player } from '../core/types';
import { clamp01, easeOutCubic } from './card';
import { imageFor, videoFor } from './imageCache';
import { drawVideoCover } from './videoCrop';

export const SHOW_SLOW = 9; // 播放节奏倍数，与 .stage 的 --show-speed 保持一致
export const showTm = { lead: 220, step: 280, rowIn: 300, fade: 150 };

/** 舞台版面（1200×675 设计坐标）：左名单 / 中竖版球场 / 右球员大图 */
const L = {
  top: 34,
  bottom: 638,
  leftX: 28,
  leftW: 300,
  midX: 352,
  midW: 400,
  rightX: 776,
  rightW: 396,
  bannerH: 66,
  coachH: 82,
  rowX: 40,
  rowW: 276,
  rowGap: 3,
  rowH: 34,
  fieldPad: 12,
  markPad: 24,
  markR: 15,
};

/** 竖版球场矩形（相对舞台，绝对定位） */
export const SHOW_FIELD = {
  x: L.midX + L.fieldPad,
  y: L.top + L.fieldPad,
  w: L.midW - L.fieldPad * 2,
  h: L.bottom - L.top - L.fieldPad * 2,
  pad: L.markPad,
};

/** 阵型坐标(x/y 0-100) → 球场内的像素坐标 */
export function markXY(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: SHOW_FIELD.pad + (x / 100) * (SHOW_FIELD.w - SHOW_FIELD.pad * 2),
    cy: SHOW_FIELD.pad + (y / 100) * (SHOW_FIELD.h - SHOW_FIELD.pad * 2),
  };
}

export interface ShowItem {
  p: Player;
  pos: string;
  x: number;
  y: number;
}

export function showcaseList(t: LineupTeam): ShowItem[] {
  const placed = (t.slots || [])
    .filter((s) => s.pid != null)
    .map((s) => {
      const p = playerById(t, s.pid!);
      return p ? { p, pos: s.pos, x: s.x, y: s.y } : null;
    })
    .filter((x): x is ShowItem => x !== null);
  if (placed.length) return placed; // 只展示已落位的首发球员，替补不进入首发名单
  const pts = FORMATIONS[t.count]?.[t.formation];
  return filledPlayers(t).map((p, i) => {
    const pt = pts?.[i];
    return {
      p,
      pos: pt?.pos || p.pos,
      x: pt?.x ?? 50,
      y: pt?.y ?? Math.max(8, 88 - i * 9),
    };
  });
}

export function showTotalMs(n: number): number {
  const speed = SHOW_SLOW;
  return (
    showTm.lead * speed +
    Math.max(0, n - 1) * showTm.step * speed +
    showTm.rowIn * speed +
    showTm.fade +
    900
  );
}

function rrPath(x: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number, r: number): void {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + pw, py, px + pw, py + ph, r);
  x.arcTo(px + pw, py + ph, px, py + ph, r);
  x.arcTo(px, py + ph, px, py, r);
  x.arcTo(px, py, px + pw, py, r);
  x.closePath();
}

function spacedWidth(x: CanvasRenderingContext2D, text: string, sp: number): number {
  let w = 0;
  Array.from(text).forEach((ch) => (w += x.measureText(ch).width + sp));
  return w - sp;
}

function spacedText(
  x: CanvasRenderingContext2D,
  text: string,
  px: number,
  y: number,
  sp: number,
  align: 'left' | 'center' | 'right',
): void {
  const chars = Array.from(String(text));
  let w = 0;
  chars.forEach((ch) => (w += x.measureText(ch).width + sp));
  w -= sp;
  let sx = align === 'center' ? px - w / 2 : align === 'right' ? px - w : px;
  x.textAlign = 'left';
  chars.forEach((ch) => {
    x.fillText(ch, sx, y);
    sx += x.measureText(ch).width + sp;
  });
}

/** 超宽文本按字截断并追加省略号 */
function fitSpaced(x: CanvasRenderingContext2D, text: string, maxW: number, sp: number): string {
  const full = String(text ?? '');
  if (spacedWidth(x, full, sp) <= maxW) return full;
  const chars = Array.from(full);
  while (chars.length && spacedWidth(x, chars.join('') + '…', sp) > maxW) chars.pop();
  return chars.join('') + '…';
}

function drawBg(x: CanvasRenderingContext2D): void {
  const g = x.createLinearGradient(0, 0, 240, 675);
  g.addColorStop(0, '#46584d');
  g.addColorStop(0.3, '#25342c');
  g.addColorStop(1, '#080d0a');
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 675);
  const glow = x.createRadialGradient(300, -70, 10, 300, -70, 780);
  glow.addColorStop(0, 'rgba(198,210,199,.34)');
  glow.addColorStop(0.5, 'rgba(198,210,199,0)');
  x.fillStyle = glow;
  x.fillRect(0, 0, 1200, 675);
  x.save();
  x.globalAlpha = 0.06;
  x.strokeStyle = '#fff';
  x.lineWidth = 2;
  for (let i = -200; i < 1500; i += 34) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 220, 675);
    x.stroke();
  }
  x.restore();
}

function panel(x: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number): void {
  rrPath(x, px, py, pw, ph, 8);
  x.fillStyle = 'rgba(9,16,12,.74)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.14)';
  x.lineWidth = 1;
  rrPath(x, px + 0.5, py + 0.5, pw - 1, ph - 1, 8);
  x.stroke();
}

function drawLeft(
  x: CanvasRenderingContext2D,
  t: LineupTeam,
  list: ShowItem[],
  active: number,
  now: number,
  lead: number,
  step: number,
  rowIn: number,
): void {
  const px = L.leftX;
  const py = L.top;
  const pw = L.leftW;
  const ph = L.bottom - L.top;
  panel(x, px, py, pw, ph);

  /* 球队横幅 */
  x.save();
  rrPath(x, px, py, pw, L.bannerH, 8);
  x.clip();
  x.fillStyle = t.color || '#c8102e';
  x.fillRect(px, py, pw, L.bannerH);
  const shade = x.createLinearGradient(px, py, px + pw, py);
  shade.addColorStop(0, 'rgba(255,255,255,.16)');
  shade.addColorStop(0.42, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,.46)');
  x.fillStyle = shade;
  x.fillRect(px, py, pw, L.bannerH);
  x.restore();

  rrPath(x, px + 16, py + 15, 36, 36, 5);
  x.fillStyle = 'rgba(0,0,0,.3)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.55)';
  x.lineWidth = 1;
  rrPath(x, px + 16.5, py + 15.5, 35, 35, 5);
  x.stroke();
  x.fillStyle = '#fff';
  x.font = `800 11px ${FONT_MONO}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText((t.code.trim() || 'SB').slice(0, 4), px + 34, py + 34);

  x.fillStyle = '#fff';
  x.font = `800 21px ${FONT_SYS}`;
  x.textBaseline = 'middle';
  const teamName = fitSpaced(x, (t.name.trim() || 'TEAM').toUpperCase(), pw - 80, 2.6);
  spacedText(x, teamName, px + 64, py + 34, 2.6, 'left');

  /* 名单 */
  const headY = py + L.bannerH + 24;
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.font = `600 9.5px ${FONT_MONO}`;
  spacedText(x, 'STARTING LINE-UP · 首发', px + 14, headY, 2, 'left');

  const rowTop = headY + 12;
  const footTop = py + ph - L.coachH;
  const n = list.length;
  const avail = footTop - rowTop - 10;
  const rowH = Math.min(L.rowH, (avail - L.rowGap * (n - 1)) / Math.max(1, n));

  list.forEach((item, i) => {
    const st = lead + i * step;
    if (now < st) return;
    const pr = clamp01((now - st) / rowIn);
    const yy = rowTop + i * (rowH + L.rowGap) - 13 * (1 - easeOutCubic(pr));
    const rx = px + 12;
    const rw = pw - 24;
    x.save();
    x.globalAlpha = pr;
    if (i === active) {
      x.save();
      x.shadowColor = 'rgba(0,0,0,.32)';
      x.shadowBlur = 10;
      x.shadowOffsetY = 3;
      rrPath(x, rx, yy, rw, rowH, 4);
      x.fillStyle = '#cfe3fa';
      x.fill();
      x.restore();
    }
    const bx = rx + 8;
    const bw = 32;
    const bh = 22;
    const by = yy + (rowH - bh) / 2;
    if (i !== active) {
      rrPath(x, bx, by, bw, bh, 3);
      x.fillStyle = 'rgba(255,255,255,.12)';
      x.fill();
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = i === active ? '#141d2a' : '#f0e7d4';
    x.font = `700 13px ${FONT_MONO}`;
    x.fillText(item.p.num || '—', bx + bw / 2, by + bh / 2 + 1);

    x.textAlign = 'left';
    x.font = `700 14px ${FONT_SYS}`;
    const nameMax = rw - 8 - bw - 10 - (item.p.captain ? 24 : 4);
    const nm = fitSpaced(x, item.p.name, nameMax, 1);
    x.fillStyle = i === active ? '#141d2a' : '#f6faf7';
    x.fillText(nm, bx + bw + 10, yy + rowH / 2 + 1);

    if (item.p.captain) {
      const cx = rx + rw - 16;
      const cy = yy + rowH / 2;
      x.beginPath();
      x.arc(cx, cy, 8, 0, Math.PI * 2);
      x.strokeStyle = i === active ? '#141d2a' : 'rgba(255,255,255,.65)';
      x.lineWidth = 1;
      x.stroke();
      x.fillStyle = i === active ? '#141d2a' : '#ffffff';
      x.font = `700 9px ${FONT_MONO}`;
      x.textAlign = 'center';
      x.fillText('C', cx, cy + 1);
    }
    x.restore();
  });

  /* 底部阵型区 */
  x.fillStyle = 'rgba(255,255,255,.16)';
  x.fillRect(px + 12, footTop, pw - 24, 1);
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.font = `600 9.5px ${FONT_MONO}`;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  spacedText(x, 'FORMATION · 阵型', px + 14, footTop + 24, 2, 'left');
  x.fillStyle = '#ffffff';
  x.font = `800 20px ${FONT_SYS}`;
  spacedText(x, t.formation, px + 14, footTop + 52, 3, 'left');
  x.fillStyle = 'rgba(255,255,255,.45)';
  x.font = `600 11px ${FONT_MONO}`;
  x.textAlign = 'right';
  x.fillText(`${t.side === 'home' ? '主队' : '客队'} · ${t.count} 人制`, px + pw - 14, footTop + 52);
}

function drawField(x: CanvasRenderingContext2D): void {
  const f = SHOW_FIELD;
  x.save();
  rrPath(x, f.x, f.y, f.w, f.h, 7);
  x.clip();
  const g = x.createLinearGradient(f.x, f.y, f.x, f.y + f.h);
  g.addColorStop(0, '#1d6b3b');
  g.addColorStop(0.5, '#186036');
  g.addColorStop(1, '#114a28');
  x.fillStyle = g;
  x.fillRect(f.x, f.y, f.w, f.h);
  for (let i = 0; i < 10; i += 2) {
    x.fillStyle = 'rgba(255,255,255,.05)';
    x.fillRect(f.x, f.y + (i * f.h) / 10, f.w, f.h / 10);
  }
  x.restore();

  const fx = f.x + 2;
  const fy = f.y + 2;
  const fw = f.w - 4;
  const fh = f.h - 4;
  x.save();
  x.strokeStyle = 'rgba(255,255,255,.5)';
  x.lineWidth = 1.4;
  x.strokeRect(fx, fy, fw, fh);
  x.beginPath();
  x.moveTo(fx, fy + fh / 2);
  x.lineTo(fx + fw, fy + fh / 2);
  x.stroke();
  x.beginPath();
  x.arc(fx + fw / 2, fy + fh / 2, (fw - 6) * 0.145, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.arc(fx + fw / 2, fy + fh / 2, 2, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.fill();
  const pw2 = fw * 0.62;
  const ph2 = fh * 0.15;
  x.strokeRect(fx + (fw - pw2) / 2, fy, pw2, ph2);
  x.strokeRect(fx + (fw - pw2) / 2, fy + fh - ph2, pw2, ph2);
  const gw = fw * 0.3;
  const gh = fh * 0.055;
  x.strokeRect(fx + (fw - gw) / 2, fy, gw, gh);
  x.strokeRect(fx + (fw - gw) / 2, fy + fh - gh, gw, gh);
  x.restore();
}

function drawMarker(x: CanvasRenderingContext2D, item: ShowItem, alpha: number, hot: boolean): void {
  const { cx, cy } = markXY(item.x, item.y);
  const X = SHOW_FIELD.x + cx;
  const Y = SHOW_FIELD.y + cy;
  x.save();
  x.globalAlpha = alpha;
  x.beginPath();
  x.arc(X, Y + 2, L.markR, 0, Math.PI * 2);
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.fill();
  x.beginPath();
  x.arc(X, Y, L.markR, 0, Math.PI * 2);
  x.fillStyle = hot ? '#2f7bdd' : '#f0e7d4';
  x.fill();
  x.lineWidth = hot ? 2 : 1;
  x.strokeStyle = hot ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.2)';
  x.stroke();
  x.fillStyle = hot ? '#ffffff' : '#16202a';
  x.font = `800 13px ${FONT_MONO}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(item.p.num || '—', X, Y + 1);
  x.restore();
}

function drawRight(x: CanvasRenderingContext2D, teamId: number, item: ShowItem, alpha: number, dy: number): void {
  const px = L.rightX;
  const py = L.top;
  const pw = L.rightW;
  const ph = L.bottom - L.top;
  x.save();
  x.globalAlpha = alpha;
  x.translate(0, dy);
  x.save();
  rrPath(x, px, py, pw, ph, 8);
  x.clip();

  const bgG = x.createLinearGradient(px, py, px + pw * 0.4, py + ph);
  bgG.addColorStop(0, '#3a4b41');
  bgG.addColorStop(0.42, '#1c2a23');
  bgG.addColorStop(1, '#0a120d');
  x.fillStyle = bgG;
  x.fillRect(px, py, pw, ph);
  x.save();
  x.globalAlpha = 0.07 * alpha;
  x.strokeStyle = '#fff';
  x.lineWidth = 3;
  for (let i = px - 200; i < px + pw + 200; i += 42) {
    x.beginPath();
    x.moveTo(i, py);
    x.lineTo(i + 160, py + ph);
    x.stroke();
  }
  x.restore();

  const vid = item.p.video ? videoFor(teamId, item.p.id) : null;
  if (vid) {
    drawVideoCover(x, vid, item.p.videoCrop, px, py, pw, ph);
  } else {
    const img = imageFor(item.p.photo);
    if (img && img.complete && img.naturalWidth) {
      const k = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      x.drawImage(img, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
    } else {
      x.fillStyle = 'rgba(255,255,255,.92)';
      x.font = `800 138px ${FONT_MONO}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(item.p.num || '—', px + pw / 2, py + ph / 2 - 40);
    }
  }

  const scrim = x.createLinearGradient(0, py + ph - 230, 0, py + ph);
  scrim.addColorStop(0, 'rgba(6,13,9,0)');
  scrim.addColorStop(0.42, 'rgba(4,11,7,.5)');
  scrim.addColorStop(1, 'rgba(3,9,6,.94)');
  x.fillStyle = scrim;
  x.fillRect(px, py + ph - 230, pw, 230);
  x.restore();

  /* 底部信息条 */
  const bx = px + 18;
  const baseY = py + ph - 88;
  x.save();
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#e2f0e8';
  x.font = `700 11px ${FONT_MONO}`;
  spacedText(
    x,
    `#${item.p.num || '—'} · ${LABEL[item.pos] || item.pos || '球员'}`,
    bx,
    baseY,
    1.4,
    'left',
  );
  x.fillStyle = '#ffffff';
  x.font = `800 34px ${FONT_SYS}`;
  spacedText(x, fitSpaced(x, item.p.name, pw - 36, 2), bx, baseY + 38, 2, 'left');
  x.fillStyle = 'rgba(200,219,206,.92)';
  x.font = `500 11.5px ${FONT_SYS}`;
  x.fillText(
    `${item.pos || '位置未设置'}${item.p.captain ? ' · 队长' : ''}`,
    bx,
    baseY + 64,
  );
  x.restore();

  if (item.p.captain) {
    x.beginPath();
    x.arc(px + pw - 24, py + 24, 13, 0, Math.PI * 2);
    x.fillStyle = '#f2c94c';
    x.fill();
    x.fillStyle = '#231c00';
    x.font = `800 11px ${FONT_MONO}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('C', px + pw - 24, py + 25);
  }
  x.restore();
}

/** 用同一套设计坐标把舞台画进 canvas（1920×1080） */
export function paintShowFrame(
  x: CanvasRenderingContext2D,
  t: LineupTeam,
  list: ShowItem[],
  now: number,
): void {
  const S = 1.6; // 1200×675 设计稿 → 1920×1080
  const speed = SHOW_SLOW;
  x.setTransform(S, 0, 0, S, 0, 0);
  x.clearRect(0, 0, 1200, 675);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';

  drawBg(x);

  const lead = showTm.lead * speed;
  const step = showTm.step * speed;
  const rowIn = showTm.rowIn * speed;
  const active = now < lead ? -1 : Math.min(list.length - 1, Math.floor((now - lead) / step));
  const reveal = (i: number): number => (now < lead + i * step ? 0 : clamp01((now - lead - i * step) / rowIn));

  drawLeft(x, t, list, active, now, lead, step, rowIn);

  /* 中间竖版球场 */
  panel(x, L.midX, L.top, L.midW, L.bottom - L.top);
  drawField(x);
  list.forEach((item, i) => {
    const a = reveal(i);
    if (a <= 0) return;
    drawMarker(x, item, a, i === active);
  });

  /* 右侧球员大图 */
  if (active >= 0) {
    const st = lead + active * step;
    const fp = clamp01((now - st) / showTm.fade);
    if (active > 0) drawRight(x, t.id, list[active - 1], 1, 0);
    drawRight(x, t.id, list[active], fp, 12 * (1 - fp));
  } else {
    rrPath(x, L.rightX, L.top, L.rightW, L.bottom - L.top, 8);
    x.fillStyle = 'rgba(9,16,12,.74)';
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.14)';
    x.lineWidth = 1;
    rrPath(x, L.rightX + 0.5, L.top + 0.5, L.rightW - 1, L.bottom - L.top - 1, 8);
    x.stroke();
  }

  /* 水印 */
  x.fillStyle = 'rgba(255,255,255,.42)';
  x.font = `600 10px ${FONT_MONO}`;
  x.textBaseline = 'middle';
  spacedText(x, 'SOCCERBOARD · 队员介绍', 600, 662, 3, 'center');
}

import { FONT_MONO, FONT_SYS, LABEL } from '../core/formations';
import type { Player, Side, Team } from '../core/types';
import { imageFor } from './imageCache';

/** PLAYER TO WATCH 版面：1920 × 1080 横版转播画面 */
export const PW_W = 1920;
export const PW_H = 1080;

export interface PtwSide {
  side: Side;
  team: Team | null;
  player: Player | null;
  text: string;
  /** 该侧设置为「不展示」时，画面上不出现这张卡片 */
  hidden?: boolean;
}

export interface PlayerWatchOptions {
  home: PtwSide;
  away: PtwSide;
  /** 赛事 · 日期 */
  info: string;
  /** 入场进度 0~1（视频导出用，静态导出传 1 或省略） */
  reveal?: number;
  /** 退场进度 0~1，向黑场淡出（视频导出用） */
  exit?: number;
}

function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
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
  x.drawImage(img, px + (pw - iw * s) / 2, py + (ph - ih * s) / 2, iw * s, ih * s);
}

/** 中文按字符断行，最多 maxLines 行，超出末行加省略号 */
function wrapText(
  x: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const raw = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  for (const para of raw) {
    let cur = '';
    for (const ch of para) {
      const next = cur + ch;
      if (x.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
        if (lines.length >= maxLines) break;
      } else {
        cur = next;
      }
    }
    if (lines.length >= maxLines) break;
    lines.push(cur);
  }
  if (!lines.length) return [''];
  const rest = raw.join('').length;
  const shown = lines.join('').replace(/…$/, '').length;
  if (rest > shown) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && x.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines.slice(0, maxLines);
}

const CARD_W = 780;
const CARD_H = 800;
const CARD_Y = 190;
const PAD = 36;
const PHOTO_H = 430;
const PHOTO_W = Math.round(PHOTO_H * (2 / 3));

function paintCard(x: CanvasRenderingContext2D, s: PtwSide, cx: number, alpha: number, dy: number): void {
  const color = s.team?.color || '#2f6f4f';
  const cy = CARD_Y + dy;

  x.save();
  x.globalAlpha = alpha;

  /* 卡片底 */
  rr(x, cx, cy, CARD_W, CARD_H, 26);
  x.fillStyle = 'rgba(255,255,255,.045)';
  x.fill();
  x.strokeStyle = withAlpha(color, 0.45);
  x.lineWidth = 2;
  x.stroke();

  /* 顶部主色带 */
  x.save();
  rr(x, cx, cy, CARD_W, CARD_H, 26);
  x.clip();
  x.fillStyle = color;
  x.fillRect(cx, cy, CARD_W, 8);
  x.restore();

  /* 队名行 */
  const inX = cx + PAD;
  const inW = CARD_W - PAD * 2;
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.font = `700 15px ${FONT_MONO}`;
  x.fillText(s.side === 'home' ? 'HOME · 主队' : 'AWAY · 客队', inX, cy + 52);
  x.fillStyle = '#fff';
  x.font = `800 38px ${FONT_SYS}`;
  x.fillText(fitText(x, (s.team?.name || '').trim() || '待定', inW - 90), inX, cy + 96);

  x.textAlign = 'right';
  x.textBaseline = 'middle';
  rr(x, cx + CARD_W - PAD - 64, cy + 66, 64, 40, 10);
  x.fillStyle = withAlpha(color, 0.9);
  x.fill();
  x.fillStyle = '#fff';
  x.font = `800 20px ${FONT_MONO}`;
  x.fillText(((s.team?.code || 'SB').trim() || 'SB').slice(0, 4).toUpperCase(), cx + CARD_W - PAD - 32, cy + 87);

  /* 照片（2:3，居中） */
  const px = cx + (CARD_W - PHOTO_W) / 2;
  const py = cy + 118;
  x.save();
  rr(x, px, py, PHOTO_W, PHOTO_H, 18);
  x.clip();
  x.fillStyle = 'rgba(255,255,255,.06)';
  x.fillRect(px, py, PHOTO_W, PHOTO_H);
  const img = imageFor(s.player?.photo);
  if (img && img.complete && img.naturalWidth) {
    drawCover(x, img, px, py, PHOTO_W, PHOTO_H);
  } else {
    x.fillStyle = 'rgba(255,255,255,.16)';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `800 96px ${FONT_MONO}`;
    x.fillText(s.player?.num || '—', px + PHOTO_W / 2, py + PHOTO_H / 2 - 10);
    x.font = `600 20px ${FONT_SYS}`;
    x.fillStyle = 'rgba(255,255,255,.34)';
    x.fillText(s.player ? '暂无照片' : '未选择球员', px + PHOTO_W / 2, py + PHOTO_H / 2 + 76);
  }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.12)';
  x.lineWidth = 2;
  rr(x, px, py, PHOTO_W, PHOTO_H, 18);
  x.stroke();

  /* 号码 + 姓名 + 位置 */
  let nameY = py + PHOTO_H + 66;
  if (s.player) {
    const badge = 52;
    const badgeX = cx + (CARD_W - 300) / 2;
    x.beginPath();
    x.arc(badgeX + badge / 2, nameY - 14, badge / 2, 0, Math.PI * 2);
    x.fillStyle = color;
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.lineWidth = 2;
    x.stroke();
    x.fillStyle = '#fff';
    x.font = `800 24px ${FONT_MONO}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(s.player.num || '–', badgeX + badge / 2, nameY - 12);

    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = '#fff';
    x.font = `800 44px ${FONT_SYS}`;
    x.fillText(fitText(x, s.player.name.trim() || '未命名', inW - 92), badgeX + badge + 22, nameY);

    const pos = s.player.pos ? LABEL[s.player.pos] || s.player.pos : '球员';
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.font = `600 18px ${FONT_MONO}`;
    x.fillText(`${s.player.pos || '—'} · ${pos}`, badgeX + badge + 24, nameY + 28);
  } else {
    x.textAlign = 'center';
    x.fillStyle = 'rgba(255,255,255,.4)';
    x.font = `700 32px ${FONT_SYS}`;
    x.fillText('未选择球员', cx + CARD_W / 2, nameY - 6);
    x.font = `600 16px ${FONT_SYS}`;
    x.fillStyle = 'rgba(255,255,255,.26)';
    x.fillText('可在播放与导出前于第 4 步选择', cx + CARD_W / 2, nameY + 26);
  }

  /* 分隔线 */
  const divY = py + PHOTO_H + (s.player ? 120 : 96);
  x.strokeStyle = 'rgba(255,255,255,.1)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(inX, divY);
  x.lineTo(inX + inW, divY);
  x.stroke();

  /* 看点文本 */
  const textTop = divY + 44;
  const textBottom = cy + CARD_H - 30;
  const maxW = inW;
  x.textAlign = 'center';
  const body = (s.text || '').trim();
  if (!body) {
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.28)';
    x.font = `600 24px ${FONT_SYS}`;
    x.fillText('— 暂无看点 —', cx + CARD_W / 2, textTop + 36);
  } else {
    x.textBaseline = 'alphabetic';
    const probe = x;
    let size = 30;
    let lines: string[] = [];
    while (size >= 21) {
      probe.font = `600 ${size}px ${FONT_SYS}`;
      lines = wrapText(probe, body, maxW, 3);
      const lh = size + 16;
      const fits = textTop + (lines.length - 1) * lh <= textBottom - size;
      const complete = lines.join('').replace(/…$/, '') === body.replace(/\n/g, '');
      if (fits && (complete || size <= 22)) break;
      size -= 2;
    }
    probe.font = `600 ${size}px ${FONT_SYS}`;
    const lh = size + 16;
    const totalH = lines.length * lh;
    let ty = textTop + Math.max(0, (textBottom - textTop - totalH) / 2) + size;
    x.fillStyle = 'rgba(255,255,255,.88)';
    for (const line of lines) {
      x.fillText(line, cx + CARD_W / 2, ty);
      ty += lh;
    }
  }

  x.restore();
}

export function paintPlayerWatch(x: CanvasRenderingContext2D, o: PlayerWatchOptions): void {
  const reveal = Math.max(0, Math.min(1, o.reveal ?? 1));
  x.clearRect(0, 0, PW_W, PW_H);

  /* ---------- 背景 ---------- */
  const bg = x.createLinearGradient(0, 0, 0, PW_H);
  bg.addColorStop(0, '#0a1712');
  bg.addColorStop(0.52, '#07110a');
  bg.addColorStop(1, '#030705');
  x.fillStyle = bg;
  x.fillRect(0, 0, PW_W, PW_H);

  x.save();
  x.beginPath();
  x.rect(0, 520, PW_W, PW_H - 520);
  x.clip();
  x.fillStyle = '#0a1c13';
  x.fillRect(0, 520, PW_W, PW_H - 520);
  const stripe = PW_W / 26;
  for (let i = 0; i < 26; i += 2) {
    x.fillStyle = 'rgba(255,255,255,.02)';
    x.fillRect(i * stripe, 520, stripe, PW_H - 520);
  }
  x.restore();

  const glowL = x.createRadialGradient(500, 600, 60, 500, 600, 700);
  glowL.addColorStop(0, withAlpha(o.home.team?.color || '#2f6f4f', 0.18));
  glowL.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glowL;
  x.fillRect(0, 0, 960, PW_H);

  const glowR = x.createRadialGradient(1420, 600, 60, 1420, 600, 700);
  glowR.addColorStop(0, withAlpha(o.away.team?.color || '#2f6f4f', 0.18));
  glowR.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = glowR;
  x.fillRect(960, 0, 960, PW_H);

  const topFade = x.createLinearGradient(0, 0, 0, 260);
  topFade.addColorStop(0, 'rgba(0,0,0,.5)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = topFade;
  x.fillRect(0, 0, PW_W, 260);

  /* ---------- 标题 ---------- */
  const ta = Math.min(1, reveal * 2);
  x.save();
  x.globalAlpha = ta;
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  x.font = `800 58px ${FONT_SYS}`;
  x.fillText('PLAYER TO WATCH', PW_W / 2, 104);

  x.fillStyle = 'rgba(255,255,255,.45)';
  x.font = `700 16px ${FONT_MONO}`;
  x.fillText(o.info || 'PRE-MATCH FOCUS', PW_W / 2, 140);

  const lineW = 240;
  x.strokeStyle = 'rgba(255,255,255,.18)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(PW_W / 2 - 430, 88);
  x.lineTo(PW_W / 2 - 430 + lineW, 88);
  x.moveTo(PW_W / 2 + 430 - lineW, 88);
  x.lineTo(PW_W / 2 + 430, 88);
  x.stroke();
  x.fillStyle = 'rgba(126,240,168,.9)';
  x.beginPath();
  x.arc(PW_W / 2, 88, 5, 0, Math.PI * 2);
  x.fill();
  x.restore();

  /* ---------- 两侧卡片 ---------- */
  const shown = [o.home, o.away].filter((s) => !s.hidden);
  const alpha = Math.min(1, reveal * 1.6);
  const dy = (1 - alpha) * 26;

  if (shown.length === 0) {
    x.save();
    x.globalAlpha = ta;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.42)';
    x.font = `700 34px ${FONT_SYS}`;
    x.fillText('本场未展示 PLAYER TO WATCH', PW_W / 2, 520);
    x.fillStyle = 'rgba(255,255,255,.24)';
    x.font = `600 20px ${FONT_SYS}`;
    x.fillText('可在第 4 步取消「不展示」后重新导出', PW_W / 2, 566);
    x.restore();
  } else if (shown.length === 1) {
    paintCard(x, shown[0], (PW_W - CARD_W) / 2, alpha, dy);
  } else {
    paintCard(x, o.home, 110, alpha, dy);
    paintCard(x, o.away, PW_W - 110 - CARD_W, alpha, dy);
  }

  /* ---------- 中间 VS ---------- */
  if (shown.length === 2) {
    x.save();
    x.globalAlpha = ta;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,.22)';
    x.font = `800 40px ${FONT_MONO}`;
    x.fillText('VS', PW_W / 2, CARD_Y + CARD_H / 2);
    x.strokeStyle = 'rgba(255,255,255,.08)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(PW_W / 2, CARD_Y + 140);
    x.lineTo(PW_W / 2, CARD_Y + CARD_H / 2 - 48);
    x.moveTo(PW_W / 2, CARD_Y + CARD_H / 2 + 48);
    x.lineTo(PW_W / 2, CARD_Y + CARD_H - 140);
    x.stroke();
    x.restore();
  }

  /* ---------- 退场淡出 ---------- */
  const exitA = Math.max(0, Math.min(1, o.exit ?? 0));
  if (exitA > 0) {
    x.fillStyle = `rgba(0,0,0,${exitA})`;
    x.fillRect(0, 0, PW_W, PW_H);
  }
}

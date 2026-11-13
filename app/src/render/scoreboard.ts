import { FONT_MONO, FONT_SYS } from '../core/formations';

/** 比分板画布：1920 × 220，整块实底铺满，不依赖透明通道 */
export const SB_W = 1920;
export const SB_H = 220;

export interface ScoreboardTeam {
  /** 队伍显示名：三字代码 / 完整队名 / 自定义名称 */
  label: string;
  color: string;
}

export interface ScoreboardOptions {
  /** 顶部小字，留空则不画该行 */
  title: string;
  home: ScoreboardTeam;
  away: ScoreboardTeam;
  homeScore: number;
  awayScore: number;
  /** 入场进度 0~1（队色带自下滑入 + 淡入） */
  enter?: number;
  /** 比分数字落定进度 0~1（数字由大回弹到原尺寸） */
  pop?: number;
  /** 退场进度 0~1（内容淡出，底色保留） */
  exit?: number;
  /** 得分方高亮：home / away */
  flashSide?: 'home' | 'away';
  /** 高亮强度 0~1 */
  flash?: number;
}

/** 顶部小字通栏高度与字号 */
const TITLE_H = 72;
const TITLE_SIZE = 44;
/** 队色带起始高度 */
const BAND_Y = TITLE_H;
const BAND_H = SB_H - BAND_Y;
/** 左右队色带的斜切内边：顶部 / 底部（越靠内，中间的比分区越宽） */
const EDGE_TOP = 672;
const EDGE_BOTTOM = 736;
/** 实底与顶部通栏的底色 */
const BASE_COLOR = '#071227';
const TITLE_COLOR = '#060c1a';
/** 队名字号与最小可缩字号 */
const NAME_SIZE = 88;
const NAME_MIN = 44;
/** 比分数字字号与两个数字到中线的距离 */
const SCORE_SIZE = 116;
const SCORE_GAP = 148;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function fitText(x: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (x.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

/** 把 #rrggbb 调亮 / 调暗，amount 为 -1~1 */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return amount >= 0 ? '#d63b52' : '#7d1730';
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = ch.map((c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

/** 斜切边的横坐标（随高度线性变化） */
function edgeX(y: number): number {
  return EDGE_TOP + (EDGE_BOTTOM - EDGE_TOP) * ((y - BAND_Y) / BAND_H);
}

/** 左右队色带的路径 */
function bandPath(x: CanvasRenderingContext2D, side: 'home' | 'away'): void {
  if (side === 'home') {
    x.moveTo(0, BAND_Y);
    x.lineTo(EDGE_TOP, BAND_Y);
    x.lineTo(EDGE_BOTTOM, SB_H);
    x.lineTo(0, SB_H);
  } else {
    x.moveTo(SB_W, BAND_Y);
    x.lineTo(SB_W - EDGE_TOP, BAND_Y);
    x.lineTo(SB_W - EDGE_BOTTOM, SB_H);
    x.lineTo(SB_W, SB_H);
  }
  x.closePath();
}

/** 中间的比分暗块 */
function centerPath(x: CanvasRenderingContext2D): void {
  x.moveTo(EDGE_TOP, BAND_Y);
  x.lineTo(SB_W - EDGE_TOP, BAND_Y);
  x.lineTo(SB_W - EDGE_BOTTOM, SB_H);
  x.lineTo(EDGE_BOTTOM, SB_H);
  x.closePath();
}

function paintBand(
  x: CanvasRenderingContext2D,
  side: 'home' | 'away',
  color: string,
): void {
  x.save();
  x.beginPath();
  bandPath(x, side);
  const g =
    side === 'home'
      ? x.createLinearGradient(0, BAND_Y, EDGE_BOTTOM, SB_H)
      : x.createLinearGradient(SB_W, BAND_Y, SB_W - EDGE_BOTTOM, SB_H);
  const c = color || (side === 'home' ? '#c8102e' : '#1f6fd0');
  g.addColorStop(0, shade(c, 0.08));
  g.addColorStop(1, shade(c, -0.42));
  x.fillStyle = g;
  x.fill();
  x.restore();
}

function paintTeamLabel(
  x: CanvasRenderingContext2D,
  label: string,
  centerX: number,
  maxW: number,
): void {
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.shadowColor = 'rgba(0,0,0,.38)';
  x.shadowBlur = 14;
  x.shadowOffsetY = 2;

  const text = (label || '').trim() || '—';
  let size = NAME_SIZE;
  x.font = `800 ${size}px ${FONT_SYS}`;
  while (size > NAME_MIN && x.measureText(text).width > maxW) {
    size -= 2;
    x.font = `800 ${size}px ${FONT_SYS}`;
  }
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
    text.length <= 4 ? '4px' : '0px';
  x.fillText(fitText(x, text, maxW), centerX, BAND_Y + BAND_H / 2 + 2);
  x.restore();
}

export function paintScoreboard(x: CanvasRenderingContext2D, o: ScoreboardOptions): void {
  const enter = clamp01(o.enter ?? 1);
  const pop = clamp01(o.pop ?? 1);
  const exit = clamp01(o.exit ?? 0);
  const flash = Math.max(0, Math.min(1, o.flash ?? 0));

  /* ---------- 实底：整块铺满，PNG / 视频都不依赖透明通道 ---------- */
  x.clearRect(0, 0, SB_W, SB_H);
  x.fillStyle = BASE_COLOR;
  x.fillRect(0, 0, SB_W, SB_H);
  x.fillStyle = TITLE_COLOR;
  x.fillRect(0, 0, SB_W, TITLE_H);
  x.fillStyle = 'rgba(255,255,255,.10)';
  x.fillRect(0, 0, SB_W, 2);

  /* ---------- 顶部小字通栏 ---------- */
  const title = o.title.trim();
  if (title) {
    x.save();
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#dbe5f7';
    x.font = `700 ${TITLE_SIZE}px ${FONT_SYS}`;
    x.fillText(fitText(x, title, SB_W - 160), SB_W / 2, TITLE_H / 2 + 2);
    x.restore();
  }

  /* ---------- 队色带 + 比分：入场下滑，退场淡出（底色始终保留） ---------- */
  x.save();
  x.globalAlpha = 1 - exit;
  x.translate(0, (1 - enter) * 70);

  paintBand(x, 'home', o.home.color);
  paintBand(x, 'away', o.away.color);

  x.save();
  x.beginPath();
  centerPath(x);
  const sg = x.createLinearGradient(0, BAND_Y, 0, SB_H);
  sg.addColorStop(0, '#0e1c40');
  sg.addColorStop(0.55, '#081129');
  sg.addColorStop(1, '#040a1c');
  x.fillStyle = sg;
  x.fill();
  x.restore();

  /* 得分方高亮：整侧队色带叠加白色，比只高亮队名块更明显 */
  if (o.flashSide && flash > 0) {
    x.save();
    x.beginPath();
    bandPath(x, o.flashSide);
    x.clip();
    x.fillStyle = `rgba(255,255,255,${(flash * 0.2).toFixed(3)})`;
    x.fillRect(0, BAND_Y, SB_W, BAND_H);
    x.restore();
  }

  const midX = edgeX(BAND_Y + BAND_H / 2);
  const labelW = midX - 96;
  paintTeamLabel(x, o.home.label, midX / 2, labelW);
  paintTeamLabel(x, o.away.label, SB_W - midX / 2, labelW);

  /* 比分数字：落定时做一次回弹 */
  const cx = SB_W / 2;
  /* 数字字形重心偏上，基线整体下移，与队名视觉居中对齐 */
  const cy = BAND_Y + BAND_H / 2 + 14;
  const scale = 1 + 0.3 * Math.pow(1 - pop, 2);
  x.save();
  x.translate(cx, cy);
  x.scale(scale, scale);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';
  x.font = `800 ${SCORE_SIZE}px ${FONT_MONO}`;
  x.fillText(String(o.homeScore), -SCORE_GAP, 0);
  x.fillText(String(o.awayScore), SCORE_GAP, 0);
  x.fillStyle = 'rgba(255,255,255,.45)';
  x.beginPath();
  x.arc(0, 0, 8, 0, Math.PI * 2);
  x.fill();
  x.restore();

  /* 比分与队色带的细分割线 */
  x.strokeStyle = 'rgba(255,255,255,.14)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(EDGE_TOP, BAND_Y);
  x.lineTo(EDGE_BOTTOM, SB_H);
  x.moveTo(SB_W - EDGE_TOP, BAND_Y);
  x.lineTo(SB_W - EDGE_BOTTOM, SB_H);
  x.stroke();

  x.restore();
}

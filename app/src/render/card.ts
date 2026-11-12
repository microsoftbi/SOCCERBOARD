import { FONT_MONO, FONT_SYS } from '../core/formations';
import { playerById } from '../core/team';
import type { LineupTeam, ViewMode } from '../core/types';
import { imageFor } from './imageCache';

/* 缓动函数 */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (v: number): number => 1 - Math.pow(1 - v, 3);
export const easeOutBack = (v: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};

function rr(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  if (typeof (x as { roundRect?: unknown }).roundRect === 'function') {
    x.beginPath();
    x.roundRect(px, py, w, h, r);
    return;
  }
  const p = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + p, py);
  x.arcTo(px + w, py, px + w, py + h, p);
  x.arcTo(px + w, py + h, px, py + h, p);
  x.arcTo(px, py + h, px, py, p);
  x.arcTo(px, py, px + w, py, p);
  x.closePath();
}

/* 播出动画时间轴（毫秒）：黑场淡入 → 信息条滑入 → 球员按门将→后卫→中场→前锋逐个入场
   每名球员：圆泡缩放弹出 → 姓名上浮淡入 → 位置缩写淡入 */
export const ANIM = {
  fade: 300,
  info: 380,
  lead: 280,
  stagger: 240,
  bubble: 420,
  nameDelay: 170,
  name: 320,
  posDelay: 110,
  pos: 260,
  tail: 350,
};

export interface SlotReveal {
  b: number;
  n: number;
  p: number;
}

export interface Reveal {
  slot: SlotReveal[];
  info: number;
  overall: number;
}

export interface CardOptions {
  view: ViewMode;
  showPhoto: boolean;
  showName: boolean;
}

export function animTotalMs(n: number): number {
  return ANIM.lead + Math.max(0, n - 1) * ANIM.stagger + ANIM.bubble + ANIM.posDelay + ANIM.pos + ANIM.tail;
}

export function buildReveal(t: LineupTeam, el: number): Reveal {
  const slots = t.slots || [];
  const order = slots.map((s, i) => ({ i, y: s.y })).sort((a, b) => b.y - a.y);
  const slot = slots.map(() => ({ b: 0, n: 0, p: 0 }));
  order.forEach((o, k) => {
    const st = ANIM.lead + k * ANIM.stagger;
    slot[o.i].b = clamp01((el - st) / ANIM.bubble);
    slot[o.i].n = clamp01((el - st - ANIM.nameDelay) / ANIM.name);
    slot[o.i].p = clamp01((el - st - ANIM.bubble - ANIM.posDelay) / ANIM.pos);
  });
  return { slot, info: clamp01(el / ANIM.info), overall: clamp01(el / ANIM.fade) };
}

/** reveal 为空时绘制完整静态画面；否则按各元素进度绘制动画帧 */
export function paintCard(t: LineupTeam, opts: CardOptions, reveal?: Reveal): HTMLCanvasElement {
  const slots = t.slots || [];
  const rv: Reveal = reveal || { slot: slots.map(() => ({ b: 1, n: 1, p: 1 })), info: 1, overall: 1 };
  const horiz = opts.view === 'h';
  const W = horiz ? 1920 : 1080;
  const H = horiz ? 1440 : 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;

  /* 背景 */
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1714');
  bg.addColorStop(1, '#070d0b');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  /* 球场几何 */
  const padX = horiz ? 250 : 110;
  const top = horiz ? 24 : 250;
  const bot = horiz ? 216 : 370;
  const pw = W - padX * 2;
  const ph = H - top - bot;
  const min = Math.min(pw, ph);

  /* 草皮与条纹 */
  const gr = x.createLinearGradient(0, top, 0, top + ph);
  gr.addColorStop(0, '#1d7440');
  gr.addColorStop(1, '#155a31');
  x.fillStyle = gr;
  x.fillRect(padX, top, pw, ph);
  x.fillStyle = 'rgba(255,255,255,.045)';
  const bands = 12;
  const bh = ph / bands;
  for (let i = 0; i < bands; i += 2) x.fillRect(padX, top + i * bh, pw, bh);

  /* 标线 */
  const lw = Math.max(3, min * 0.008);
  x.strokeStyle = 'rgba(255,255,255,.55)';
  x.lineWidth = lw;
  x.strokeRect(padX, top, pw, ph);
  x.beginPath();
  x.moveTo(padX, top + ph / 2);
  x.lineTo(padX + pw, top + ph / 2);
  x.stroke();
  x.beginPath();
  x.arc(padX + pw / 2, top + ph / 2, min * 0.085, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.6)';
  x.beginPath();
  x.arc(padX + pw / 2, top + ph / 2, lw * 1.7, 0, Math.PI * 2);
  x.fill();

  const cx = padX + pw / 2;
  const boxW = pw * 0.58;
  const boxD = ph * 0.155;
  const gW = pw * 0.3;
  const gD = ph * 0.062;
  ([
    [top, 1],
    [top + ph, -1],
  ] as Array<[number, number]>).forEach((pair) => {
    const ey = pair[0];
    const dir = pair[1];
    x.strokeRect(cx - boxW / 2, dir === 1 ? ey : ey - boxD, boxW, boxD);
    x.strokeRect(cx - gW / 2, dir === 1 ? ey : ey - gD, gW, gD);
    const spotY = ey + dir * ph * 0.105;
    x.beginPath();
    x.arc(cx, spotY, lw * 1.7, 0, Math.PI * 2);
    x.fill();
    const r = min * 0.085;
    const d = boxD - ph * 0.105;
    const a = Math.asin(Math.min(1, d / r));
    x.beginPath();
    if (dir === 1) x.arc(cx, spotY, r, a, Math.PI - a);
    else x.arc(cx, spotY, r, Math.PI + a, Math.PI * 2 - a);
    x.stroke();
  });

  /* 信息条：先铺在球场底部，球员再绘制在上层，避免底部球员被压暗
     左侧滑入淡入 */
  const bandH = horiz ? 216 : 290;
  x.save();
  x.globalAlpha = clamp01(rv.info);
  const ip = easeOutCubic(clamp01(rv.info));
  x.translate((1 - ip) * -36, 0);
  const bandTop = horiz ? top + ph : H - bandH * 1.5;
  const lg = x.createLinearGradient(0, bandTop, 0, H);
  lg.addColorStop(0, 'rgba(4,10,7,0)');
  lg.addColorStop(0.45, horiz ? 'rgba(4,10,7,.6)' : 'rgba(4,10,7,.9)');
  lg.addColorStop(1, horiz ? 'rgba(4,10,7,.82)' : 'rgba(4,10,7,.97)');
  x.fillStyle = lg;
  x.fillRect(0, bandTop, W, H - bandTop);
  const inPad = horiz ? padX : 110;
  x.fillStyle = t.color;
  rr(x, inPad, H - bandH * 0.74, 14, bandH * 0.46, 7);
  x.fill();
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.fillStyle = '#fff';
  x.font = `800 ${Math.round(bandH * 0.3)}px ${FONT_SYS}`;
  x.fillText(t.name.trim() || '未命名球队', inPad + 42, H - bandH * 0.4);
  x.fillStyle = 'rgba(178,203,188,.95)';
  x.font = `600 ${Math.round(bandH * 0.135)}px ${FONT_MONO}`;
  x.fillText(
    `${t.code.trim() || '---'}   ·   ${t.count} 人制   ·   ${t.formation}   ·   ${t.side === 'home' ? '主队 HOME' : '客队 AWAY'}`,
    inPad + 42,
    H - bandH * 0.16,
  );
  x.textAlign = 'right';
  x.fillStyle = '#f2c94c';
  x.font = `800 ${Math.round(bandH * 0.155)}px ${FONT_MONO}`;
  x.fillText('PRE-MATCH LINEUP', W - inPad, H - bandH * 0.3);
  x.restore();

  /* 球员 */
  const r = horiz ? 46 : 54;
  slots.forEach((s, i) => {
    const p = s.pid != null ? playerById(t, s.pid) : undefined;
    const px = padX + (s.x / 100) * pw;
    const py = top + (s.y / 100) * ph;
    const rl = rv.slot[i] || { b: 1, n: 1, p: 1 };

    /* 圆泡 + 队长标：缩放弹出（空槽位保持静态虚线） */
    if (!p || rl.b > 0) {
      x.save();
      x.globalAlpha = p ? clamp01(rl.b) : 1;
      if (p) {
        const bs = Math.max(0.001, easeOutBack(clamp01(rl.b)));
        x.translate(px, py);
        x.scale(bs, bs);
        x.translate(-px, -py);
      }
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      const img = p ? imageFor(p.photo) : null;
      if (p && opts.showPhoto && img && img.complete && img.naturalWidth) {
        x.fillStyle = '#0a0f0d';
        x.fill();
        x.save();
        x.clip();
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const side = Math.min(iw, ih);
        x.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, px - r, py - r, r * 2, r * 2);
        x.restore();
        x.lineWidth = Math.max(3, r * 0.09);
        x.strokeStyle = 'rgba(255,255,255,.92)';
        x.stroke();
      } else if (p) {
        x.fillStyle = t.color;
        x.fill();
        x.lineWidth = Math.max(3, r * 0.09);
        x.strokeStyle = 'rgba(255,255,255,.92)';
        x.stroke();
        x.fillStyle = '#fff';
        x.font = `800 ${Math.round(r * 0.92)}px ${FONT_MONO}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(String(p.num || '–'), px, py + r * 0.05);
      } else {
        x.setLineDash([r * 0.3, r * 0.24]);
        x.lineWidth = 3.5;
        x.strokeStyle = 'rgba(255,255,255,.55)';
        x.stroke();
        x.setLineDash([]);
      }
      if (p && p.captain) {
        const bx = px + r * 0.74;
        const by = py - r * 0.74;
        const br = r * 0.34;
        x.beginPath();
        x.arc(bx, by, br, 0, Math.PI * 2);
        x.fillStyle = '#f2c94c';
        x.fill();
        x.lineWidth = 2.5;
        x.strokeStyle = '#231c00';
        x.stroke();
        x.fillStyle = '#231c00';
        x.font = `800 ${Math.round(br * 1.05)}px ${FONT_MONO}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('C', bx, by + br * 0.06);
      }
      x.restore();
    }

    /* 姓名条：上浮淡入 */
    let posY = py + r + 10;
    if (p && opts.showName && rl.n > 0) {
      const np = easeOutCubic(clamp01(rl.n));
      x.save();
      x.globalAlpha = np;
      const label = p.name.length > 7 ? p.name.slice(0, 7) + '…' : p.name;
      x.font = `600 ${Math.round(r * 0.5)}px ${FONT_SYS}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const tw = x.measureText(label).width;
      const rh = r * 0.72;
      const ny = posY + (1 - np) * 18;
      x.fillStyle = 'rgba(7,18,12,.86)';
      rr(x, px - tw / 2 - 10, ny, tw + 20, rh, rh * 0.32);
      x.fill();
      x.fillStyle = '#fff';
      x.fillText(label, px, ny + rh / 2 + 1);
      x.restore();
      posY += rh + 8;
    }

    /* 位置缩写：淡入 */
    if (rl.p > 0) {
      const pp = easeOutCubic(clamp01(rl.p));
      x.save();
      x.globalAlpha = pp;
      x.fillStyle = 'rgba(233,243,237,.9)';
      x.font = `600 ${Math.round(r * 0.4)}px ${FONT_MONO}`;
      x.textAlign = 'center';
      x.textBaseline = 'top';
      x.fillText(s.pos, px, posY + (1 - pp) * 8);
      x.restore();
    }
  });

  /* 整体入场：自黑场淡入 */
  if (rv.overall < 1) {
    x.fillStyle = `rgba(5,8,7,${(1 - clamp01(rv.overall)).toFixed(3)})`;
    x.fillRect(0, 0, W, H);
  }
  return c;
}

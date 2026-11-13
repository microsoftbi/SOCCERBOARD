<template>
  <div>
    <div class="scbstage">
      <canvas ref="cvEl" class="scbcanvas"></canvas>
    </div>

    <div class="scbplayrow">
      <button class="btn primary" @click="playing ? stop() : play()">
        {{ playing ? '■ 停止' : '▶ 播放比分变化' }}
      </button>
      <button class="btn" :disabled="!entries.length || busy" @click="exportVideo">
        {{ busy ? '录制中…' : '导出比分变化视频' }}
      </button>
    </div>

    <div class="statusline">
      <span class="t">SCORE</span>
      <span>{{ statusText }}</span>
    </div>
    <div v-if="entries.length" class="note">
      依次播放每条比分记录，得分方队色带高亮、比分数字回弹；导出实底 WebM，整块画面可直接使用。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { download } from '../core/utils';
import { SB_H, SB_W, paintScoreboard, type ScoreboardTeam } from '../render/scoreboard';
import { recordCanvas } from '../render/exportVideo';
import { activeMatch, notify, teamForSide } from '../stores/teamStore';

/** 每条比分记录的展示时长 */
const STEP = 2200;
/** 比分数字回弹时长 */
const POP = 450;
/** 得分方高亮衰减时长 */
const FLASH = 900;
/** 整条入场时长 */
const ENTER = 500;
/** 结尾淡出时长 */
const EXIT = 600;

const cvEl = ref<HTMLCanvasElement | null>(null);
const playing = ref(false);
const busy = ref(false);
const liveIdx = ref(0);
let raf = 0;
let recCancel: (() => void) | null = null;

const m = computed(() => activeMatch());
const entries = computed(() => m.value?.scoreLog || []);
const title = computed(() => m.value?.scoreTitle || '');

const homeTeam = computed(() => teamForSide('home', m.value));
const awayTeam = computed(() => teamForSide('away', m.value));
const homeLabel = computed(() => labelOf('home'));
const awayLabel = computed(() => labelOf('away'));

const totalMs = computed(() => Math.max(1800, entries.value.length * STEP));

const statusText = computed(() => {
  const list = entries.value;
  if (!list.length) return '还没有比分变化记录，请先在第 3 步「比分板」记录比分。';
  if (playing.value) {
    const e = list[Math.min(list.length - 1, liveIdx.value)];
    return `正在播放：第 ${Math.min(list.length, liveIdx.value + 1)} / ${list.length} 次变化 · ${e.home} : ${e.away}`;
  }
  return `共 ${list.length} 次比分变化 · 整段约 ${(totalMs.value / 1000).toFixed(1)} 秒`;
});

function codeOf(code: string, name: string): string {
  const raw = (code || name || '').trim().toUpperCase();
  return raw.slice(0, 3) || '—';
}

function labelOf(side: 'home' | 'away'): string {
  const team = side === 'home' ? homeTeam.value : awayTeam.value;
  const ui = m.value?.[side].ui;
  if (!team || !ui) return side === 'home' ? '主队' : '客队';
  const full = team.name?.trim() || (side === 'home' ? '主队' : '客队');
  const code = codeOf(team.code || '', team.name || '');
  if (ui.scoreNameMode === 'full') return full;
  if (ui.scoreNameMode === 'custom') return (ui.scoreName || '').trim() || code;
  return code;
}

function teamData(side: 'home' | 'away'): ScoreboardTeam {
  return {
    label: side === 'home' ? homeLabel.value : awayLabel.value,
    color: (side === 'home' ? homeTeam.value : awayTeam.value)?.color || (side === 'home' ? '#c8102e' : '#1f6fd0'),
  };
}

interface Frame {
  home: number;
  away: number;
  enter: number;
  pop: number;
  exit: number;
  flashSide?: 'home' | 'away';
  flash: number;
  idx: number;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 计算某一时刻的画面状态：当前是第几条记录、数字回弹与得分方高亮 */
function frameAt(el: number): Frame | null {
  const list = entries.value;
  if (!list.length) return null;
  /* rAF 时间戳可能略早于记录的起点，导致 el 为负，这里必须夹到 0，否则会取到 list[-1] */
  const t = Math.max(0, el);
  const idx = Math.min(list.length - 1, Math.floor(t / STEP));
  const local = t - idx * STEP;
  const cur = list[idx];
  const prev = idx > 0 ? list[idx - 1] : null;
  let flashSide: 'home' | 'away' | undefined;
  if (prev) {
    if (cur.home > prev.home) flashSide = 'home';
    else if (cur.away > prev.away) flashSide = 'away';
  }
  const exit = el > totalMs.value - EXIT
    ? Math.min(1, (el - (totalMs.value - EXIT)) / EXIT)
    : 0;
  return {
    home: cur.home,
    away: cur.away,
    enter: idx === 0 ? easeOut(Math.min(1, local / ENTER)) : 1,
    pop: Math.min(1, local / POP),
    exit,
    flashSide,
    flash: flashSide ? Math.max(0, 1 - local / FLASH) : 0,
    idx,
  };
}

/** 静止画面：显示最后一条记录的比分 */
function lastFrame(): Frame | null {
  const list = entries.value;
  if (!list.length) return null;
  const last = list[list.length - 1];
  return { home: last.home, away: last.away, enter: 1, pop: 1, exit: 0, flash: 0, idx: list.length - 1 };
}

function paintTo(cv: HTMLCanvasElement, f: Frame | null): void {
  if (cv.width !== SB_W || cv.height !== SB_H) {
    cv.width = SB_W;
    cv.height = SB_H;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  if (!f) {
    ctx.clearRect(0, 0, SB_W, SB_H);
    return;
  }
  paintScoreboard(ctx, {
    title: title.value,
    home: teamData('home'),
    away: teamData('away'),
    homeScore: f.home,
    awayScore: f.away,
    enter: f.enter,
    pop: f.pop,
    exit: f.exit,
    flashSide: f.flashSide,
    flash: f.flash,
  });
}

function drawIdle(): void {
  const cv = cvEl.value;
  if (!cv || playing.value || busy.value) return;
  paintTo(cv, lastFrame());
}

function stop(): void {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  playing.value = false;
  drawIdle();
}

function play(): void {
  const cv = cvEl.value;
  if (!cv) return;
  if (!entries.value.length) {
    notify('还没有比分变化记录，请先在第 3 步记录比分');
    return;
  }
  if (busy.value) return;
  if (playing.value) stop();
  const t0 = performance.now();
  playing.value = true;
  liveIdx.value = 0;
  const step = (now: number): void => {
    const el = now - t0;
    const f = frameAt(el);
    paintTo(cv, f);
    if (f) liveIdx.value = f.idx;
    if (el < totalMs.value) {
      raf = requestAnimationFrame(step);
    } else {
      raf = 0;
      playing.value = false;
      drawIdle();
    }
  };
  raf = requestAnimationFrame(step);
}

/** 优先选择 WebM（比分板为实底画面，不再依赖透明通道） */
function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const cand = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1.42E01E'];
  for (const mime of cand) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* 忽略不支持的类型 */
    }
  }
  return null;
}

function baseName(): string {
  const mm = m.value;
  const raw = (mm?.name || '').trim() || `${homeLabel.value}-${awayLabel.value}`;
  return raw.replace(/[\\/:*?"<>|\s]+/g, '_') || 'scoreboard';
}

async function exportVideo(): Promise<void> {
  if (busy.value || !entries.value.length) return;
  const mime = pickMime();
  const probe = document.createElement('canvas');
  if (!mime || typeof probe.captureStream !== 'function') {
    notify('当前浏览器不支持视频录制');
    return;
  }
  stop();
  const canvas = document.createElement('canvas');
  canvas.width = SB_W;
  canvas.height = SB_H;
  if (!canvas.getContext('2d')) return;

  busy.value = true;
  paintTo(canvas, frameAt(0));
  const total = totalMs.value;
  const handle = recordCanvas({
    canvas,
    mime,
    totalMs: total,
    fps: 30,
    bitsPerSecond: 8_000_000,
    paint: (el) => paintTo(canvas, frameAt(el)),
  });
  recCancel = handle.cancel;
  notify(`正在录制比分变化，约 ${(total / 1000).toFixed(1)} 秒，请勿切换页面`);
  let blob: Blob | null = null;
  try {
    blob = await handle.done;
  } finally {
    recCancel = null;
    busy.value = false;
  }
  if (!blob) {
    notify('录制未产生数据，请重试');
    drawIdle();
    return;
  }
  const ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
  download(`${baseName()}_比分变化.${ext}`, blob);
  notify('比分变化视频已导出');
  drawIdle();
}

watch(
  () => [entries.value.length, entries.value.map((e) => `${e.home}-${e.away}`).join(','), title.value, homeLabel.value, awayLabel.value, homeTeam.value?.color, awayTeam.value?.color],
  () => drawIdle(),
  { flush: 'post' },
);

onMounted(() => drawIdle());

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  recCancel?.();
});
</script>

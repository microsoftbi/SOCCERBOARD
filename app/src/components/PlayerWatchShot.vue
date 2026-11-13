<template>
  <div class="lspanel">
    <div class="castwrap">
      <canvas ref="cvEl" class="cast-canvas"></canvas>
    </div>

    <div class="showctl">
      <span class="lsLbl">本场看点</span>
      <span class="lsPage">{{ names }}</span>
      <span style="flex: 1"></span>
      <button class="btn" :disabled="recBusy" @click="togglePlay">{{ playing ? '■ 停止' : '▶ 播放' }}</button>
      <button class="btn" :disabled="recBusy" @click="exportVideo">{{ recBusy ? '录制中…' : '导出视频' }}</button>
      <button class="btn primary" :disabled="recBusy" @click="exportPng">导出 PNG</button>
    </div>

    <div class="statusline">
      <span class="t">EXPORT</span>
      <span>1920 × 1080 · {{ info }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { download, fileName, pickVideoMime } from '../core/utils';
import { ensurePlayerImages } from '../render/imageCache';
import { PW_H, PW_W, paintPlayerWatch, type PtwSide } from '../render/playerWatch';
import { recordCanvas } from '../render/exportVideo';
import { cur, notify, state } from '../stores/teamStore';

const cvEl = ref<HTMLCanvasElement | null>(null);
const recBusy = ref(false);
const playing = ref(false);
let recCancel: (() => void) | null = null;
let rafId = 0;
let playToken = 0;

const match = computed(() => state.matches.find((m) => m.id === state.activeMatchId) || null);
const t = computed(() => cur());

const sides = computed<{ home: PtwSide; away: PtwSide }>(() => {
  const m = match.value;
  const build = (side: 'home' | 'away'): PtwSide => {
    const teamId = m ? (side === 'home' ? m.homeTeamId : m.awayTeamId) : null;
    const team = state.teams.find((x) => x.id === teamId) || null;
    const ui = m?.[side].ui;
    const player = team?.players.find((p) => p.id === (ui?.ptwPid || 0)) || null;
    return { side, team, player, text: ui?.ptwText || '', hidden: ui?.ptwHide === true };
  };
  return { home: build('home'), away: build('away') };
});

const info = computed(() => {
  const m = match.value;
  if (!m) return 'PLAYER TO WATCH';
  return [m.competition, m.date].filter(Boolean).join(' · ') || 'PLAYER TO WATCH';
});

const names = computed(() => {
  const label = (s: PtwSide): string => (s.player ? `${s.player.num || '—'} ${s.player.name.trim() || '未命名'}` : '未选');
  return `${label(sides.value.home)}  ·  ${label(sides.value.away)}`;
});

function draw(reveal = 1, exit = 0): void {
  const el = cvEl.value;
  if (!el) return;
  if (el.width !== PW_W || el.height !== PW_H) {
    el.width = PW_W;
    el.height = PW_H;
  }
  const ctx = el.getContext('2d');
  if (!ctx) return;
  paintPlayerWatch(ctx, { ...sides.value, info: info.value, reveal, exit });
}

/** 播放与导出视频一致的时间线：淡入 1.9 秒，结尾淡出 1 秒 */
const PLAY_TOTAL = 8000;
const PLAY_IN = 1900;
const PLAY_OUT = 1000;

function stopPlay(): void {
  playToken++;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  playing.value = false;
  draw(1);
}

async function togglePlay(): Promise<void> {
  if (recBusy.value) return;
  if (playing.value) {
    stopPlay();
    return;
  }
  await render();
  const token = ++playToken;
  playing.value = true;
  const t0 = performance.now();
  const step = (now: number): void => {
    if (token !== playToken) return;
    const el = Math.max(0, now - t0);
    const reveal = Math.min(1, el / PLAY_IN);
    const exit = el > PLAY_TOTAL - PLAY_OUT ? Math.min(1, (el - (PLAY_TOTAL - PLAY_OUT)) / PLAY_OUT) : 0;
    draw(reveal, exit);
    if (el < PLAY_TOTAL) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = 0;
      playing.value = false;
      draw(1);
    }
  };
  rafId = requestAnimationFrame(step);
}

let seq = 0;
async function render(): Promise<void> {
  const cur = ++seq;
  const photos = [sides.value.home.player, sides.value.away.player].filter(Boolean).map((p) => ({ photo: p!.photo }));
  await ensurePlayerImages(photos);
  if (cur !== seq) return;
  draw(1);
}

async function exportPng(): Promise<void> {
  const el = cvEl.value;
  if (!el) return;
  draw(1);
  const name = fileName(t.value, 'png').replace(/\.png$/, '_PLAYER_TO_WATCH.png');
  el.toBlob((b) => {
    if (b) download(name, b);
  }, 'image/png');
}

/** 导出视频：8 秒，淡入 1.9 秒，结尾淡出 1 秒 */
async function exportVideo(): Promise<void> {
  if (recBusy.value) return;
  if (playing.value) stopPlay();
  const mime = pickVideoMime();
  const probe = document.createElement('canvas');
  if (!mime || typeof probe.captureStream !== 'function') {
    notify('当前浏览器不支持视频录制');
    return;
  }
  await render();
  const canvas = document.createElement('canvas');
  canvas.width = PW_W;
  canvas.height = PW_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const total = 8000;
  const fadeIn = 1900;
  const fadeOut = 1000;
  recBusy.value = true;
  draw(0);
  const handle = recordCanvas({
    canvas,
    mime,
    totalMs: total,
    fps: 30,
    bitsPerSecond: 12_000_000,
    paint: (el) => {
      const reveal = Math.min(1, el / fadeIn);
      const exit = el > total - fadeOut ? Math.min(1, (el - (total - fadeOut)) / fadeOut) : 0;
      paintPlayerWatch(ctx, { ...sides.value, info: info.value, reveal, exit });
    },
  });
  recCancel = handle.cancel;
  notify('正在录制 PLAYER TO WATCH，约 8 秒，请勿切换页面');
  let blob: Blob | null = null;
  try {
    blob = await handle.done;
  } finally {
    recCancel = null;
    recBusy.value = false;
  }
  if (!blob) {
    notify('录制未产生数据，请重试');
    draw(1);
    return;
  }
  const ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
  const name = `${fileName(t.value, ext).replace(/\.\w+$/, '')}_PLAYER_TO_WATCH.${ext}`;
  download(name, blob);
  notify('PLAYER TO WATCH 视频已导出');
  draw(1);
}

watch(
  () => [
    match.value?.home.ui.ptwPid,
    match.value?.home.ui.ptwText,
    match.value?.home.ui.ptwHide,
    match.value?.away.ui.ptwPid,
    match.value?.away.ui.ptwText,
    match.value?.away.ui.ptwHide,
    match.value?.competition,
    match.value?.date,
  ],
  () => void render(),
  { flush: 'post' },
);

onMounted(() => void render());

onBeforeUnmount(() => {
  playToken++;
  if (rafId) cancelAnimationFrame(rafId);
  recCancel?.();
});
</script>

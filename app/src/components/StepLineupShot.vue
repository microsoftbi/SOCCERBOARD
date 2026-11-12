<template>
  <div class="lspanel">
    <div class="castwrap">
      <canvas ref="cvEl" class="cast-canvas ls-canvas"></canvas>
    </div>

    <div class="showctl">
      <span class="lsLbl">出场顺序</span>
      <div class="seg">
        <button
          v-for="(g, i) in groups"
          :key="g.label"
          type="button"
          :aria-pressed="pageSafe === i ? 'true' : 'false'"
          @click="page = i"
        >
          {{ g.label }} {{ g.items.length }}
        </button>
      </div>
      <button class="btn ghost sm" :disabled="pageSafe === 0" @click="page--">‹ 上一组</button>
      <span class="lsPage">{{ currentLabel }}</span>
      <button class="btn ghost sm" :disabled="pageSafe >= pages.length - 1" @click="page++">下一组 ›</button>
      <button class="toggle" :aria-pressed="showField ? 'true' : 'false'" @click="showField = !showField">小球场</button>
      <button class="toggle" :aria-pressed="showNames ? 'true' : 'false'" @click="showNames = !showNames">姓名条</button>
      <button class="toggle" :aria-pressed="showInfo ? 'true' : 'false'" @click="showInfo = !showInfo">比赛信息</button>
      <span style="flex: 1"></span>
      <button class="btn" :disabled="!pages.length || playing || recBusy" @click="playAll">▶ 逐组演示</button>
      <button class="btn" :disabled="!pages.length || recBusy" @click="exportVideo">{{ recBusy ? '录制中…' : '导出视频' }}</button>
      <button class="btn primary" :disabled="!pages.length || recBusy" @click="exportPng">导出 PNG</button>
    </div>

    <div class="lsorder">
      <span class="lsLbl">当前组顺序</span>
      <button
        v-for="it in current"
        :key="it.p.id"
        type="button"
        class="lschip"
        :aria-pressed="selId === it.p.id ? 'true' : 'false'"
        @click="selId = it.p.id"
      >
        <b>{{ it.p.num || '—' }}</b>
        <span>{{ it.p.name.trim() || '未命名' }}</span>
        <em>{{ posLabel(it.pos) }}</em>
      </button>
      <button class="btn ghost sm" :disabled="!canShift(-1)" @click="shift(-1)">← 前移</button>
      <button class="btn ghost sm" :disabled="!canShift(1)" @click="shift(1)">后移 →</button>
    </div>

    <div class="statusline">
      <span class="t">EXPORT</span>
      <span>1920 × 1080 · 共 {{ sorted.length }} 名首发 · {{ currentLabel }} {{ current.length }} 人</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { download, fileName, pickVideoMime } from '../core/utils';
import { ensurePlayerImages, ensurePlayerVideos, eachVideo, videoElFor, videoFor } from '../render/imageCache';
import { recordCanvas } from '../render/exportVideo';
import { LS_H, LS_W, LINE_LABELS, lineRank, paintLineupShot, posLabel, sortLineup } from '../render/lineupShot';
import { showcaseList, type ShowItem } from '../render/showcase';
import { cur, getVideoUrl, notify, state } from '../stores/teamStore';

const t = computed(() => cur());
const base = computed(() => sortLineup(showcaseList(t.value)));

/** 手动微调后的顺序（球员 id 序列）；为空表示按位置自动排序 */
const override = ref<number[] | null>(null);

const sorted = computed<ShowItem[]>(() => {
  const list = base.value;
  const ov = override.value;
  if (!ov) return list;
  const rank = new Map(ov.map((id, i) => [id, i]));
  return [...list].sort((a, b) => (rank.get(a.p.id) ?? 999) - (rank.get(b.p.id) ?? 999));
});

const page = ref(0);
const selId = ref(0);
const playing = ref(false);
const showField = ref(true);
const showNames = ref(true);
const showInfo = ref(true);
const recBusy = ref(false);

/** 每组出席时长（逐组演示 / 导出视频共用） */
const GROUP_MS = 4400;

/** 按位置线分组：守门员 → 后卫 → 中场 → 前场，空组不展示 */
const groups = computed(() => {
  const buckets: ShowItem[][] = [[], [], [], []];
  for (const it of sorted.value) buckets[lineRank(it)].push(it);
  return LINE_LABELS.map((label, i) => ({ label, items: buckets[i] })).filter((g) => g.items.length > 0);
});

const pages = computed<ShowItem[][]>(() => groups.value.map((g) => g.items));

const pageSafe = computed(() => Math.min(page.value, Math.max(0, pages.value.length - 1)));
const current = computed<ShowItem[]>(() => pages.value[pageSafe.value] || []);
const currentLabel = computed(() => groups.value[pageSafe.value]?.label || '');

const match = computed(() => state.matches.find((m) => m.id === state.activeMatchId) || null);
const infoVs = computed(() => {
  const m = match.value;
  if (!m || !t.value) return '';
  const oppId = t.value.side === 'home' ? m.awayTeamId : m.homeTeamId;
  const opp = state.teams.find((x) => x.id === oppId);
  return `VS ${opp?.name.trim() || '待定'}`;
});
const infoLine = computed(() => {
  const m = match.value;
  if (!m) return '';
  return [m.competition, m.date].filter(Boolean).join(' · ');
});

watch(
  () => pages.value.length,
  (len) => {
    if (page.value > len - 1) page.value = Math.max(0, len - 1);
  },
);

watch(
  () => current.value,
  (list) => {
    if (!list.some((x) => x.p.id === selId.value)) selId.value = list[0]?.p.id || 0;
  },
  { immediate: true },
);

function canShift(dir: number): boolean {
  const idx = sorted.value.findIndex((x) => x.p.id === selId.value);
  const j = idx + dir;
  return idx >= 0 && j >= 0 && j < sorted.value.length;
}

function shift(dir: number): void {
  if (!canShift(dir)) return;
  const ids = sorted.value.map((x) => x.p.id);
  const idx = ids.indexOf(selId.value);
  const j = idx + dir;
  [ids[idx], ids[j]] = [ids[j], ids[idx]];
  override.value = ids;
}

const cvEl = ref<HTMLCanvasElement | null>(null);
let renderSeq = 0;
let rafId = 0;
let lastFrame = 0;
/** 已播完的球员 id：播完即停在最后一帧，不再重播 */
const finished = new Set<number>();
let groupKey = '';

/* ---------- 分组切换淡入淡出 ---------- */
const FADE_MS = 800;
/** 切换前的画面快照，用来和当前画面交叉淡化 */
let fadeFrom: HTMLCanvasElement | null = null;
let fadeStart = 0;
let fadeRafId = 0;
let drawn = false;

function captureFadeSource(): void {
  const el = cvEl.value;
  if (!el || !drawn || !el.width) return;
  const buf = document.createElement('canvas');
  buf.width = el.width;
  buf.height = el.height;
  buf.getContext('2d')?.drawImage(el, 0, 0);
  fadeFrom = buf;
  fadeStart = 0;
}

function startFadeLoop(): void {
  if (fadeRafId) return;
  const tick = (): void => {
    drawNow();
    fadeRafId = fadeFrom ? requestAnimationFrame(tick) : 0;
  };
  fadeRafId = requestAnimationFrame(tick);
}

function stopFade(): void {
  if (fadeRafId) cancelAnimationFrame(fadeRafId);
  fadeRafId = 0;
  fadeFrom = null;
  fadeStart = 0;
}

function drawNow(): void {
  const el = cvEl.value;
  if (!el || !t.value) return;
  if (el.width !== LS_W || el.height !== LS_H) {
    el.width = LS_W;
    el.height = LS_H;
  }
  const ctx = el.getContext('2d');
  if (!ctx) return;
  paintLineupShot(ctx, {
    team: t.value,
    all: sorted.value,
    items: current.value,
    showField: showField.value,
    showNames: showNames.value,
    showInfo: showInfo.value,
    infoVs: infoVs.value,
    infoLine: infoLine.value,
    videoOf: (it) => videoFor(t.value.id, it.p.id),
  });
  drawn = true;
  if (!fadeFrom) return;
  if (!fadeStart) fadeStart = performance.now();
  const p = Math.min(1, (performance.now() - fadeStart) / FADE_MS);
  if (p >= 1) {
    fadeFrom = null;
    fadeStart = 0;
    return;
  }
  const eased = 1 - (1 - p) ** 3;
  ctx.save();
  ctx.globalAlpha = 1 - eased;
  ctx.drawImage(fadeFrom, 0, 0);
  ctx.restore();
}

function stopLoop(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

/** 让当前组视频从截取起点重新开始（仅在已解码时跳转，避免加载中被 seek 卡住） */
function seekGroupStart(): void {
  for (const it of current.value) {
    const v = videoFor(t.value.id, it.p.id);
    if (!v || v.readyState < 2) continue;
    v.loop = false;
    const start = it.p.videoTrim?.start ?? 0;
    if (Math.abs(v.currentTime - start) > 0.02) {
      try {
        v.currentTime = start;
      } catch {
        /* 忽略 */
      }
    }
  }
}

/** 重新播放当前组（切换分组 / 逐组演示时调用） */
function restartVideos(): void {
  finished.clear();
  seekGroupStart();
  stopLoop();
  if (current.value.some((x) => x.p.video)) startLoop();
}

/** 当前组存在视频时持续重绘；播放结束停在最后一帧，不循环 */
function startLoop(): void {
  if (rafId) return;
  const tick = (ts: number): void => {
    const list = current.value;
    const vids = list
      .map((it) => ({ it, v: videoElFor(t.value.id, it.p.id) }))
      .filter((x): x is { it: ShowItem; v: HTMLVideoElement } => !!x.v);
    if (!vids.length) {
      stopLoop();
      return;
    }
    for (const { it, v } of vids) {
      if (finished.has(it.p.id)) continue;
      v.loop = false;
      const trim = it.p.videoTrim;
      const start = trim?.start ?? 0;
      // 截取起点在播放前跳到：等解码完成后再 seek，避免卡在加载中
      if (trim && !v.seeking && v.currentTime < start - 0.02) {
        v.currentTime = start;
        continue;
      }
      if (v.ended || (trim && v.currentTime >= trim.end - 0.04)) {
        v.pause();
        finished.add(it.p.id);
      } else if (v.paused) {
        void v.play().catch(() => {});
      }
    }
    if (ts - lastFrame >= 40) {
      lastFrame = ts;
      drawNow();
    }
    if (vids.every(({ it }) => finished.has(it.p.id))) {
      drawNow();
      stopLoop();
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

async function render(): Promise<void> {
  if (!t.value) return;
  const seq = ++renderSeq;
  const key = `${t.value.id}|${pageSafe.value}|${current.value.map((x) => x.p.id).join(',')}`;
  const switched = key !== groupKey;
  if (switched) {
    captureFadeSource();
    // 离开的组立即停止播放，避免在后台继续走片，下次展示时不在开头
    stopLoop();
    eachVideo((v) => v.pause());
  }
  const videos = sorted.value.filter((x) => x.p.video);
  await ensurePlayerImages(sorted.value.map((x) => x.p));
  if (videos.length) {
    await ensurePlayerVideos(
      t.value.id,
      videos.map((x) => x.p),
      (p) => getVideoUrl(p),
    );
  }
  if (seq !== renderSeq) return;
  if (switched) {
    groupKey = key;
    finished.clear();
    seekGroupStart();
  }
  drawNow();
  if (current.value.some((x) => x.p.video)) startLoop();
  if (switched) startFadeLoop();
}

watch(
  [() => current.value, showField, showNames, showInfo, infoVs, infoLine, () => t.value?.id],
  () => void render(),
  { flush: 'post' },
);

onMounted(() => void render());

let playTimer: ReturnType<typeof setTimeout> | null = null;

function stopPlay(): void {
  playing.value = false;
  if (playTimer) clearTimeout(playTimer);
  playTimer = null;
}

function playAll(): void {
  if (!pages.value.length) return;
  stopPlay();
  playing.value = true;
  page.value = 0;
  restartVideos();
  const step = (i: number): void => {
    if (!playing.value) return;
    page.value = i;
    playTimer = setTimeout(() => {
      if (i + 1 < pages.value.length) step(i + 1);
      else playing.value = false;
    }, GROUP_MS);
  };
  step(0);
}

function exportPng(): void {
  const el = cvEl.value;
  if (!el) return;
  stopFade();
  drawNow();
  const name = fileName(t.value, 'png').replace(/\.png$/, `_合影_${currentLabel.value || '首发'}.png`);
  el.toBlob((b) => {
    if (b) download(name, b);
  }, 'image/png');
}

/** 导出视频：按位置线顺序逐组播放，组间交叉淡化，视频播完停在最后一帧 */
async function exportVideo(): Promise<void> {
  if (recBusy.value) return;
  const team = t.value;
  const list = pages.value;
  if (!team || !list.length) {
    notify('还没有可展示的球员');
    return;
  }
  const mime = pickVideoMime();
  const canvas = document.createElement('canvas');
  if (!mime || typeof canvas.captureStream !== 'function') {
    notify('当前浏览器不支持视频录制');
    return;
  }
  canvas.width = LS_W;
  canvas.height = LS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  stopPlay();
  stopLoop();
  stopFade();

  await ensurePlayerImages(sorted.value.map((x) => x.p));
  const videos = sorted.value.filter((x) => x.p.video);
  if (videos.length) {
    await ensurePlayerVideos(
      team.id,
      videos.map((x) => x.p),
      (p) => getVideoUrl(p),
    );
  }

  const opts = (items: ShowItem[]) => ({
    team,
    all: sorted.value,
    items,
    showField: showField.value,
    showNames: showNames.value,
    showInfo: showInfo.value,
    infoVs: infoVs.value,
    infoLine: infoLine.value,
    videoOf: (it: ShowItem) => videoFor(team.id, it.p.id),
  });

  /* 录制期间：视频只在所属分组登场时才开始播放，播完停在最后一帧 */
  const cine: Array<{ v: HTMLVideoElement; start: number; end: number; group: number }> = [];
  list.forEach((items, gi) => {
    for (const { p } of items) {
      if (!p.video) continue;
      const v = videoElFor(team.id, p.id);
      if (!v) continue;
      v.loop = false;
      v.pause();
      cine.push({
        v,
        start: p.videoTrim?.start ?? 0,
        end: p.videoTrim?.end ?? Number.POSITIVE_INFINITY,
        group: gi,
      });
    }
  });
  let activeGroup = -1;
  /** 某组登场：本组视频回到起点开播，其它组一律暂停 */
  const startGroup = (gi: number): void => {
    if (gi === activeGroup) return;
    activeGroup = gi;
    for (const c of cine) {
      if (c.group !== gi) {
        if (!c.v.paused) c.v.pause();
        continue;
      }
      try {
        c.v.currentTime = c.start;
      } catch {
        /* 忽略 */
      }
      void c.v.play().catch(() => {});
    }
  };
  const clampTrim = (): void => {
    for (const c of cine) {
      if (c.group !== activeGroup) continue;
      if (c.v.ended || c.v.currentTime >= c.end - 0.04) {
        if (!c.v.paused) c.v.pause();
        if (Number.isFinite(c.end)) {
          try {
            c.v.currentTime = Math.max(c.start, c.end - 0.04);
          } catch {
            /* 忽略 */
          }
        }
      }
    }
  };

  const total = list.length * GROUP_MS;
  const paint = (el: number): void => {
    const idx = Math.min(list.length - 1, Math.max(0, Math.floor(el / GROUP_MS)));
    startGroup(idx);
    clampTrim();
    const local = el - idx * GROUP_MS;
    if (idx > 0 && local < FADE_MS) {
      paintLineupShot(ctx, opts(list[idx - 1]));
      const p = Math.min(1, local / FADE_MS);
      ctx.save();
      ctx.globalAlpha = 1 - (1 - p) ** 3;
      paintLineupShot(ctx, opts(list[idx]));
      ctx.restore();
      return;
    }
    paintLineupShot(ctx, opts(list[idx]));
  };
  paint(0); // 首帧先铺好，避免开头闪白

  recBusy.value = true;
  const handle = recordCanvas({
    canvas,
    mime,
    totalMs: total,
    fps: 30,
    bitsPerSecond: 12_000_000,
    paint,
  });
  notify(`正在录制队员介绍，约 ${Math.round(total / 1000)} 秒，请勿切换页面`);
  let blob: Blob | null = null;
  try {
    blob = await handle.done;
  } finally {
    cine.forEach(({ v }) => v.pause());
    recBusy.value = false;
  }
  if (!blob) {
    notify('录制未产生数据，请重试');
    restartVideos();
    return;
  }
  const ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
  const name = `${fileName(team, ext).replace(/\.\w+$/, '')}_合影介绍.${ext}`;
  download(name, blob);
  notify('队员介绍视频已导出');
  restartVideos();
}

onBeforeUnmount(() => {
  stopPlay();
  stopLoop();
  stopFade();
  eachVideo((v) => v.pause());
});
</script>

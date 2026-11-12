<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>{{ tab === 'board' ? '播出站位图' : tab === 'show' ? '队员介绍' : '队员介绍2' }} · {{ t.name.trim() || '未命名' }}</h2>
        <p v-if="tab === 'board'">
          预览画面即导出画面，{{ ui.view === 'h' ? '横向 1920 × 1440' : '纵向 1080 × 1920（竖屏播出 / 更衣室大屏）' }}。点击「播放动画」预览入场效果，动画可导出为 MP4 / WebM 视频；导出 PNG 为完整静态画面。
        </p>
        <p v-else-if="tab === 'show'">
          转播风格介绍页：左侧名单自门将向锋线逐行入场，中间竖版球场的号码标记与名单同步高亮，右侧展示当前球员的大图或视频。点击任意一行即可切换介绍对象。
        </p>
        <p v-else>
          合影介绍页：1920 × 1080 横版画面，按守门员 → 后卫 → 中场 → 前场的顺序分组展示，组内人数随阵型自动变化，左侧小球场同步高亮本组球员。
        </p>
      </div>
      <span class="chipstat" :class="{ ok: canExport }">
        {{ tab === 'board' ? (canExport ? '可导出' : '草稿') : `${t.count} 人制 · ${t.formation}` }}
      </span>
    </div>
    <div class="castctl">
      <div class="seg casttabs">
        <button type="button" :aria-pressed="tab === 'board' ? 'true' : 'false'" @click="tab = 'board'">
          站位图
        </button>
        <button type="button" :aria-pressed="tab === 'show' ? 'true' : 'false'" @click="tab = 'show'">
          队员介绍
        </button>
        <button type="button" :aria-pressed="tab === 'group' ? 'true' : 'false'" @click="tab = 'group'">
          队员介绍2
        </button>
      </div>
      <template v-if="tab === 'board'">
        <div class="seg">
          <button type="button" :aria-pressed="ui.view === 'h' ? 'true' : 'false'" @click="setViewMode('h')">横向 16:9</button>
          <button type="button" :aria-pressed="ui.view === 'v' ? 'true' : 'false'" @click="setViewMode('v')">纵向 9:16</button>
        </div>
        <button
          type="button"
          class="toggle"
          :aria-pressed="ui.showPhoto ? 'true' : 'false'"
          @click="toggleFlag('showPhoto')"
        >
          显示头像
        </button>
        <button
          type="button"
          class="toggle"
          :aria-pressed="ui.showName ? 'true' : 'false'"
          @click="toggleFlag('showName')"
        >
          显示姓名
        </button>
      </template>
      <span class="expinfo">{{ t.count }} 人制 · {{ t.formation }} · {{ t.side === 'home' ? '主队' : '客队' }}</span>
      <span style="flex: 1"></span>
      <button
        v-if="tab === 'board'"
        type="button"
        class="btn"
        title="球员按门将→后卫→中场→前锋依次入场；双击画面也可重播"
        @click="playAnim"
      >
        ▶ 播放动画
      </button>
    </div>
    <template v-if="tab === 'board'">
      <div :class="note.cls" class="on">{{ note.text }}</div>
      <div class="castwrap">
        <canvas
          ref="canvasEl"
          class="cast-canvas"
          :class="{ vertical: ui.view === 'v' }"
          @dblclick="playAnim"
        ></canvas>
      </div>
      <div class="statusline">
        <span class="t">EXPORT</span><span>{{ blockReason ? '导出不可用：' + blockReason : '' }}</span>
      </div>
      <div v-if="v.warnings.length && canExport" class="warnbox on">{{ v.warnings.join('；') }}</div>
    </template>
    <StepShowcase v-else-if="tab === 'show'" />
    <StepLineupShot v-else />
    <div class="btnrow">
      <button class="btn ghost" @click="goStep(3)">上一步</button>
      <template v-if="tab === 'board'">
        <button class="btn primary" :disabled="!canExport" @click="exportPng">导出站位图 PNG</button>
        <button
          class="btn"
          :disabled="!canExport || !mime || recording"
          title="把入场动画录制成视频文件；录制期间请停留在本页"
          @click="exportAnimVideo"
        >
          导出动画视频{{ mimeLabel }}
        </button>
        <button class="btn" :disabled="!canExport" @click="exportJson">导出名单 JSON</button>
      </template>
      <span class="meta expinfo">
        {{ t.exportedAt ? `最近导出：${fmtTime(t.exportedAt)}` : '尚未导出' }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { animTotalMs, buildReveal, paintCard } from '../render/card';
import { ensurePlayerImages } from '../render/imageCache';
import { recordCanvas, type RecordHandle } from '../render/exportVideo';
import { colorClose, download, fileName, fmtTime, buildJson, pickVideoMime } from '../core/utils';
import { validateLineup } from '../core/validate';
import {
  activeUi,
  cur,
  goStep,
  markExported,
  notify,
  setViewMode,
  state,
  teamForSide,
  toggleFlag,
} from '../stores/teamStore';
import type { CardOptions } from '../render/card';
import StepShowcase from './StepShowcase.vue';
import StepLineupShot from './StepLineupShot.vue';

const tab = ref<'board' | 'show' | 'group'>('board');
const canvasEl = ref<HTMLCanvasElement | null>(null);
const animating = ref(false);
const recording = ref(false);
let rafId = 0;
let animToken = 0;
let recHandle: RecordHandle | null = null;
let paintToken = 0;

const t = computed(() => cur());
const ui = computed(() => activeUi());
const v = computed(() => validateLineup(t.value));
const missing = computed(() => (t.value.slots || []).filter((s) => s.pid == null).length);
const canExport = computed(() => v.value.ok && missing.value === 0);
const mime = computed(() => pickVideoMime());
const mimeLabel = computed(() => (mime.value ? (mime.value.indexOf('mp4') > -1 ? '（MP4）' : '（WebM）') : '（此浏览器不支持）'));
const note = computed(() => {
  if (!v.value.ok) return { cls: 'errbox', text: v.value.errors[0] };
  if (missing.value) return { cls: 'warnbox', text: `草稿态：还有 ${missing.value} 个位置未安排球员，此时不能导出图片。` };
  if (t.value.exportedAt) return { cls: 'okbox', text: `画面与最近一次导出一致（${fmtTime(t.value.exportedAt)}）。` };
  return { cls: 'okbox', text: '画面已完整，可直接导出；导出内容与预览一致。' };
});
const blockReason = computed(() =>
  canExport.value ? '' : v.value.errors[0] || `还有 ${missing.value} 个位置未安排球员`,
);

function opts(): CardOptions {
  return { view: ui.value.view, showPhoto: ui.value.showPhoto, showName: ui.value.showName };
}

function drawStatic(): void {
  const cv = canvasEl.value;
  if (!cv) return;
  const card = paintCard(cur(), opts());
  if (cv.width !== card.width || cv.height !== card.height) {
    cv.width = card.width;
    cv.height = card.height;
  }
  cv.getContext('2d')!.drawImage(card, 0, 0);
}

function cancelAnim(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  animToken++;
  animating.value = false;
  if (recHandle) {
    const h = recHandle;
    recHandle = null;
    recording.value = false;
    h.cancel();
  }
}

function paintPreview(): void {
  if (recording.value) return;
  cancelAnim();
  drawStatic();
  const token = ++paintToken;
  void ensurePlayerImages(cur().players).then(() => {
    if (token === paintToken && !animating.value && !recording.value) drawStatic();
  });
}

async function playAnim(): Promise<void> {
  if (recording.value) return;
  const cv = canvasEl.value;
  if (!cv) return;
  const team = cur();
  if (!(team.slots || []).some((s) => s.pid != null)) {
    notify('还没有落位球员，请先完成站位编排');
    return;
  }
  cancelAnim();
  const token = animToken;
  await ensurePlayerImages(team.players);
  if (token !== animToken || !canvasEl.value) return;
  const total = animTotalMs((team.slots || []).length);
  const t0 = performance.now();
  animating.value = true;
  const step = (now: number): void => {
    const el = now - t0;
    const card = paintCard(team, opts(), buildReveal(team, el));
    const c = canvasEl.value;
    if (!c) return;
    if (c.width !== card.width) {
      c.width = card.width;
      c.height = card.height;
    }
    c.getContext('2d')!.drawImage(card, 0, 0);
    if (el < total) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = 0;
      animating.value = false;
      drawStatic();
    }
  };
  rafId = requestAnimationFrame(step);
}

async function exportAnimVideo(): Promise<void> {
  if (recording.value) return;
  const team = cur();
  const cv = canvasEl.value;
  if (!(team.slots || []).some((s) => s.pid != null)) {
    notify('还没有落位球员，请先完成站位编排');
    return;
  }
  const m = mime.value;
  if (!m || !cv || typeof cv.captureStream !== 'function') {
    notify('当前浏览器不支持动画录制，请改用导出 PNG');
    return;
  }
  cancelAnim();
  await ensurePlayerImages(team.players);
  if (!canvasEl.value) return;
  const total = animTotalMs((team.slots || []).length) + 600;
  /* 先铺好黑场首帧，避免视频开头闪现完整画面 */
  const first = paintCard(team, opts(), buildReveal(team, 0));
  cv.width = first.width;
  cv.height = first.height;
  cv.getContext('2d')!.drawImage(first, 0, 0);

  recording.value = true;
  const handle = recordCanvas({
    canvas: cv,
    mime: m,
    totalMs: total,
    fps: 60,
    bitsPerSecond: 12_000_000,
    paint: (el) => {
      const card = paintCard(team, opts(), buildReveal(team, el));
      if (cv.width !== card.width) {
        cv.width = card.width;
        cv.height = card.height;
      }
      cv.getContext('2d')!.drawImage(card, 0, 0);
    },
  });
  recHandle = handle;
  notify(`正在录制动画，约 ${(total / 1000).toFixed(1)} 秒，请勿切换页面`);
  const blob = await handle.done;
  if (recHandle !== handle) return;
  recHandle = null;
  recording.value = false;
  if (blob) {
    const ext = m.indexOf('mp4') > -1 ? 'mp4' : 'webm';
    download(fileName(team, ext), blob);
    markExported();
    notify('动画视频已导出');
  } else {
    notify('录制未产生数据，请重试');
  }
  drawStatic();
}

async function exportPng(): Promise<void> {
  const team = cur();
  const valid = validateLineup(team);
  if (!valid.ok) {
    notify(valid.errors[0]);
    return;
  }
  const miss = (team.slots || []).filter((s) => s.pid == null).length;
  if (miss) {
    notify(`还有 ${miss} 个位置未安排球员，无法导出`);
    return;
  }
  await ensurePlayerImages(team.players);
  const other = teamForSide(team.side === 'home' ? 'away' : 'home');
  if (team.name.trim() && other && other.name.trim() && colorClose(team.color, other.color)) {
    notify('提醒：主客两队主色接近，播出时请注意区分');
  }
  try {
    const card = paintCard(team, opts());
    card.toBlob((b) => {
      if (!b) {
        notify('导出失败，可改用导出名单 JSON');
        return;
      }
      download(fileName(team, 'png'), b);
      markExported();
      notify('站位图已导出');
    }, 'image/png');
  } catch {
    notify('导出失败，可改用导出名单 JSON');
  }
}

function exportJson(): void {
  const team = cur();
  const valid = validateLineup(team);
  if (!valid.ok) {
    notify(valid.errors[0]);
    return;
  }
  const miss = (team.slots || []).filter((s) => s.pid == null).length;
  if (miss) {
    notify(`还有 ${miss} 个位置未安排球员，无法导出`);
    return;
  }
  try {
    const blob = new Blob([JSON.stringify(buildJson(team), null, 2)], { type: 'application/json' });
    download(fileName(team, 'json'), blob);
    notify('名单 JSON 已导出（不含照片二进制）');
  } catch {
    notify('JSON 导出失败');
  }
}

watch(
  () => [cur(), ui.value.view, ui.value.showPhoto, ui.value.showName],
  () => paintPreview(),
  { deep: true },
);
watch(() => state.ready, () => paintPreview());
watch(tab, (v) => {
  if (v === 'board') void nextTick(() => paintPreview());
});

onMounted(() => {
  void nextTick(() => paintPreview());
});
onBeforeUnmount(() => {
  cancelAnim();
});
</script>

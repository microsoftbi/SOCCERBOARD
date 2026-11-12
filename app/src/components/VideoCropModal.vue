<template>
  <div class="vcrop-overlay" @click.self="emit('cancel')">
    <div class="vcrop-panel" role="dialog" aria-modal="true" aria-label="裁切球员视频">
      <header class="vcrop-hd">
        <div class="vcrop-titles">
          <h3>裁切视频</h3>
          <p>{{ title || '球员视频' }}</p>
        </div>
        <button class="vcrop-x" type="button" aria-label="关闭" @click="emit('cancel')">×</button>
      </header>

      <p class="vcrop-hint">拖动画面调整构图，滚轮或滑杆缩放；下方可选取播出时段。</p>

      <div
        ref="stageEl"
        class="vcrop-stage"
        :class="{ active: loaded && dragging }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel.prevent="onWheel"
      >
        <video
          ref="videoEl"
          class="vcrop-video"
          :class="{ on: loaded }"
          :src="src"
          muted
          playsinline
          preload="auto"
          :style="videoStyle"
          @loadedmetadata="onMeta"
          @loadeddata="loaded = true"
          @timeupdate="onTime"
        ></video>
        <div v-if="!loaded" class="vcrop-loading">读取视频…</div>
        <div class="vcrop-grid"></div>
        <div class="vcrop-corners"><i></i><i></i><i></i><i></i></div>
      </div>

      <div class="vcrop-zoom">
        <span>缩放</span>
        <input v-model.number="zoom" type="range" min="1" max="3" step="0.01" />
        <span class="vcrop-zoomval">{{ zoom.toFixed(2) }}×</span>
        <button class="vcrop-mini" type="button" @click="resetAll">复位</button>
      </div>

      <div class="vcrop-trim">
        <div class="vcrop-trow">
          <span class="vcrop-tlabel">时长截取</span>
          <b class="vcrop-range">{{ clock(trimStart) }} – {{ clock(trimEnd) }} / {{ clock(duration) }}</b>
          <button
            class="vcrop-mini"
            type="button"
            :disabled="!hasDuration"
            @click="togglePlay"
          >
            {{ playing ? '暂停' : '试看' }}
          </button>
        </div>
        <label class="vcrop-srow">
          <span>起点</span>
          <input
            type="range"
            min="0"
            :max="maxStart"
            step="0.1"
            :disabled="!hasDuration"
            :value="trimStart"
            @input="onStart"
          />
        </label>
        <label class="vcrop-srow">
          <span>终点</span>
          <input
            type="range"
            :min="minEnd"
            :max="duration"
            step="0.1"
            :disabled="!hasDuration"
            :value="trimEnd"
            @input="onEnd"
          />
        </label>
        <p v-if="!hasDuration" class="vcrop-warn">该文件未提供时长信息，只能裁切画面，无法截取时段。</p>
      </div>

      <footer class="vcrop-ft">
        <span class="vcrop-note">播出画面与右栏大图同比例，构图与照片一致</span>
        <button class="vcrop-btn ghost" type="button" @click="emit('cancel')">取消</button>
        <button class="vcrop-btn primary" type="button" :disabled="!loaded" @click="confirm">使用此视频</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { VideoCrop } from '../core/types';
import type { VideoCropResult } from '../render/videoCrop';

const props = defineProps<{ src: string; title?: string }>();
const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'confirm', payload: VideoCropResult): void;
}>();

/* 取景框尺寸：与右栏媒体面板 396×604 严格同比例，保证 DOM 中不产生拉伸 */
const FW = 280;
const FH = (FW * 604) / 396; // ≈ 427.07

const stageEl = ref<HTMLDivElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const nw = ref(0);
const nh = ref(0);
const duration = ref(0);
const loaded = ref(false);
const zoom = ref(1);
const tx = ref(0);
const ty = ref(0);
const dragging = ref(false);
const playing = ref(false);
const trimStart = ref(0);
const trimEnd = ref(0);

const baseW = computed(() => (nw.value ? Math.max(FW / nw.value, FH / nh.value) * nw.value : FW));
const baseH = computed(() => (nh.value ? Math.max(FW / nw.value, FH / nh.value) * nh.value : FH));
const hasDuration = computed(() => duration.value > 0.4);
const maxStart = computed(() => Math.max(0, trimEnd.value - 0.3));
const minEnd = computed(() => Math.min(duration.value, trimStart.value + 0.3));

const videoStyle = computed(() => ({
  width: `${baseW.value * zoom.value}px`,
  height: `${baseH.value * zoom.value}px`,
  left: `${(FW - baseW.value * zoom.value) / 2 + tx.value}px`,
  top: `${(FH - baseH.value * zoom.value) / 2 + ty.value}px`,
}));

function clampOffsets(): void {
  const mx = Math.max(0, (baseW.value * zoom.value - FW) / 2);
  const my = Math.max(0, (baseH.value * zoom.value - FH) / 2);
  tx.value = Math.min(mx, Math.max(-mx, tx.value));
  ty.value = Math.min(my, Math.max(-my, ty.value));
}

function onMeta(): void {
  const v = videoEl.value;
  if (!v) return;
  nw.value = v.videoWidth;
  nh.value = v.videoHeight;
  duration.value = Number.isFinite(v.duration) ? v.duration : 0;
  trimStart.value = 0;
  trimEnd.value = duration.value;
  clampOffsets();
  if (v.readyState >= 2) loaded.value = true;
  seek(0.02);
}

function seek(t: number): void {
  const v = videoEl.value;
  if (!v || !Number.isFinite(v.duration) || v.readyState < 1) return;
  v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.02));
}

/* 拖动 */
let startX = 0;
let startY = 0;
let originX = 0;
let originY = 0;

function onDown(e: PointerEvent): void {
  if (!loaded.value) return;
  dragging.value = true;
  startX = e.clientX;
  startY = e.clientY;
  originX = tx.value;
  originY = ty.value;
  stageEl.value?.setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent): void {
  if (!dragging.value) return;
  tx.value = originX + (e.clientX - startX);
  ty.value = originY + (e.clientY - startY);
  clampOffsets();
}

function onUp(): void {
  dragging.value = false;
}

function onWheel(e: WheelEvent): void {
  if (!loaded.value) return;
  zoom.value = Math.min(3, Math.max(1, zoom.value + (e.deltaY < 0 ? 0.12 : -0.12)));
  clampOffsets();
}

function resetAll(): void {
  zoom.value = 1;
  tx.value = 0;
  ty.value = 0;
  trimStart.value = 0;
  trimEnd.value = duration.value;
  playing.value = false;
  videoEl.value?.pause();
  seek(0.02);
}

/* 时段 */
function onStart(e: Event): void {
  const v = Math.min(Number((e.target as HTMLInputElement).value), maxStart.value);
  trimStart.value = v;
  playing.value = false;
  videoEl.value?.pause();
  seek(v);
}

function onEnd(e: Event): void {
  const v = Math.min(Number((e.target as HTMLInputElement).value), duration.value);
  trimEnd.value = Math.max(minEnd.value, v);
  playing.value = false;
  videoEl.value?.pause();
  seek(trimEnd.value - 0.05);
}

function togglePlay(): void {
  const v = videoEl.value;
  if (!v || !hasDuration.value) return;
  if (v.paused) {
    if (v.currentTime < trimStart.value || v.currentTime >= trimEnd.value - 0.05) {
      v.currentTime = trimStart.value;
    }
    void v.play().catch(() => {});
    playing.value = true;
  } else {
    v.pause();
    playing.value = false;
  }
}

function onTime(): void {
  const v = videoEl.value;
  if (!v || !playing.value) return;
  if (v.currentTime >= trimEnd.value - 0.03) v.currentTime = trimStart.value;
}

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function confirm(): void {
  const v = videoEl.value;
  if (!v || !loaded.value || !nw.value || !nh.value) return;
  playing.value = false;
  v.pause();
  /* 取景框在源帧中的位置 → 归一化裁切矩形 */
  const k = Math.max(FW / nw.value, FH / nh.value) * zoom.value;
  const left = (FW - baseW.value * zoom.value) / 2 + tx.value;
  const top = (FH - baseH.value * zoom.value) / 2 + ty.value;
  const vw = nw.value;
  const vh = nh.value;
  const sx = Math.min(Math.max(0, -left / k), vw - 1);
  const sy = Math.min(Math.max(0, -top / k), vh - 1);
  const sw = Math.max(1, Math.min(vw - sx, FW / k));
  const sh = Math.max(1, Math.min(vh - sy, FH / k));
  const crop: VideoCrop = { x: sx / vw, y: sy / vh, w: sw / vw, h: sh / vh };
  const payload: VideoCropResult = { crop };
  if (hasDuration.value && (trimStart.value > 0.1 || trimEnd.value < duration.value - 0.1)) {
    payload.trim = { start: trimStart.value, end: trimEnd.value };
  }
  emit('confirm', payload);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('cancel');
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style>
.vcrop-overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(4, 8, 6, 0.74);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 18px;
  overflow: auto;
}
.vcrop-panel {
  width: min(400px, 100%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
  padding: 14px 16px 16px;
}
.vcrop-hd {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.vcrop-titles {
  flex: 1;
  min-width: 0;
}
.vcrop-titles h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--text);
}
.vcrop-titles p {
  margin: 3px 0 0;
  font-size: 11.5px;
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vcrop-x {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-mute);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.vcrop-x:hover {
  color: var(--text);
  border-color: var(--line);
}
.vcrop-hint {
  margin: 8px 0 10px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-mute);
}
.vcrop-stage {
  position: relative;
  width: 280px;
  height: 427.07px;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 10px;
  background: #000;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.vcrop-stage.active {
  cursor: grabbing;
}
.vcrop-video {
  position: absolute;
  display: block;
  max-width: none;
  max-height: none;
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}
.vcrop-video.on {
  opacity: 1;
}
.vcrop-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--text-mute);
}
.vcrop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}
.vcrop-corners {
  position: absolute;
  inset: 8px;
  pointer-events: none;
}
.vcrop-corners i {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 0 solid rgba(255, 255, 255, 0.72);
}
.vcrop-corners i:nth-child(1) {
  left: 0;
  top: 0;
  border-left-width: 2px;
  border-top-width: 2px;
}
.vcrop-corners i:nth-child(2) {
  right: 0;
  top: 0;
  border-right-width: 2px;
  border-top-width: 2px;
}
.vcrop-corners i:nth-child(3) {
  left: 0;
  bottom: 0;
  border-left-width: 2px;
  border-bottom-width: 2px;
}
.vcrop-corners i:nth-child(4) {
  right: 0;
  bottom: 0;
  border-right-width: 2px;
  border-bottom-width: 2px;
}
.vcrop-zoom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  font-size: 11.5px;
  color: var(--text-mute);
}
.vcrop-zoom input[type='range'] {
  flex: 1;
  accent-color: var(--accent);
}
.vcrop-zoomval {
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.vcrop-trim {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.vcrop-trow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-mute);
}
.vcrop-tlabel {
  flex: none;
}
.vcrop-range {
  flex: 1;
  min-width: 0;
  text-align: right;
  font-family: var(--mono, ui-monospace, monospace);
  color: var(--text);
  font-weight: 600;
}
.vcrop-srow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-mute);
}
.vcrop-srow > span {
  width: 24px;
  flex: none;
}
.vcrop-srow input[type='range'] {
  flex: 1;
  accent-color: var(--accent);
}
.vcrop-mini {
  flex: none;
  padding: 3px 9px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-mute);
  font-size: 11.5px;
  cursor: pointer;
}
.vcrop-mini:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent-deep);
}
.vcrop-mini:disabled {
  opacity: 0.45;
  cursor: default;
}
.vcrop-warn {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--warn, #f2c94c);
}
.vcrop-ft {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.vcrop-note {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  color: var(--text-mute);
}
.vcrop-btn {
  padding: 7px 14px;
  border-radius: 9px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text);
}
.vcrop-btn.ghost:hover {
  border-color: var(--accent-deep);
}
.vcrop-btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}
.vcrop-btn.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>

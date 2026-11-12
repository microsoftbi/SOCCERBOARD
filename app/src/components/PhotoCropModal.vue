<template>
  <div class="crop-overlay" @click.self="emit('cancel')">
    <div class="crop-panel" role="dialog" aria-modal="true" aria-label="裁切球员照片">
      <header class="crop-hd">
        <div>
          <h3>裁切照片</h3>
          <p class="crop-sub">{{ title || '拖动图片调整构图，滑杆或滚轮缩放' }}</p>
        </div>
        <button class="crop-x" type="button" aria-label="关闭" @click="emit('cancel')">×</button>
      </header>

      <div
        class="crop-stage"
        :class="{ on: loaded, dragging }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel.prevent="onWheel"
      >
        <img
          ref="imgEl"
          :src="src"
          class="crop-img"
          :class="{ on: loaded }"
          alt=""
          draggable="false"
          :style="imgStyle"
          @load="onLoad"
        />
        <div v-if="!loaded" class="crop-loading">读取图片…</div>
        <div class="crop-frame">
          <i class="ln v" style="left: 33.33%"></i>
          <i class="ln v" style="left: 66.66%"></i>
          <i class="ln h" style="top: 33.33%"></i>
          <i class="ln h" style="top: 66.66%"></i>
        </div>
      </div>

      <div class="crop-zoom">
        <span>缩放</span>
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          :value="zoom"
          :disabled="!loaded"
          @input="onSlide"
        />
        <b>{{ Math.round(zoom * 100) }}%</b>
      </div>

      <footer class="crop-ft">
        <button class="btn ghost sm" type="button" :disabled="!loaded" @click="reset">复位</button>
        <span class="spacer"></span>
        <button class="btn ghost sm" type="button" @click="emit('cancel')">取消</button>
        <button class="btn primary sm" type="button" :disabled="!loaded" @click="confirm">使用这张照片</button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{ src: string; title?: string }>();
const emit = defineEmits<{ (e: 'confirm', dataUrl: string): void; (e: 'cancel'): void }>();

/** 裁切框比例 2:3，与队员介绍页右侧大图一致 */
const FW = 280;
const FH = 420;
const OUT_W = 600;
const OUT_H = 900;

const imgEl = ref<HTMLImageElement | null>(null);
const nw = ref(0);
const nh = ref(0);
const loaded = ref(false);
const zoom = ref(1);
const tx = ref(0);
const ty = ref(0);
const dragging = ref(false);

const baseScale = computed(() => {
  if (!nw.value || !nh.value) return 1;
  return Math.max(FW / nw.value, FH / nh.value);
});
const baseW = computed(() => nw.value * baseScale.value);
const baseH = computed(() => nh.value * baseScale.value);

const imgStyle = computed(() => {
  const w = baseW.value * zoom.value;
  const h = baseH.value * zoom.value;
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `translate(${(FW - w) / 2 + tx.value}px, ${(FH - h) / 2 + ty.value}px)`,
  };
});

function clampOffsets(): void {
  const maxX = Math.max(0, (baseW.value * zoom.value - FW) / 2);
  const maxY = Math.max(0, (baseH.value * zoom.value - FH) / 2);
  tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
  ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
}

function setZoom(v: number): void {
  zoom.value = Math.min(3, Math.max(1, Math.round(v * 100) / 100));
  clampOffsets();
}

function reset(): void {
  zoom.value = 1;
  tx.value = 0;
  ty.value = 0;
}

function applyImage(img: HTMLImageElement): void {
  nw.value = img.naturalWidth;
  nh.value = img.naturalHeight;
  loaded.value = nw.value > 0 && nh.value > 0;
  reset();
}

function onLoad(e: Event): void {
  applyImage(e.target as HTMLImageElement);
}

let startX = 0;
let startY = 0;
let startTx = 0;
let startTy = 0;

function onDown(e: PointerEvent): void {
  if (!loaded.value || e.button !== 0) return;
  dragging.value = true;
  startX = e.clientX;
  startY = e.clientY;
  startTx = tx.value;
  startTy = ty.value;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent): void {
  if (!dragging.value) return;
  tx.value = startTx + (e.clientX - startX);
  ty.value = startTy + (e.clientY - startY);
  clampOffsets();
}

function onUp(e: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    /* 指针已释放 */
  }
}

function onWheel(e: WheelEvent): void {
  if (!loaded.value) return;
  setZoom(zoom.value + (e.deltaY < 0 ? 0.1 : -0.1));
}

function onSlide(e: Event): void {
  setZoom(Number((e.target as HTMLInputElement).value));
}

function confirm(): void {
  const img = imgEl.value;
  if (!loaded.value || !img) return;
  const k = baseScale.value * zoom.value;
  const left = (FW - baseW.value * zoom.value) / 2 + tx.value;
  const top = (FH - baseH.value * zoom.value) / 2 + ty.value;
  const cv = document.createElement('canvas');
  cv.width = OUT_W;
  cv.height = OUT_H;
  const cx = cv.getContext('2d');
  if (!cx) return;
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, OUT_W, OUT_H);
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, -left / k, -top / k, FW / k, FH / k, 0, 0, OUT_W, OUT_H);
  emit('confirm', cv.toDataURL('image/jpeg', 0.88));
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('cancel');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  const img = imgEl.value;
  if (img && img.complete && img.naturalWidth) applyImage(img);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style>
.crop-overlay{
  position:fixed;inset:0;z-index:120;background:rgba(4,8,6,.72);backdrop-filter:blur(4px);
  display:grid;place-items:center;padding:20px;
}
.crop-panel{
  width:min(420px,100%);background:var(--panel);border:1px solid var(--line);border-radius:16px;
  box-shadow:0 24px 60px rgba(0,0,0,.6);padding:16px 18px 14px;
}
.crop-hd{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
.crop-hd h3{font-size:16px}
.crop-sub{margin:2px 0 0;font-size:12px;color:var(--text-dim);line-height:1.45}
.crop-x{
  margin-left:auto;width:30px;height:30px;flex:none;border-radius:8px;border:1px solid transparent;
  background:transparent;color:var(--text-mute);font-size:16px;line-height:1;cursor:pointer;
}
.crop-x:hover{color:var(--text);border-color:var(--line)}
.crop-stage{
  position:relative;width:280px;height:420px;margin:0 auto;overflow:hidden;border-radius:10px;
  background:#0c1310;cursor:grab;touch-action:none;
}
.crop-stage.dragging{cursor:grabbing}
.crop-img{position:absolute;left:0;top:0;max-width:none;opacity:0;pointer-events:none;user-select:none}
.crop-img.on{opacity:1}
.crop-frame{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}
.ln{position:absolute;background:rgba(255,255,255,.16)}
.ln.v{top:0;bottom:0;width:1px}
.ln.h{left:0;right:0;height:1px}
.crop-loading{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:var(--text-mute)}
.crop-zoom{display:flex;align-items:center;gap:10px;margin:14px 2px 0;font-size:12px;color:var(--text-dim)}
.crop-zoom input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}
.crop-zoom b{font-family:var(--mono);font-size:11.5px;color:var(--text);min-width:42px;text-align:right}
.crop-ft{display:flex;align-items:center;gap:8px;margin-top:14px}
</style>

<template>
  <div class="vplay-overlay" @click.self="emit('close')">
    <div class="vplay-panel" role="dialog" aria-modal="true" aria-label="播放球员视频">
      <header class="vplay-hd">
        <p class="vplay-title">{{ title || '球员视频' }}</p>
        <button class="vplay-x" type="button" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <div class="vplay-stage" :class="{ framed: !!crop }">
        <video
          ref="videoEl"
          class="vplay-video"
          :class="{ cropped: !!crop }"
          :style="cropStyle"
          :src="src"
          :controls="!crop"
          :loop="!crop && !trim"
          autoplay
          playsinline
          @loadedmetadata="onMeta"
          @timeupdate="onTime"
          @play="playing = true"
          @pause="playing = false"
        ></video>
      </div>
      <div v-if="crop" class="vplay-bar">
        <button class="vplay-bbtn" type="button" :aria-label="playing ? '暂停' : '播放'" @click="toggle">
          {{ playing ? '❚❚' : '▶' }}
        </button>
        <input
          class="vplay-range"
          type="range"
          min="0"
          :max="duration"
          step="0.05"
          :value="time"
          @input="onSeek"
        />
        <span class="vplay-time">{{ clock(time) }} / {{ clock(duration) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { VideoCrop, VideoTrim } from '../core/types';
import { bindVideoTrim, cropBoxStyle } from '../render/videoCrop';

const props = defineProps<{
  src: string;
  title?: string;
  crop?: VideoCrop;
  trim?: VideoTrim;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const videoEl = ref<HTMLVideoElement | null>(null);
const playing = ref(false);
const time = ref(0);
const duration = ref(0);
let offTrim: () => void = () => {};

const cropStyle = computed(() => cropBoxStyle(props.crop));

function onMeta(): void {
  const v = videoEl.value;
  if (!v) return;
  duration.value = Number.isFinite(v.duration) ? v.duration : (props.trim?.end ?? 0);
}

function onTime(): void {
  const v = videoEl.value;
  if (!v) return;
  time.value = v.currentTime;
}

function toggle(): void {
  const v = videoEl.value;
  if (!v) return;
  if (v.paused) void v.play().catch(() => {});
  else v.pause();
}

function onSeek(e: Event): void {
  const v = videoEl.value;
  if (!v) return;
  let t = Number((e.target as HTMLInputElement).value);
  if (props.trim) t = Math.min(props.trim.end - 0.05, Math.max(props.trim.start, t));
  v.currentTime = t;
  time.value = t;
}

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  const v = videoEl.value;
  if (v) offTrim = bindVideoTrim(v, props.trim);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  offTrim();
  videoEl.value?.pause();
});
</script>

<style>
.vplay-overlay{position:fixed;inset:0;z-index:120;background:rgba(4,8,6,.72);backdrop-filter:blur(4px);
  display:grid;place-items:center;padding:20px}
.vplay-panel{width:min(680px,100%);background:var(--panel);border:1px solid var(--line);border-radius:14px;
  box-shadow:0 24px 60px rgba(0,0,0,.6);padding:12px 14px 14px}
.vplay-hd{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.vplay-title{margin:0;flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vplay-x{width:28px;height:28px;flex:none;border-radius:8px;border:1px solid transparent;background:transparent;
  color:var(--text-mute);font-size:15px;line-height:1;cursor:pointer}
.vplay-x:hover{color:var(--text);border-color:var(--line)}
.vplay-stage{position:relative;background:#000;border-radius:10px;overflow:hidden}
.vplay-stage.framed{width:min(100%,calc(62vh * 396 / 604));aspect-ratio:396/604;margin:0 auto}
.vplay-video{width:100%;max-height:66vh;background:#000;border-radius:10px;display:block}
.vplay-video.cropped{max-width:none;max-height:none;border-radius:0}
.vplay-bar{display:flex;align-items:center;gap:9px;margin-top:10px;font-size:11.5px;color:var(--text-mute)}
.vplay-bbtn{width:26px;height:26px;flex:none;border-radius:99px;border:1px solid var(--line);
  background:transparent;color:var(--text);font-size:11px;line-height:1;cursor:pointer}
.vplay-bbtn:hover{border-color:var(--accent-deep);color:var(--accent)}
.vplay-range{flex:1;accent-color:var(--accent)}
.vplay-time{flex:none;font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums}
</style>

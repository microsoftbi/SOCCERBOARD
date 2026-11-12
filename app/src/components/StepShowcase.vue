<template>
  <div class="showpanel">
    <div class="showwrap">
      <div ref="showBox" class="showbox">
        <div ref="stageEl" class="stage" :style="{ '--crest': t.color }">
          <div class="st-bg"></div>

          <aside class="sp-left">
            <div class="sp-banner">
              <span class="sp-crest">{{ t.code.trim() || 'SB' }}</span>
              <span class="sp-team">{{ (t.name.trim() || 'TEAM').toUpperCase() }}</span>
            </div>
            <div class="sp-listhd">STARTING LINE-UP · 首发</div>
            <div class="sp-rows">
              <div
                v-for="(x, i) in list"
                :key="x.p.id"
                class="sp-row"
                :class="{ hide: i >= revealed, act: i === active }"
                @click="selectRow(i)"
              >
                <span class="sp-n">{{ x.p.num || '—' }}</span>
                <span class="sp-nm">{{ x.p.name }}</span>
                <span v-if="x.p.captain" class="sp-c">C</span>
              </div>
            </div>
            <div class="sp-foot">
              <span class="sp-fl">FORMATION · 阵型</span>
              <div class="sp-frow">
                <span class="sp-fv">{{ t.formation }}</span>
                <span class="sp-fm">{{ t.side === 'home' ? '主队' : '客队' }} · {{ t.count }} 人制</span>
              </div>
            </div>
          </aside>

          <div class="sp-mid">
            <div class="sp-field">
              <svg class="sp-lines" viewBox="0 0 376 580" preserveAspectRatio="none" aria-hidden="true">
                <rect x="2" y="2" width="372" height="576" />
                <line x1="2" y1="290" x2="374" y2="290" />
                <circle cx="188" cy="290" r="54" />
                <circle cx="188" cy="290" r="2" class="dot" />
                <rect x="71.5" y="2" width="233" height="87" />
                <rect x="71.5" y="491" width="233" height="87" />
                <rect x="131.6" y="2" width="112.8" height="32" />
                <rect x="131.6" y="546" width="112.8" height="32" />
              </svg>
              <span
                v-for="(m, i) in marks"
                :key="m.id"
                class="sp-mk"
                :class="{ hot: i === active, hide: i >= revealed }"
                :style="{ left: m.left, top: m.top }"
                >{{ m.num }}</span
              >
            </div>
          </div>

          <div class="sp-right">
            <div class="sp-photo" :class="{ swap: mediaSwap }">
              <video
                v-if="mediaItem && mediaItem.p.video"
                ref="videoEl"
                :style="videoCropStyle"
                :loop="!mediaItem.p.videoTrim"
                autoplay
                muted
                playsinline
              ></video>
              <img
                v-else-if="mediaItem && mediaItem.p.photo"
                :src="mediaItem.p.photo"
                :alt="mediaItem.p.name"
              />
              <div v-else class="sp-bignum">{{ mediaItem ? mediaItem.p.num || '—' : '' }}</div>
              <span v-if="mediaItem && mediaItem.p.captain" class="sp-cap">C</span>
              <div class="sp-scrim"></div>
              <div v-if="mediaItem" class="sp-meta">
                <div class="sp-mn">
                  #{{ mediaItem.p.num || '—' }} · {{ LABEL[mediaItem.pos] || mediaItem.pos || '球员' }}
                </div>
                <div class="sp-pname">{{ mediaItem.p.name }}</div>
                <div class="sp-ppos">
                  {{ mediaItem.pos || '位置未设置' }}{{ mediaItem.p.captain ? ' · 队长' : '' }}
                </div>
              </div>
            </div>
          </div>

          <div class="st-wm">SOCCERBOARD · 队员介绍</div>
        </div>
      </div>
    </div>

    <div class="showctl">
      <button class="btn primary" :disabled="!list.length" @click="playShow">▶ 播放展示</button>
      <button class="btn ghost" :disabled="!list.length" @click="resetShow">重置名单</button>
      <button
        class="btn"
        :disabled="!list.length || !mime || showRecBusy"
        title="把队员介绍动画录制成视频文件；录制期间请停留在本页"
        @click="exportShowVideo"
      >
        导出队员介绍视频{{ mimeLabel }}
      </button>
      <label class="btn" title="为当前介绍的球员上传一段视频">
        📹 上传视频
        <input type="file" accept="video/*" style="display: none" @change="onVideoFile" />
      </label>
      <button v-if="mediaItem && mediaItem.p.video" class="btn ghost" @click="onRemoveVideo">移除视频</button>
      <span class="meta">{{ list.length }} 人 · {{ t.count }} 人制 · {{ t.formation }}</span>
    </div>

    <VideoCropModal
      v-if="videoCrop"
      :src="videoCrop.url"
      :title="videoCrop.title"
      @cancel="closeVideoCrop"
      @confirm="onVideoCropConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { LABEL } from '../core/formations';
import type { Player, VideoTrim } from '../core/types';
import { download, fileName, pickVideoMime } from '../core/utils';
import { ensurePlayerImages, ensurePlayerVideos, eachVideo, videoFor } from '../render/imageCache';
import { markXY, paintShowFrame, showcaseList, showTotalMs, type ShowItem } from '../render/showcase';
import { bindVideoTrim, cropBoxStyle, wrapVideoTrim, type VideoCropResult } from '../render/videoCrop';
import { recordCanvas, type RecordHandle } from '../render/exportVideo';
import { cur, getTeamVideoUrl, getVideoUrl, notify, queueSave, removeVideo, saveVideo } from '../stores/teamStore';
import VideoCropModal from './VideoCropModal.vue';

const t = computed(() => cur());
const list = computed(() => showcaseList(t.value));
const revealed = ref(999);
const active = ref(0);
const mediaIdx = ref(0);
const mediaSwap = ref(false);
const showRecBusy = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);
const showBox = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);

const mediaItem = computed<ShowItem | null>(() => list.value[mediaIdx.value] || null);
const videoCropStyle = computed(() => cropBoxStyle(mediaItem.value?.p.videoCrop));
const mime = computed(() => pickVideoMime());
const mimeLabel = computed(() =>
  mime.value ? (mime.value.indexOf('mp4') > -1 ? '（MP4）' : '（WebM）') : '（此浏览器不支持）',
);

/** 球场号码标记：阵型坐标直接投影到竖版球场 */
const marks = computed(() =>
  list.value.map((x) => {
    const { cx, cy } = markXY(x.x, x.y);
    return { id: x.p.id, num: x.p.num || '—', left: `${cx}px`, top: `${cy}px` };
  }),
);

let rowTimer: ReturnType<typeof setTimeout> | undefined;
let mediaTimer: ReturnType<typeof setTimeout> | undefined;
let mediaToken = 0;
let showRec: RecordHandle | null = null;
let offTrim: () => void = () => {};

function clearTimers(): void {
  clearTimeout(rowTimer);
  clearTimeout(mediaTimer);
}

async function loadMedia(i: number): Promise<void> {
  await nextTick();
  offTrim();
  offTrim = () => {};
  const item = list.value[i];
  if (!item || !item.p.video) return;
  const video = videoEl.value;
  const p = item.p;
  if (!video) return;
  const url = await getVideoUrl(p);
  if (mediaIdx.value !== i || videoEl.value !== video) return;
  if (!url) {
    p.video = false;
    delete p.videoCrop;
    delete p.videoTrim;
    queueSave();
    notify('该球员的视频文件已丢失，已回退为照片');
    return;
  }
  video.src = url;
  offTrim = bindVideoTrim(video, p.videoTrim);
  video.play().catch(() => {});
}

function setActive(i: number, instant = false): void {
  active.value = i;
  const item = list.value[i];
  if (!item) return;
  const token = ++mediaToken;
  if (instant) {
    mediaIdx.value = i;
    mediaSwap.value = false;
    void loadMedia(i);
    return;
  }
  mediaSwap.value = true;
  clearTimeout(mediaTimer);
  mediaTimer = setTimeout(() => {
    if (token !== mediaToken) return;
    mediaIdx.value = i;
    mediaSwap.value = false;
    void loadMedia(i);
  }, 150);
}

function selectRow(i: number): void {
  clearTimers();
  revealed.value = list.value.length;
  setActive(i);
}

function playShow(): void {
  const len = list.value.length;
  if (!len) return;
  clearTimers();
  revealed.value = 0;
  active.value = -1;
  mediaSwap.value = true;
  const tick = (i: number): void => {
    if (i >= list.value.length) return;
    revealed.value = Math.max(revealed.value, i + 1);
    setActive(i);
    rowTimer = setTimeout(() => tick(i + 1), 280 * 9);
  };
  rowTimer = setTimeout(() => tick(0), 220 * 9);
}

function resetShow(): void {
  clearTimers();
  revealed.value = list.value.length;
  setActive(0);
}

interface ShowVideoTarget {
  url: string;
  title: string;
  item: ShowItem;
  file: File;
}

const videoCrop = ref<ShowVideoTarget | null>(null);

function closeVideoCrop(): void {
  if (videoCrop.value) URL.revokeObjectURL(videoCrop.value.url);
  videoCrop.value = null;
}

function onVideoFile(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = '';
  const item = mediaItem.value;
  if (!item || !file) return;
  if (!file.type.startsWith('video/')) {
    notify('请选择视频文件');
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    notify('视频超过 40MB，请压缩后再上传');
    return;
  }
  closeVideoCrop();
  videoCrop.value = {
    url: URL.createObjectURL(file),
    title: `${item.p.name.trim() || '球员'} · 视频裁切`,
    item,
    file,
  };
}

async function onVideoCropConfirm(payload: VideoCropResult): Promise<void> {
  const target = videoCrop.value;
  if (!target) return;
  closeVideoCrop();
  const ok = await saveVideo(target.item.p, target.file);
  if (!ok) return;
  target.item.p.videoCrop = payload.crop;
  target.item.p.videoTrim = payload.trim;
  queueSave();
  setActive(mediaIdx.value, true);
  await nextTick();
  void loadMedia(mediaIdx.value);
}

async function onRemoveVideo(): Promise<void> {
  const item = mediaItem.value;
  if (!item) return;
  await removeVideo(item.p);
  const idx = mediaIdx.value;
  setActive(idx, true);
}

async function exportShowVideo(): Promise<void> {
  if (showRecBusy.value) return;
  const team = cur();
  const items = list.value;
  if (!items.length) {
    notify('还没有可展示的球员');
    return;
  }
  const m = mime.value;
  const canvas = document.createElement('canvas');
  if (!m || typeof canvas.captureStream !== 'function') {
    notify('当前浏览器不支持视频录制');
    return;
  }
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await ensurePlayerImages(team.players);
  /* 预加载带视频标记的球员，录制期间持续播放供 canvas 逐帧取画面 */
  await ensurePlayerVideos(team.id, team.players, (p) => getTeamVideoUrl(team, p));
  const total = showTotalMs(items.length);
  paintShowFrame(ctx, team, items, 0); // 首帧先铺好，避免视频开头闪白
  /* 截取时段：录制期间把播放位置拉回选段起点，保证 canvas 只取到选中的片段 */
  const cine: Array<{ v: HTMLVideoElement; trim?: VideoTrim }> = [];
  team.players.forEach((p) => {
    if (!p.video) return;
    const v = videoFor(team.id, p.id);
    if (v) cine.push({ v, trim: p.videoTrim });
  });
  cine.forEach(({ v, trim }) => {
    v.loop = !trim;
    if (trim && Number.isFinite(v.duration)) {
      v.currentTime = Math.min(trim.start, Math.max(0, v.duration - 0.05));
    } else {
      v.currentTime = 0;
    }
    void v.play().catch(() => {});
  });
  const trimTimer = window.setInterval(() => {
    cine.forEach(({ v, trim }) => wrapVideoTrim(v, trim));
  }, 50);
  showRecBusy.value = true;
  const handle = recordCanvas({
    canvas,
    mime: m,
    totalMs: total,
    fps: 30,
    bitsPerSecond: 12_000_000,
    paint: (el) => paintShowFrame(ctx, team, items, el),
  });
  showRec = handle;
  notify(`正在录制队员展示，约 ${Math.round(total / 1000)} 秒，请勿切换页面`);
  let blob: Blob | null = null;
  try {
    blob = await handle.done;
  } finally {
    window.clearInterval(trimTimer);
    eachVideo((v) => v.pause());
  }
  if (showRec !== handle) return;
  showRec = null;
  showRecBusy.value = false;
  if (!blob) {
    notify('录制未产生数据，请重试');
    return;
  }
  const ext = m.indexOf('mp4') > -1 ? 'mp4' : 'webm';
  const base = fileName(team, ext).replace(/\.\w+$/, '');
  download(`${base}_队员展示.${ext}`, blob);
  notify('展示动画视频已导出');
}

function fitStage(): void {
  if (!showBox.value || !stageEl.value) return;
  const w = showBox.value.clientWidth || 1120;
  stageEl.value.style.transform = `scale(${w / 1200})`;
}

watch(mediaIdx, () => void loadMedia(mediaIdx.value), { flush: 'post' });
watch(
  () => list.value.map((x) => x.p.id).join(','),
  () => {
    clearTimers();
    revealed.value = list.value.length;
    setActive(0, true);
  },
);

onMounted(() => {
  void nextTick(() => {
    fitStage();
    requestAnimationFrame(fitStage);
    setActive(0, true);
  });
  window.addEventListener('resize', fitStage);
});
onBeforeUnmount(() => {
  clearTimers();
  offTrim();
  closeVideoCrop();
  window.removeEventListener('resize', fitStage);
  if (showRec) {
    const h = showRec;
    showRec = null;
    h.cancel();
  }
});
</script>

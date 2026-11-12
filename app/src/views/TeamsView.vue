<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>球队管理</h2>
        <p>维护球队信息与球员档案（号码、姓名、位置、队长、照片、视频）。比赛名单只引用球员，球队改动会自动同步到所有比赛。</p>
      </div>
      <button class="btn primary" @click="add">＋ 新增球队</button>
    </div>

    <div class="teamsplit">
      <aside class="teamlist">
        <button
          v-for="t in state.teams"
          :key="t.id"
          type="button"
          class="teamitem"
          :aria-pressed="t.id === selectedId ? 'true' : 'false'"
          @click="selectedId = t.id"
        >
          <span class="dot" :style="{ background: t.color }"></span>
          <b>{{ t.name.trim() || '未命名球队' }}</b>
          <small>{{ t.players.filter(isFilled).length }} 人</small>
        </button>
        <div v-if="!state.teams.length" class="benchnote">还没有球队，先点击右上角新增。</div>
      </aside>

      <div v-if="team" class="teamform">
        <div class="row2">
          <div class="field" style="flex: 2 1 240px">
            <label class="lbl" for="t-name">球队全称 *</label>
            <input
              id="t-name"
              type="text"
              :value="team.name"
              maxlength="24"
              placeholder="例如：上海海港"
              @input="onName(team, $event)"
            />
          </div>
          <div class="field" style="flex: 1 1 140px">
            <label class="lbl" for="t-code">三字代码</label>
            <input
              id="t-code"
              type="text"
              :value="team.code"
              maxlength="4"
              placeholder="SHH"
              style="font-family: var(--mono); text-transform: uppercase"
              @input="onCode(team, $event)"
            />
          </div>
          <div class="field" style="flex: 1 1 160px">
            <label class="lbl" for="t-coach">主教练</label>
            <input
              id="t-coach"
              type="text"
              :value="team.coach"
              maxlength="20"
              placeholder="例如：李指导"
              @input="onCoach(team, $event)"
            />
          </div>
          <div class="field" style="flex: 0 1 180px">
            <label class="lbl" for="t-color">球队主色</label>
            <div class="colorline">
              <input id="t-color" type="color" :value="team.color" @input="onColor(team, $event)" />
              <span class="colorhex">{{ team.color }}</span>
            </div>
          </div>
        </div>

        <div class="team-roster-hd">
          <span class="lbl" style="margin: 0">球员档案</span>
          <span class="chipstat">{{ team.players.filter(isFilled).length }} 人已填写</span>
          <span class="spacer"></span>
          <button class="btn sm" @click="addPlayer(team)">＋ 添加球员</button>
        </div>

        <div class="ptable">
          <div class="ptrow phd">
            <span>号码</span><span>照片</span><span>姓名</span><span>位置</span><span>队长</span><span>视频</span><span></span>
          </div>
          <div v-for="p in team.players" :key="p.id" class="ptrow">
            <input
              class="in-num"
              type="text"
              inputmode="numeric"
              maxlength="2"
              placeholder="#"
              :value="p.num"
              @input="onNum(team, p, $event)"
            />
            <button
              v-if="p.photo"
              type="button"
              class="ph sm"
              title="查看照片（可修改并重新裁切）"
              @click="openPhotoPreview(team, p)"
            >
              <img :src="p.photo" alt="" />
            </button>
            <label v-else class="ph sm" title="上传照片">
              <span>＋</span>
              <input type="file" accept="image/*" @change="onPhoto(team, p, $event)" />
            </label>
            <input
              type="text"
              :value="p.name"
              maxlength="20"
              placeholder="球员姓名"
              @input="onNameOf(team, p, $event)"
            />
            <select :value="p.pos" @change="onPos(team, p, $event)">
              <option value="">位置</option>
              <option v-for="pos in posOptions" :key="pos" :value="pos">{{ pos }} · {{ LABEL[pos] || pos }}</option>
            </select>
            <button
              type="button"
              class="cap"
              :class="{ on: p.captain }"
              :aria-pressed="p.captain ? 'true' : 'false'"
              title="设为队长（全队唯一）"
              @click="toggleCaptain(team, p)"
            >
              C
            </button>
            <div class="vid">
              <template v-if="p.video">
                <span class="vid-on">已上传</span>
                <button class="vid-play" title="播放视频" @click="onPlayVideo(team, p)">▶</button>
                <button class="del" title="移除视频" @click="onRemoveVideo(team, p)">×</button>
              </template>
              <label v-else class="btn ghost sm">
                上传
                <input type="file" accept="video/*" style="display: none" @change="onVideo(team, p, $event)" />
              </label>
            </div>
            <button type="button" class="del" title="删除该球员" @click="onDeletePlayer(team, p)">×</button>
          </div>
          <div v-if="!team.players.length" class="benchnote" style="padding: 14px 4px">
            还没有球员，点击「添加球员」开始录入。
          </div>
        </div>

        <div class="btnrow">
          <button class="btn ghost sm" @click="onDeleteTeam(team)">删除该球队</button>
          <span class="meta">被比赛使用的球队无法删除；删除球员会自动清空相关比赛中的槽位与替补。</span>
        </div>
      </div>
      <div v-else class="teamform empty-soft">
        <h3>选择或新增一支球队</h3>
        <p>左侧列表中的球队可在此维护球员档案。</p>
      </div>
    </div>

    <PhotoPreviewModal
      v-if="photoPreview"
      :src="photoPreview.url"
      :title="photoPreview.title"
      @close="closePhotoPreview"
      @pick="onPreviewPick"
    />

    <PhotoCropModal
      v-if="crop"
      :src="crop.url"
      :title="crop.title"
      @confirm="onCropConfirm"
      @cancel="closeCrop"
    />

    <VideoCropModal
      v-if="videoCrop"
      :src="videoCrop.url"
      :title="videoCrop.title"
      @cancel="closeVideoCrop"
      @confirm="onVideoCropConfirm"
    />

    <VideoPlayModal
      v-if="playTarget"
      :src="playTarget.url"
      :title="playTarget.title"
      :crop="playTarget.crop"
      :trim="playTarget.trim"
      @close="playTarget = null"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import PhotoCropModal from '../components/PhotoCropModal.vue';
import PhotoPreviewModal from '../components/PhotoPreviewModal.vue';
import VideoCropModal from '../components/VideoCropModal.vue';
import VideoPlayModal from '../components/VideoPlayModal.vue';
import { LABEL, POS_BY_COUNT } from '../core/formations';
import { isFilled } from '../core/team';
import type { Player, Team } from '../core/types';
import type { VideoCropResult } from '../render/videoCrop';
import {
  addPlayer,
  addTeam,
  applyPhoto,
  deletePlayer,
  deleteTeam,
  getTeamVideoUrl,
  notify,
  queueSave,
  removeTeamVideo,
  saveTeamVideo,
  state,
  toggleCaptain,
  updatePlayer,
  updateTeam,
} from '../stores/teamStore';

const selectedId = ref<number>(0);
const posOptions = POS_BY_COUNT[11];

const team = computed<Team | null>(() => state.teams.find((t) => t.id === selectedId.value) || null);

watch(
  () => state.teams,
  (list) => {
    if (!list.length) {
      selectedId.value = 0;
    } else if (!list.some((t) => t.id === selectedId.value)) {
      selectedId.value = list[0].id;
    }
  },
  { deep: true, immediate: true },
);

function add(): void {
  const t = addTeam();
  selectedId.value = t.id;
}

function onName(t: Team, e: Event): void {
  const input = e.target as HTMLInputElement;
  updateTeam(t, { name: input.value });
}

function onCode(t: Team, e: Event): void {
  const input = e.target as HTMLInputElement;
  updateTeam(t, { code: input.value });
  input.value = t.code;
}

function onColor(t: Team, e: Event): void {
  updateTeam(t, { color: (e.target as HTMLInputElement).value });
}

function onCoach(t: Team, e: Event): void {
  updateTeam(t, { coach: (e.target as HTMLInputElement).value });
}

function onNum(t: Team, p: Player, e: Event): void {
  const input = e.target as HTMLInputElement;
  updatePlayer(t, p, { num: input.value });
  input.value = p.num;
}

function onNameOf(t: Team, p: Player, e: Event): void {
  updatePlayer(t, p, { name: (e.target as HTMLInputElement).value });
}

function onPos(t: Team, p: Player, e: Event): void {
  updatePlayer(t, p, { pos: (e.target as HTMLSelectElement).value });
}

interface CropTarget {
  url: string;
  title: string;
  team: Team;
  player: Player;
}

const crop = ref<CropTarget | null>(null);

function closeCrop(): void {
  if (crop.value) URL.revokeObjectURL(crop.value.url);
  crop.value = null;
}

function startPhotoCrop(t: Team, p: Player, file: File): void {
  if (!file.type.startsWith('image/')) {
    notify('请选择图片文件');
    return;
  }
  closeCrop();
  const url = URL.createObjectURL(file);
  crop.value = {
    url,
    title: `${p.name.trim() || '球员'} · ${t.name.trim() || '未命名球队'}`,
    team: t,
    player: p,
  };
}

function onPhoto(t: Team, p: Player, e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  startPhotoCrop(t, p, file);
}

interface PhotoPreviewTarget {
  url: string;
  title: string;
  team: Team;
  player: Player;
}

const photoPreview = ref<PhotoPreviewTarget | null>(null);

function openPhotoPreview(t: Team, p: Player): void {
  if (!p.photo) return;
  photoPreview.value = {
    url: p.photo,
    title: `${p.num ? `#${p.num} · ` : ''}${p.name.trim() || '球员'} · ${t.name.trim() || '未命名球队'}`,
    team: t,
    player: p,
  };
}

function closePhotoPreview(): void {
  photoPreview.value = null;
}

/** 预览窗里点「修改照片」：关闭预览，进入裁切 */
function onPreviewPick(file: File): void {
  const target = photoPreview.value;
  if (!target) return;
  closePhotoPreview();
  startPhotoCrop(target.team, target.player, file);
}

async function onCropConfirm(dataUrl: string): Promise<void> {
  const target = crop.value;
  if (!target) return;
  closeCrop();
  await applyPhoto(target.team, target.player, dataUrl);
}

onBeforeUnmount(() => {
  closeCrop();
  closePhotoPreview();
  closeVideoCrop();
});

async function onVideo(t: Team, p: Player, e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
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
    title: `${p.name.trim() || '球员'} · ${t.name.trim() || '未命名球队'}`,
    team: t,
    player: p,
    file,
  };
}

interface VideoCropTarget {
  url: string;
  title: string;
  team: Team;
  player: Player;
  file: File;
}

const videoCrop = ref<VideoCropTarget | null>(null);

function closeVideoCrop(): void {
  if (videoCrop.value) URL.revokeObjectURL(videoCrop.value.url);
  videoCrop.value = null;
}

async function onVideoCropConfirm(payload: VideoCropResult): Promise<void> {
  const target = videoCrop.value;
  if (!target) return;
  closeVideoCrop();
  const ok = await saveTeamVideo(target.team, target.player, target.file);
  if (!ok) return;
  target.player.videoCrop = payload.crop;
  target.player.videoTrim = payload.trim;
  queueSave();
}

async function onRemoveVideo(t: Team, p: Player): Promise<void> {
  await removeTeamVideo(t, p);
  notify('视频已移除');
}

interface PlayTarget {
  url: string;
  title: string;
  crop?: Player['videoCrop'];
  trim?: Player['videoTrim'];
}

const playTarget = ref<PlayTarget | null>(null);

async function onPlayVideo(t: Team, p: Player): Promise<void> {
  const url = await getTeamVideoUrl(t, p);
  if (!url) {
    p.video = false;
    delete p.videoCrop;
    delete p.videoTrim;
    queueSave();
    notify('视频文件已丢失，已重置上传状态');
    return;
  }
  playTarget.value = {
    url,
    title: `${p.name.trim() || '球员'} · ${t.name.trim() || '未命名球队'}`,
    crop: p.videoCrop,
    trim: p.videoTrim,
  };
}

function onDeletePlayer(t: Team, p: Player): void {
  if (!window.confirm(`确认删除球员「${p.name || '未命名'}」？相关比赛中的槽位会自动清空。`)) return;
  deletePlayer(t, p);
  notify('球员已删除');
}

function onDeleteTeam(t: Team): void {
  if (!window.confirm(`确认删除球队「${t.name || '未命名球队'}」及其全部球员？`)) return;
  if (deleteTeam(t)) notify('球队已删除');
}
</script>

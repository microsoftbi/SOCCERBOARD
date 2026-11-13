<template>
  <section class="card wizard">
    <div class="hd">
      <div>
        <h2>新建比赛</h2>
        <p>先填写比赛信息，再确定人数与阵型，最后指定主客两队。完成后会自动进入名单录入。</p>
      </div>
      <button class="btn ghost sm" @click="openMatches">取消</button>
    </div>

    <div class="wizardsteps">
      <div v-for="s in steps" :key="s.n" class="wstep" :class="{ on: step === s.n, done: step > s.n }">
        <b>{{ s.n }}</b>
        <span>{{ s.label }}</span>
      </div>
    </div>

    <div v-if="!state.teams.length" class="warnbox on">
      还没有球队，请先到「球队」中添加至少两支球队，再回来创建比赛。
    </div>

    <div v-if="step === 1" class="wbody">
      <div class="row2">
        <div class="field" style="flex: 2 1 320px">
          <label class="lbl" for="m-name">比赛名称</label>
          <input id="m-name" v-model="draft.name" type="text" maxlength="40" placeholder="不填则自动使用「主队 vs 客队」" />
        </div>
        <div class="field" style="flex: 1 1 220px">
          <label class="lbl" for="m-comp">赛事 / 轮次</label>
          <input id="m-comp" v-model="draft.competition" type="text" maxlength="30" placeholder="例如：城市联赛 第 3 轮" />
        </div>
      </div>
      <div class="field" style="max-width: 240px">
        <label class="lbl" for="m-date">比赛日期</label>
        <input id="m-date" v-model="draft.date" type="date" />
      </div>
      <div class="note">比赛信息会显示在比赛列表和转播画面信息条上，可稍后修改。</div>
    </div>

    <div v-else-if="step === 2" class="wbody">
      <div class="field">
        <span class="lbl">场上人数</span>
        <div class="chipset">
          <button
            v-for="n in counts"
            :key="n"
            type="button"
            class="pill"
            :aria-pressed="draft.count === n ? 'true' : 'false'"
            @click="setCount(n)"
          >
            {{ n }} 人制<small>{{ formationCount(n) }} 套阵型</small>
          </button>
        </div>
      </div>
      <div class="row2">
        <div class="field" style="flex: 1 1 240px">
          <label class="lbl" for="m-fh">主队默认阵型</label>
          <select id="m-fh" v-model="draft.homeFormation">
            <option v-for="k in formationKeys" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
        <div class="field" style="flex: 1 1 240px">
          <label class="lbl" for="m-fa">客队默认阵型</label>
          <select id="m-fa" v-model="draft.awayFormation">
            <option v-for="k in formationKeys" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
      </div>
      <div class="note">名单录入完成后系统会自动按位置落位，播出页的站位图随即可用；如需换阵型，请在这里重新创建比赛。</div>
    </div>

    <div v-else class="wbody">
      <div class="row2">
        <div class="field" style="flex: 1 1 260px">
          <label class="lbl" for="m-home">主队 *</label>
          <select id="m-home" v-model.number="draft.homeTeamId">
            <option :value="0" disabled>请选择球队</option>
            <option v-for="t in state.teams" :key="t.id" :value="t.id" :disabled="t.id === draft.awayTeamId">
              {{ t.name || '未命名球队' }}（{{ filledCount(t) }} 人）
            </option>
          </select>
        </div>
        <div class="field" style="flex: 1 1 260px">
          <label class="lbl" for="m-away">客队 *</label>
          <select id="m-away" v-model.number="draft.awayTeamId">
            <option :value="0" disabled>请选择球队</option>
            <option v-for="t in state.teams" :key="t.id" :value="t.id" :disabled="t.id === draft.homeTeamId">
              {{ t.name || '未命名球队' }}（{{ filledCount(t) }} 人）
            </option>
          </select>
        </div>
      </div>
      <div class="matchpreview">
        <span class="dot" :style="{ background: teamById(draft.homeTeamId)?.color || '#c8102e' }"></span>
        <b>{{ teamName(teamById(draft.homeTeamId), '主队待定') }}</b>
        <i>VS</i>
        <b>{{ teamName(teamById(draft.awayTeamId), '客队待定') }}</b>
        <span class="dot" :style="{ background: teamById(draft.awayTeamId)?.color || '#2563eb' }"></span>
      </div>
      <div class="note">号码、姓名、照片与视频都在「球队管理」中维护，比赛只引用球队和球员。</div>
      <div v-if="hint" class="errbox on">{{ hint }}</div>
    </div>

    <div class="btnrow">
      <button v-if="step > 1" class="btn ghost" @click="step--">上一步</button>
      <span class="spacer"></span>
      <button v-if="step < 3" class="btn primary" @click="next">下一步</button>
      <button v-else class="btn primary" :disabled="!canFinish" @click="finish">创建并进入名单</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { DEFAULT_FORMATION, FORMATIONS } from '../core/formations';
import { isFilled, teamName } from '../core/team';
import type { Team } from '../core/types';
import {
  createMatch,
  notify,
  openMatches,
  openTeams,
  state,
  teamById,
} from '../stores/teamStore';

const counts = [5, 6, 8, 11];
const steps = [
  { n: 1, label: '比赛信息' },
  { n: 2, label: '人数与阵型' },
  { n: 3, label: '选择球队' },
];

function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const step = ref(1);
const draft = reactive({
  name: '',
  competition: '',
  date: today(),
  count: 6,
  homeFormation: '2-2-1',
  awayFormation: '2-2-1',
  homeTeamId: 0,
  awayTeamId: 0,
});

const formationKeys = computed(() => Object.keys(FORMATIONS[draft.count] || {}));
const hint = ref('');

function formationCount(n: number): number {
  return Object.keys(FORMATIONS[n] || {}).length;
}

function filledCount(t: Team): number {
  return t.players.filter(isFilled).length;
}

function setCount(n: number): void {
  draft.count = n;
  if (!FORMATIONS[n][draft.homeFormation]) draft.homeFormation = DEFAULT_FORMATION[n];
  if (!FORMATIONS[n][draft.awayFormation]) draft.awayFormation = DEFAULT_FORMATION[n];
}

function next(): void {
  hint.value = '';
  step.value++;
}

const canFinish = computed(
  () => draft.homeTeamId > 0 && draft.awayTeamId > 0 && draft.homeTeamId !== draft.awayTeamId,
);

function initTeams(): void {
  if (state.teams.length < 2) return;
  if (!draft.homeTeamId || !teamById(draft.homeTeamId)) draft.homeTeamId = state.teams[0].id;
  if (!draft.awayTeamId || !teamById(draft.awayTeamId)) {
    draft.awayTeamId = (state.teams.find((t) => t.id !== draft.homeTeamId) || state.teams[1]).id;
  }
  if (draft.homeTeamId === draft.awayTeamId) {
    draft.awayTeamId = (state.teams.find((t) => t.id !== draft.homeTeamId) || state.teams[1]).id;
  }
}

watch(() => state.teams.length, initTeams, { immediate: true });

function finish(): void {
  if (!canFinish.value) {
    hint.value = '请选择两支不同的球队作为主队和客队';
    return;
  }
  const m = createMatch({
    name: draft.name,
    competition: draft.competition,
    date: draft.date,
    count: draft.count,
    homeFormation: draft.homeFormation,
    awayFormation: draft.awayFormation,
    homeTeamId: draft.homeTeamId,
    awayTeamId: draft.awayTeamId,
  });
  if (m) notify('比赛已创建，开始安排首发与替补');
  else openTeams();
}
</script>

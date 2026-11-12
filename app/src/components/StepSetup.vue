<template>
  <section v-if="m" class="card">
    <div class="hd">
      <div>
        <h2>比赛与人数设置</h2>
        <p>人数与阵型由本场主客队共用；球队名称、球员档案请在「球队管理」中维护。</p>
      </div>
      <span class="chipstat">{{ m.count }} 人制 · {{ m.homeFormation }} / {{ m.awayFormation }}</span>
    </div>

    <div class="row2">
      <div class="field" style="flex: 2 1 300px">
        <label class="lbl" for="f-mname">比赛名称</label>
        <input id="f-mname" type="text" :value="m.name" maxlength="40" @input="onName" />
      </div>
      <div class="field" style="flex: 1 1 220px">
        <label class="lbl" for="f-mcomp">赛事 / 轮次</label>
        <input id="f-mcomp" type="text" :value="m.competition" maxlength="30" @input="onComp" />
      </div>
      <div class="field" style="flex: 0 1 190px">
        <label class="lbl" for="f-mdate">比赛日期</label>
        <input id="f-mdate" type="date" :value="m.date" @input="onDate" />
      </div>
    </div>

    <div class="field">
      <span class="lbl">场上人数 *</span>
      <div class="chipset">
        <button
          v-for="n in counts"
          :key="n"
          type="button"
          class="pill"
          :aria-pressed="m.count === n ? 'true' : 'false'"
          @click="setMatchCount(n)"
        >
          {{ n }} 人制<small>{{ formationCount(n) }} 套阵型</small>
        </button>
      </div>
      <div class="note">切换人数会同步重建两侧阵型，已落位球员按槽位顺序保留，多出的球员自动转入替补。</div>
    </div>

    <div class="row2">
      <div class="field" style="flex: 1 1 240px">
        <label class="lbl" for="f-fh">主队阵型 · {{ homeName }}</label>
        <select id="f-fh" :value="m.homeFormation" @change="onFormation('home', $event)">
          <option v-for="k in fkeys" :key="k" :value="k">{{ k }}</option>
        </select>
      </div>
      <div class="field" style="flex: 1 1 240px">
        <label class="lbl" for="f-fa">客队阵型 · {{ awayName }}</label>
        <select id="f-fa" :value="m.awayFormation" @change="onFormation('away', $event)">
          <option v-for="k in fkeys" :key="k" :value="k">{{ k }}</option>
        </select>
      </div>
    </div>

    <div class="teamlinks">
      <span class="lbl" style="margin: 0">本场球队</span>
      <div class="teamlink">
        <span class="dot" :style="{ background: home?.color || '#c8102e' }"></span>
        <b>{{ homeName }}</b>
        <small>{{ home ? home.players.filter(isFilled).length : 0 }} 人</small>
      </div>
      <span class="mc-vs">VS</span>
      <div class="teamlink">
        <span class="dot" :style="{ background: away?.color || '#2563eb' }"></span>
        <b>{{ awayName }}</b>
        <small>{{ away ? away.players.filter(isFilled).length : 0 }} 人</small>
      </div>
      <span class="spacer"></span>
      <button class="btn ghost sm" @click="openTeams">前往球队管理</button>
    </div>

    <div class="btnrow">
      <button class="btn primary" @click="goStep(2)">下一步：名单录入</button>
      <span class="meta">名单录入时，把球员从球员库拖到首发或替补。</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FORMATIONS } from '../core/formations';
import { isFilled, teamName } from '../core/team';
import { activeMatch, awayTeam, goStep, homeTeam, openTeams, setFormation, setMatchCount, updateMatch } from '../stores/teamStore';
import type { Side } from '../core/types';

const counts = [5, 6, 8, 11];

const m = computed(() => activeMatch());
const fkeys = computed(() => Object.keys(FORMATIONS[m.value?.count || 6] || {}));
const home = computed(() => homeTeam());
const away = computed(() => awayTeam());
const homeName = computed(() => teamName(home.value, '主队未指定'));
const awayName = computed(() => teamName(away.value, '客队未指定'));

function formationCount(n: number): number {
  return Object.keys(FORMATIONS[n] || {}).length;
}

function onName(e: Event): void {
  updateMatch({ name: (e.target as HTMLInputElement).value });
}
function onComp(e: Event): void {
  updateMatch({ competition: (e.target as HTMLInputElement).value });
}
function onDate(e: Event): void {
  updateMatch({ date: (e.target as HTMLInputElement).value });
}
function onFormation(side: Side, e: Event): void {
  setFormation(side, (e.target as HTMLSelectElement).value);
}
</script>

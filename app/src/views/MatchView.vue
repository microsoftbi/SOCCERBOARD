<template>
  <div v-if="m">
    <section class="card matchhead">
      <div class="hd" style="margin-bottom: 12px">
        <div>
          <h2>{{ m.name || '未命名比赛' }}</h2>
          <p>
            {{ m.competition || '未填写赛事' }} · {{ fmtDate(m.date) }} · {{ m.count }} 人制
            <span v-if="m.exportedAt"> · 最近导出 {{ fmtTime(m.exportedAt) }}</span>
          </p>
        </div>
        <button class="btn ghost sm" @click="openMatches">← 返回比赛列表</button>
      </div>
      <div class="sideswitch">
        <button
          v-for="s in sides"
          :key="s.value"
          type="button"
          class="sidecard"
          :aria-pressed="state.side === s.value ? 'true' : 'false'"
          @click="switchSide(s.value)"
        >
          <span class="dot" :style="{ background: sideTeam(s.value)?.color || '#666' }"></span>
          <span class="sideinfo">
            <small>{{ s.label }}</small>
            <b>{{ teamName(sideTeam(s.value), '未指定球队') }}</b>
          </span>
          <span class="sidecount">{{ placed(s.value) }} / {{ m.count }}</span>
        </button>
      </div>
    </section>
    <StepNav />
    <StepSetup v-if="ui.step === 1" />
    <StepRoster v-else-if="ui.step === 2" />
    <StepBoard v-else-if="ui.step === 3" />
    <StepCast v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { teamName } from '../core/team';
import { activeMatch, activeUi, openMatches, state, switchSide, teamForSide } from '../stores/teamStore';
import type { Side } from '../core/types';
import { fmtTime } from '../core/utils';
import StepNav from '../components/StepNav.vue';
import StepSetup from '../components/StepSetup.vue';
import StepRoster from '../components/StepRoster.vue';
import StepBoard from '../components/StepBoard.vue';
import StepCast from '../components/StepCast.vue';

const sides: Array<{ value: Side; label: string }> = [
  { value: 'home', label: '主队' },
  { value: 'away', label: '客队' },
];

const m = computed(() => activeMatch());
const ui = computed(() => activeUi());

function sideTeam(side: Side) {
  return teamForSide(side, m.value);
}

function placed(side: Side): number {
  const mm = m.value;
  if (!mm) return 0;
  return mm[side].slots.filter((s) => s.pid != null).length;
}

function fmtDate(s: string): string {
  return s ? s.replace(/-/g, '/') : '日期待定';
}
</script>

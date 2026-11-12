<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>比赛列表</h2>
        <p>每场比赛独立保存名单、站位和播出设置；球队信息被修改后，所有引用该球队的比赛会自动同步。</p>
      </div>
      <button class="btn primary" @click="openNewMatch">＋ 新建比赛</button>
    </div>

    <div v-if="!state.matches.length" class="empty">
      <div class="empty-mark">⚽</div>
      <h3>还没有比赛</h3>
      <p>新建一场比赛，选择人数与阵型，再指定主客两队即可开始录入名单。</p>
      <div class="btnrow" style="justify-content: center">
        <button class="btn primary" @click="openNewMatch">新建比赛</button>
        <button class="btn ghost" @click="openTeams">先去管理球队</button>
      </div>
    </div>

    <div v-else class="matchlist">
      <article v-for="m in state.matches" :key="m.id" class="matchcard">
        <div class="mc-top">
          <span class="mc-date">{{ fmtDate(m.date) }}</span>
          <span class="chipstat" :class="{ ok: m.status === 'ready' }">
            {{ m.status === 'ready' ? '已导出' : '草稿' }}
          </span>
        </div>
        <h3 class="mc-name">{{ m.name || '未命名比赛' }}</h3>
        <div class="mc-comp">{{ m.competition || '未填写赛事' }}</div>
        <div class="mc-teams">
          <span class="mc-team">
            <span class="dot" :style="{ background: teamById(m.homeTeamId)?.color || '#c8102e' }"></span>
            <b>{{ teamName(teamById(m.homeTeamId), '主队') }}</b>
          </span>
          <span class="mc-vs">VS</span>
          <span class="mc-team">
            <span class="dot" :style="{ background: teamById(m.awayTeamId)?.color || '#2563eb' }"></span>
            <b>{{ teamName(teamById(m.awayTeamId), '客队') }}</b>
          </span>
        </div>
        <div class="mc-meta">
          {{ m.count }} 人制 · {{ m.homeFormation }} / {{ m.awayFormation }} ·
          {{ placedCount(m) }} / {{ m.count * 2 }} 人已排
        </div>
        <div class="mc-foot">
          <button class="btn primary sm" @click="openMatch(m.id)">打开比赛</button>
          <span class="spacer"></span>
          <button class="btn ghost sm" @click="remove(m.id, m.name)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { teamName } from '../core/team';
import { openMatch, openNewMatch, openTeams, state, teamById, deleteMatch, notify } from '../stores/teamStore';
import type { Match } from '../core/types';

function fmtDate(s: string): string {
  return s ? s.replace(/-/g, '/') : '日期待定';
}

function placedCount(m: Match): number {
  const a = m.home.slots.filter((s) => s.pid != null).length;
  const b = m.away.slots.filter((s) => s.pid != null).length;
  return a + b;
}

function remove(id: number, name: string): void {
  if (!window.confirm(`确认删除比赛「${name || '未命名比赛'}」？名单与站位会一并删除，球队不受影响。`)) return;
  deleteMatch(id);
  notify('比赛已删除');
}
</script>

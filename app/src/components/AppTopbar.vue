<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">SB</div>
      <div>
        <div class="brand-title">SOCCERBOARD</div>
        <div class="brand-sub">足球转播 · 球队介绍系统</div>
      </div>
    </div>
    <div class="teamseg navtabs">
      <button :aria-pressed="inMatches ? 'true' : 'false'" @click="openMatches">比赛</button>
      <button :aria-pressed="state.view === 'teams' ? 'true' : 'false'" @click="openTeams">球队</button>
    </div>
    <span v-if="state.view === 'match' && match" class="currentmatch">{{ match.name }}</span>
    <div class="spacer"></div>
    <div class="savestat">{{ state.saveStatus }}</div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { activeMatch, openMatches, openTeams, state } from '../stores/teamStore';

const inMatches = computed(() => state.view === 'matches' || state.view === 'new' || state.view === 'match');
const match = computed(() => activeMatch());
</script>

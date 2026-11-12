<template>
  <AppTopbar />
  <main>
    <MatchesView v-if="state.view === 'matches'" />
    <NewMatchWizard v-else-if="state.view === 'new'" />
    <TeamsView v-else-if="state.view === 'teams'" />
    <MatchView v-else-if="state.view === 'match'" />
    <section v-else class="card empty">
      <h2>暂无内容</h2>
      <p>从顶部导航进入「比赛」或「球队」。</p>
    </section>
  </main>
  <div class="toast" :class="{ on: !!state.toast }">{{ state.toast }}</div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { initStore, state } from './stores/teamStore';
import AppTopbar from './components/AppTopbar.vue';
import MatchesView from './views/MatchesView.vue';
import NewMatchWizard from './views/NewMatchWizard.vue';
import TeamsView from './views/TeamsView.vue';
import MatchView from './views/MatchView.vue';

onMounted(() => {
  void initStore();
});
</script>

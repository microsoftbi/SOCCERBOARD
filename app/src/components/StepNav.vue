<template>
  <nav class="steps">
    <button
      v-for="s in steps"
      :key="s.n"
      class="step"
      :class="{ done: s.n < ui.step }"
      :aria-current="ui.step === s.n ? 'true' : 'false'"
      @click="goStep(s.n)"
    >
      <b>{{ s.n }}</b> {{ s.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { activeUi, goStep } from '../stores/teamStore';

const ui = computed(() => activeUi());

const steps = [
  { n: 1, label: '比赛设置' },
  { n: 2, label: '名单录入' },
  { n: 3, label: '比分板' },
  { n: 4, label: 'PLAYER TO WATCH' },
  { n: 5, label: '播出与导出' },
];
</script>

<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>站位编排 · {{ sideLabel }}</h2>
        <p>阵型切换会按槽位顺序保留球员；拖拽替补或槽位可互换位置，点击槽位可选中后再点球员替换。</p>
      </div>
      <div class="hd-actions">
        <span class="chipstat">{{ summary.filled }} / {{ summary.count }} 已落位</span>
        <span class="chipstat">{{ summary.bench }} 替补</span>
      </div>
    </div>

    <div class="warnbox on" v-if="!summary.filled">首发还是空的：可以点「自动落位」，或从右侧替补、名单里安排球员。</div>
    <div class="errbox on" v-if="v.errors.length" style="margin-bottom: 10px">
      <div v-for="(e, i) in v.errors.slice(0, 3)" :key="i">· {{ e }}</div>
    </div>

    <div class="toolbar">
      <select :value="team.formation" @change="onFormation">
        <option v-for="k in fkeys" :key="k" :value="k">{{ k }}</option>
      </select>
      <button class="btn sm" @click="autoFillLineup">自动落位</button>
      <button class="btn ghost sm" @click="clearLineup">清空首发</button>
      <span class="spacer"></span>
      <span class="meta" style="font-size: 12px; color: var(--text-mute)">
        {{ state.selPid != null ? '已选球员：点击槽位放入' : state.selSlot >= 0 ? '已选槽位：点击球员放入' : '拖拽或点击操作' }}
      </span>
    </div>

    <div class="boardwrap">
      <div class="pitchcol">
        <div class="pitch">
          <div class="mk mk-field"></div>
          <div class="mk mk-mid"></div>
          <div class="mk mk-circle"></div>
          <div class="mk mk-spot"></div>
          <div class="mk mk-box top"></div>
          <div class="mk mk-box bot"></div>

          <div
            v-for="(s, idx) in team.slots"
            :key="idx"
            class="slot"
            :class="{ empty: s.pid == null, sel: state.selSlot === idx }"
            :style="{ left: s.x + '%', top: s.y + '%' }"
            @dragover.prevent
            @drop.prevent="onDropSlot($event, idx)"
            @click="clickSlot(idx)"
          >
            <div class="bubble">
              <template v-if="slotPlayer(s)">
                <img v-if="slotPlayer(s)!.photo" :src="slotPlayer(s)!.photo!" alt="" />
                <template v-else>{{ slotPlayer(s)!.num || '?' }}</template>
                <span v-if="slotPlayer(s)!.captain" class="capdot">C</span>
              </template>
              <template v-else>+</template>
            </div>
            <div class="tag">{{ slotPlayer(s) ? slotPlayer(s)!.name : s.pos }}</div>
            <div class="postag">{{ s.pos }}</div>
          </div>
        </div>
      </div>

      <div class="benchcol">
        <div class="bench-hd">
          <b>替补席</b>
          <span>{{ bench.length }} 人</span>
        </div>
        <div class="bench" @dragover.prevent @drop.prevent="onDropBench">
          <button
            v-for="p in bench"
            :key="p.id"
            type="button"
            class="bp"
            draggable
            @dragstart="onDrag($event, p.id)"
            @click="onBenchClick(p.id)"
          >
            <b>{{ p.num }}</b>
            <span>{{ p.name }}</span>
            <i>{{ p.pos || '—' }}</i>
          </button>
          <div v-if="!bench.length" class="benchnote">替补席为空。可回到「名单录入」把球员拖到替补。</div>
        </div>
        <button class="btn ghost sm" @click="goStep(2)">返回名单录入</button>
      </div>
    </div>

    <div class="btnrow">
      <button class="btn ghost" @click="goStep(2)">上一步</button>
      <span class="spacer"></span>
      <button class="btn primary" @click="goStep(4)">下一步：播出与导出</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { FORMATIONS } from '../core/formations';
import {
  activeValidation,
  autoFillLineup,
  benchPlayers,
  clearLineup,
  clickSlot,
  goStep,
  lineup,
  placeOnBench,
  placePlayer,
  rosterSummary,
  setFormation,
  slotPlayer,
  state,
} from '../stores/teamStore';

const team = computed(() => lineup());
const summary = rosterSummary;
const v = computed(() => activeValidation());
const bench = computed(() => benchPlayers());
const fkeys = computed(() => Object.keys(FORMATIONS[team.value.count] || {}));
const sideLabel = computed(() => (state.side === 'home' ? '主队' : '客队'));

function onFormation(e: Event): void {
  setFormation(state.side, (e.target as HTMLSelectElement).value);
}

const dragPid = ref<number | null>(null);

function onDrag(e: DragEvent, pid: number): void {
  dragPid.value = pid;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pid));
  }
}

function onDropSlot(e: DragEvent, idx: number): void {
  const raw = dragPid.value ?? Number(e.dataTransfer?.getData('text/plain'));
  dragPid.value = null;
  if (Number.isFinite(raw) && raw > 0) placePlayer(raw, idx);
}

function onDropBench(e: DragEvent): void {
  const raw = dragPid.value ?? Number(e.dataTransfer?.getData('text/plain'));
  dragPid.value = null;
  if (Number.isFinite(raw) && raw > 0) placeOnBench(raw);
}

function onBenchClick(pid: number): void {
  if (state.selSlot >= 0) {
    placePlayer(pid, state.selSlot);
    return;
  }
  const empty = team.value.slots.findIndex((s) => s.pid == null);
  if (empty >= 0) placePlayer(pid, empty);
  else placeOnBench(pid);
}
</script>

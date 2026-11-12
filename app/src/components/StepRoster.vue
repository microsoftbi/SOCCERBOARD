<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>名单录入 · {{ sideLabel }}</h2>
        <p>把左侧球员拖到中间的首发槽位或右侧替补区；也可以先点球员、再点槽位完成放置。</p>
      </div>
      <div class="hd-actions">
        <span class="chipstat">{{ summary.filled }} / {{ summary.count }} 首发</span>
        <span class="chipstat">{{ summary.bench }} 替补</span>
        <button class="btn sm" @click="autoFillLineup">自动落位</button>
        <button class="btn ghost sm" @click="clearLineup">清空</button>
      </div>
    </div>

    <div v-if="v.errors.length" class="errbox on">
      <div v-for="(e, i) in v.errors.slice(0, 5)" :key="i">· {{ e }}</div>
    </div>
    <div v-if="v.warnings.length" class="warnbox on">
      <div v-for="(w, i) in v.warnings.slice(0, 4)" :key="i">· {{ w }}</div>
    </div>

    <div class="roster3">
      <div class="rcol">
        <div class="rcol-hd">
          <b>球员库</b>
          <small>{{ team.players.length }} 人 · 已用 {{ summary.filled + summary.bench }}</small>
        </div>
        <div class="libfilter">
          <input v-model="query" type="text" placeholder="搜索号码或姓名" />
          <select v-model="posFilter">
            <option value="">全部位置</option>
            <option v-for="pos in posOptions" :key="pos" :value="pos">{{ pos }}</option>
          </select>
        </div>
        <div class="liblist">
          <div
            v-for="p in filtered"
            :key="p.id"
            class="pcard"
            :class="{ sel: state.selPid === p.id, thin: !isFilled(p), used: placementOf(p.id) !== 'none' }"
            :draggable="isFilled(p)"
            @dragstart="onDrag($event, p.id)"
            @click="clickPlayerCard(p.id)"
          >
            <span class="pnum">{{ p.num || '—' }}</span>
            <span class="pname">{{ p.name || '未填写' }}</span>
            <span v-if="p.captain" class="pcap">C</span>
            <span class="ppos">{{ p.pos || '—' }}</span>
            <span v-if="placementOf(p.id) === 'slot'" class="pbadge">首发</span>
            <span v-else-if="placementOf(p.id) === 'bench'" class="pbadge bench">替补</span>
          </div>
          <div v-if="!filtered.length" class="benchnote">没有匹配的球员。</div>
        </div>
        <div class="rcol-foot">在「球队管理」中可新增球员与照片、视频。</div>
      </div>

      <div class="rcol">
        <div class="rcol-hd">
          <b>首发</b>
          <small>{{ team.formation }} · {{ summary.filled }} / {{ summary.count }}</small>
        </div>
        <div class="slotlist">
          <div
            v-for="(s, idx) in team.slots"
            :key="idx"
            class="slotrow"
            :class="{ sel: state.selSlot === idx, filled: s.pid != null }"
            @dragover.prevent
            @drop.prevent="onDropSlot($event, idx)"
            @click="clickSlot(idx)"
          >
            <span class="spos">{{ s.pos }}</span>
            <template v-if="slotPlayer(s)">
              <span class="pnum">{{ slotPlayer(s)!.num }}</span>
              <b class="pname">{{ slotPlayer(s)!.name }}</b>
              <span v-if="slotPlayer(s)!.captain" class="pcap">C</span>
              <button class="del" title="移出首发" @click.stop="removeFromSlot(idx)">×</button>
            </template>
            <span v-else class="sempty">拖入球员 · 或先选球员后点击</span>
          </div>
        </div>
      </div>

      <div class="rcol">
        <div class="rcol-hd">
          <b>替补</b>
          <small>{{ summary.bench }} 人</small>
        </div>
        <div
          class="benchdrop"
          @dragover.prevent
          @drop.prevent="onDropBench"
        >
          <div
            v-for="(p, i) in bench"
            :key="p.id"
            class="pcard benchcard"
            draggable
            @dragstart="onDrag($event, p.id)"
          >
            <span class="pnum">{{ p.num }}</span>
            <span class="pname">{{ p.name }}</span>
            <span class="pord">{{ i + 1 }}</span>
            <button class="del" title="移出替补" @click.stop="removeFromBench(p.id)">×</button>
          </div>
          <div v-if="!bench.length" class="sempty" style="text-align: center; padding: 18px">
            把球员拖到这里作为替补
          </div>
        </div>
        <div class="rcol-foot">替补按顺序显示在展示页；可在首发与替补之间互相拖动。</div>
      </div>
    </div>

    <div class="btnrow">
      <button class="btn ghost" @click="goStep(1)">上一步</button>
      <span class="spacer"></span>
      <button class="btn primary" @click="goStep(3)" :disabled="!summary.filled">
        下一步：站位编排
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { POS_BY_COUNT } from '../core/formations';
import { isFilled } from '../core/team';
import type { Player } from '../core/types';
import {
  activeValidation,
  autoFillLineup,
  benchPlayers,
  clearLineup,
  clickPlayerCard,
  clickSlot,
  goStep,
  lineup,
  placeOnBench,
  placePlayer,
  placementOf,
  removeFromBench,
  removeFromSlot,
  rosterSummary,
  slotPlayer,
  state,
} from '../stores/teamStore';

const team = computed(() => lineup());
const summary = rosterSummary;
const bench = computed<Player[]>(() => benchPlayers());
const v = computed(() => activeValidation());
const posOptions = POS_BY_COUNT[11];

const query = ref('');
const posFilter = ref('');
const sideLabel = computed(() => (state.side === 'home' ? '主队' : '客队'));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return team.value.players.filter((p) => {
    const hitQ = !q || p.name.toLowerCase().includes(q) || p.num.includes(q);
    const hitPos = !posFilter.value || p.pos === posFilter.value;
    return hitQ && hitPos;
  });
});

const dragPid = ref<number | null>(null);

function onDrag(e: DragEvent, pid: number): void {
  dragPid.value = pid;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pid));
  }
}

function dropPid(e: DragEvent): number | null {
  const raw = dragPid.value ?? Number(e.dataTransfer?.getData('text/plain'));
  dragPid.value = null;
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function onDropSlot(e: DragEvent, idx: number): void {
  const pid = dropPid(e);
  if (pid) placePlayer(pid, idx);
}

function onDropBench(e: DragEvent): void {
  const pid = dropPid(e);
  if (pid) placeOnBench(pid);
}
</script>

<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>PLAYER TO WATCH</h2>
        <p>
          从主队、客队各选一名球员作为本场看点，并填写 30 字以内的看点介绍。第 5 步「播出与导出」中的 PLAYER TO WATCH 画面会并排展示两人的照片与看点。
        </p>
      </div>
      <span class="chipstat" :class="{ ok: readyCount === 2 }">已选择 {{ readyCount }} / 2</span>
    </div>

    <div class="ptwgrid">
      <div
        v-for="s in sides"
        :key="s.side"
        class="ptwpanel"
        :class="{ hidden: s.hide }"
        :style="{ '--tc': s.team?.color || '#2f6f4f' }"
      >
        <div class="ptwhead">
          <i class="ptwdot"></i>
          <b>{{ s.side === 'home' ? '主队' : '客队' }} · {{ s.team?.name.trim() || '待定' }}</b>
          <span v-if="s.player" class="ptwpos">{{ s.player.pos || '球员' }}</span>
        </div>

        <div class="ptwbody">
          <div class="ptwphoto">
            <img v-if="s.player?.photo" :src="s.player.photo" :alt="s.player.name" />
            <template v-else>
              <b>{{ s.player?.num || '?' }}</b>
              <span>{{ s.player ? '暂无照片' : '未选择球员' }}</span>
            </template>
          </div>

          <div class="ptwmeta">
            <label class="ptwcheck">
              <input type="checkbox" :checked="s.hide" @change="onHide(s.side, $event)" />
              <span>不展示</span>
            </label>
            <label :for="`ptw-pick-${s.side}`">选择球员</label>
            <select
              :id="`ptw-pick-${s.side}`"
              class="ptwselect"
              :value="s.player?.id || 0"
              @change="onPick(s.side, $event)"
            >
              <option :value="0">未选择</option>
              <option v-for="p in candidates(s.side)" :key="p.id" :value="p.id">
                {{ p.num || '—' }} · {{ p.name.trim() || '未命名' }} · {{ posLabel(p.pos) }}
              </option>
            </select>

            <label :for="`ptw-text-${s.side}`">本场看点</label>
            <textarea
              :id="`ptw-text-${s.side}`"
              class="ptwtext"
              rows="3"
              maxlength="30"
              placeholder="例如：本赛季已打进 8 球，定位球主罚手"
              :value="s.text"
              @input="onText(s.side, $event)"
            ></textarea>
            <div class="ptwcount">{{ s.text.length }} / 30</div>
          </div>
        </div>
      </div>
    </div>

    <div class="btnrow">
      <button class="btn ghost" @click="goStep(3)">← 上一步</button>
      <span style="flex: 1"></span>
      <button class="btn primary" @click="goStep(5)">下一步：播出与导出 →</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Player, Side } from '../core/types';
import { posLabel } from '../render/lineupShot';
import { activeMatch, goStep, setPlayerWatch, teamForSide } from '../stores/teamStore';

const m = computed(() => activeMatch());

const sides = computed(() =>
  (['home', 'away'] as Side[]).map((side) => {
    const team = teamForSide(side, m.value);
    const ui = m.value?.[side].ui;
    const pid = ui?.ptwPid || 0;
    const player = (team?.players || []).find((p) => p.id === pid) || null;
    return { side, team, player, text: ui?.ptwText || '', hide: ui?.ptwHide === true };
  }),
);

const readyCount = computed(() => sides.value.filter((s) => s.player).length);

/** 可选球员：本场首发 + 替补，按号码排序 */
function candidates(side: Side): Player[] {
  const team = teamForSide(side, m.value);
  const ms = m.value?.[side];
  if (!team || !ms) return [];
  const ids = [...(ms.slots || []).map((s) => s.pid).filter((x): x is number => typeof x === 'number'), ...ms.bench];
  const seen = new Set<number>();
  const list: Player[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = team.players.find((x) => x.id === id);
    if (p) list.push(p);
  }
  return list.sort((a, b) => (parseInt(a.num, 10) || 99) - (parseInt(b.num, 10) || 99));
}

function onPick(side: Side, ev: Event): void {
  const pid = Number((ev.target as HTMLSelectElement).value) || 0;
  setPlayerWatch(side, { ptwPid: pid });
}

function onText(side: Side, ev: Event): void {
  setPlayerWatch(side, { ptwText: (ev.target as HTMLTextAreaElement).value });
}

function onHide(side: Side, ev: Event): void {
  setPlayerWatch(side, { ptwHide: (ev.target as HTMLInputElement).checked });
}
</script>

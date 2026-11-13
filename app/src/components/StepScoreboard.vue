<template>
  <section class="card">
    <div class="hd">
      <div>
        <h2>比分板 · {{ m?.name?.trim() || '未命名比赛' }}</h2>
        <p>
          1920 × 220 实底比分条，主客队色带整块铺满画布，不依赖透明通道。顶部小字可自定义，调整比分后点「记录本次比分」生成一条比分变化记录；变化视频请在「播出与导出 → 比分变化」中播放或导出。
        </p>
      </div>
      <span class="chipstat" :class="{ ok: log.length > 0 }">记录 {{ log.length }} 条</span>
    </div>

    <div class="scbstage">
      <canvas ref="cvEl" class="scbcanvas"></canvas>
    </div>

    <div class="scbcols">
      <div class="scbpanel">
        <label class="lbl" for="scb-title">顶部小字</label>
        <input
          id="scb-title"
          class="scbtitle"
          type="text"
          maxlength="60"
          placeholder="例：FIFA WORLD CUP 2018 · GROUP B"
          :value="title"
          @input="onTitle"
        />
        <div class="scbcount">{{ title.length }} / 60 · 留空则不显示该行</div>

        <div class="scbteams">
          <div class="scbteam">
            <div class="scbteamhd">
              <span class="dot" :style="{ background: homeTeam?.color || '#c8102e' }"></span>
              <b>{{ homeTeam?.name?.trim() || '主队' }}</b>
              <span class="scbcode">{{ homeCode }}</span>
            </div>
            <div class="scbnamectl">
              <select class="scbnamesel" :value="homeMode" @change="onNameMode('home', $event)">
                <option value="code">英文缩写</option>
                <option value="full">完整队名</option>
                <option value="custom">自定义</option>
              </select>
              <input
                v-if="homeMode === 'custom'"
                class="scbnameinput"
                type="text"
                maxlength="20"
                placeholder="显示名称"
                :value="homeCustom"
                @input="onName('home', $event)"
              />
            </div>
            <div class="scbstepper">
              <button class="btn sm" :disabled="homeScore <= 0" @click="adjustScore('home', -1)">−</button>
              <input
                class="scbnum"
                type="text"
                inputmode="numeric"
                :value="homeScore"
                @change="onScore('home', $event)"
              />
              <button class="btn sm" :disabled="homeScore >= 99" @click="adjustScore('home', 1)">+</button>
            </div>
          </div>

          <div class="scbteam">
            <div class="scbteamhd">
              <span class="dot" :style="{ background: awayTeam?.color || '#1f6fd0' }"></span>
              <b>{{ awayTeam?.name?.trim() || '客队' }}</b>
              <span class="scbcode">{{ awayCode }}</span>
            </div>
            <div class="scbnamectl">
              <select class="scbnamesel" :value="awayMode" @change="onNameMode('away', $event)">
                <option value="code">英文缩写</option>
                <option value="full">完整队名</option>
                <option value="custom">自定义</option>
              </select>
              <input
                v-if="awayMode === 'custom'"
                class="scbnameinput"
                type="text"
                maxlength="20"
                placeholder="显示名称"
                :value="awayCustom"
                @input="onName('away', $event)"
              />
            </div>
            <div class="scbstepper">
              <button class="btn sm" :disabled="awayScore <= 0" @click="adjustScore('away', -1)">−</button>
              <input
                class="scbnum"
                type="text"
                inputmode="numeric"
                :value="awayScore"
                @change="onScore('away', $event)"
              />
              <button class="btn sm" :disabled="awayScore >= 99" @click="adjustScore('away', 1)">+</button>
            </div>
          </div>
        </div>

        <button class="btn primary scbrecord" :disabled="!m" @click="recordScore">记录本次比分</button>
      </div>

      <div class="scbpanel">
        <div class="scbloghead">
          <b>比分变化记录</b>
          <span style="flex: 1"></span>
          <button class="btn sm" :disabled="!log.length" @click="undoScoreRecord">撤销上一条</button>
          <button class="btn sm" :disabled="!log.length" @click="clearScoreLog">清空</button>
        </div>

        <div v-if="log.length" class="scblog">
          <div v-for="(e, i) in reversed" :key="e.id" class="scblogrow">
            <span class="idx">#{{ log.length - i }}</span>
            <span class="scbscore">{{ e.home }} : {{ e.away }}</span>
            <span class="tm">{{ fmtClock(e.at) }}</span>
          </div>
        </div>
        <div v-else class="scbempty">还没有记录。调整比分后点「记录本次比分」。</div>

        <button v-if="log.length" class="btn sm scbcsv" @click="exportCsv">导出记录 CSV</button>
      </div>
    </div>

    <div class="btnrow">
      <button class="btn ghost" @click="goStep(2)">← 上一步：名单录入</button>
      <span style="flex: 1"></span>
      <button class="btn ghost" @click="openMatches">← 返回比赛列表</button>
      <button class="btn" @click="goStep(4)">下一步：PLAYER TO WATCH →</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { download } from '../core/utils';
import type { ScoreNameMode } from '../core/types';
import { SB_H, SB_W, paintScoreboard } from '../render/scoreboard';
import {
  activeMatch,
  adjustScore,
  clearScoreLog,
  goStep,
  openMatches,
  recordScore,
  setScore,
  setScoreName,
  setScoreNameMode,
  setScoreTitle,
  teamForSide,
  undoScoreRecord,
} from '../stores/teamStore';

const cvEl = ref<HTMLCanvasElement | null>(null);

const m = computed(() => activeMatch());
const title = computed(() => m.value?.scoreTitle || '');
const homeScore = computed(() => m.value?.scoreHome || 0);
const awayScore = computed(() => m.value?.scoreAway || 0);
const log = computed(() => m.value?.scoreLog || []);
const reversed = computed(() => [...log.value].reverse());

const homeTeam = computed(() => teamForSide('home', m.value));
const awayTeam = computed(() => teamForSide('away', m.value));

const homeCode = computed(() => codeOf(homeTeam.value?.code || '', homeTeam.value?.name || ''));
const awayCode = computed(() => codeOf(awayTeam.value?.code || '', awayTeam.value?.name || ''));

const homeMode = computed<ScoreNameMode>(() => m.value?.home.ui.scoreNameMode || 'code');
const awayMode = computed<ScoreNameMode>(() => m.value?.away.ui.scoreNameMode || 'code');
const homeCustom = computed(() => m.value?.home.ui.scoreName || '');
const awayCustom = computed(() => m.value?.away.ui.scoreName || '');
const homeLabel = computed(() =>
  labelFor(homeMode.value, homeCustom.value, homeTeam.value?.name || '', homeCode.value, '主队'),
);
const awayLabel = computed(() =>
  labelFor(awayMode.value, awayCustom.value, awayTeam.value?.name || '', awayCode.value, '客队'),
);

/** 根据显示方式得到队名：缩写 / 完整队名 / 自定义（自定义为空时回退缩写） */
function labelFor(
  mode: ScoreNameMode,
  custom: string,
  full: string,
  code: string,
  fallback: string,
): string {
  if (mode === 'full') return full.trim() || fallback;
  if (mode === 'custom') return custom.trim() || code;
  return code;
}

function codeOf(code: string, name: string): string {
  const raw = (code || name || '').trim().toUpperCase();
  return raw.slice(0, 3) || '—';
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

function draw(): void {
  const elCanvas = cvEl.value;
  if (!elCanvas) return;
  if (elCanvas.width !== SB_W || elCanvas.height !== SB_H) {
    elCanvas.width = SB_W;
    elCanvas.height = SB_H;
  }
  const ctx = elCanvas.getContext('2d');
  if (!ctx) return;
  paintScoreboard(ctx, {
    title: title.value,
    home: { label: homeLabel.value, color: homeTeam.value?.color || '#c8102e' },
    away: { label: awayLabel.value, color: awayTeam.value?.color || '#1f6fd0' },
    homeScore: homeScore.value,
    awayScore: awayScore.value,
  });
}

function onTitle(ev: Event): void {
  setScoreTitle((ev.target as HTMLInputElement).value);
}

function onNameMode(side: 'home' | 'away', ev: Event): void {
  setScoreNameMode(side, (ev.target as HTMLSelectElement).value as ScoreNameMode);
}

function onName(side: 'home' | 'away', ev: Event): void {
  setScoreName(side, (ev.target as HTMLInputElement).value);
}

function onScore(side: 'home' | 'away', ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const n = Math.min(99, Math.max(0, Math.trunc(Number(input.value) || 0)));
  input.value = String(n);
  setScore(side, n);
}

function baseName(): string {
  const mm = m.value;
  const raw = (mm?.name || '').trim() || `${homeCode.value}-${awayCode.value}`;
  return raw.replace(/[\\/:*?"<>|\s]+/g, '_') || 'scoreboard';
}

function exportCsv(): void {
  const mm = m.value;
  if (!mm) return;
  const rows = [
    ['序号', '主队', '主队比分', '客队比分', '客队', '记录时间'],
    ...mm.scoreLog.map((e, i) => [
      String(i + 1),
      homeTeam.value?.name?.trim() || '主队',
      String(e.home),
      String(e.away),
      awayTeam.value?.name?.trim() || '客队',
      new Date(e.at).toLocaleString('zh-CN', { hour12: false }),
    ]),
  ];
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download(`${baseName()}_比分记录.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

watch(
  () => [
    title.value,
    homeScore.value,
    awayScore.value,
    homeLabel.value,
    awayLabel.value,
    homeTeam.value?.color,
    awayTeam.value?.color,
  ],
  () => draw(),
  { flush: 'post' },
);

onMounted(() => draw());
</script>

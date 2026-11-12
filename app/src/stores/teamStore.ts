import { computed, reactive } from 'vue';
import { dropVideo } from '../render/imageCache';
import { validateLineup, type ValidationResult } from '../core/validate';
import { DEFAULT_FORMATION, FORMATIONS } from '../core/formations';
import { emptyLibrary, legacyToLibrary, normalizeLibrary, slotsFor, type LegacySnapshot } from '../core/persist';
import { isFilled, playerById } from '../core/team';
import type {
  AppView,
  LibraryData,
  LineupTeam,
  Match,
  Player,
  Side,
  Slot,
  Team,
  ViewMode,
} from '../core/types';
import { createRepository, type LibraryRepository } from '../data/repository';

interface StoreState {
  ready: boolean;
  teams: Team[];
  matches: Match[];
  view: AppView;
  activeMatchId: number | null;
  side: Side;
  saveStatus: string;
  toast: string;
  showRosterError: boolean;
  selPid: number | null;
  selSlot: number;
  busy: boolean;
}

export const state = reactive<StoreState>({
  ready: false,
  teams: [],
  matches: [],
  view: 'matches',
  activeMatchId: null,
  side: 'home',
  saveStatus: '正在读取数据…',
  toast: '',
  showRosterError: false,
  selPid: null,
  selSlot: -1,
  busy: false,
});

let repository: LibraryRepository | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false;
let saveAgain = false;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(msg: string): void {
  state.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (state.toast === msg) state.toast = '';
  }, 3000);
}

export function repoKind(): string {
  return repository ? repository.kind : '—';
}

function applyLibrary(data: LibraryData): void {
  state.teams = data.teams;
  state.matches = data.matches;
  state.view = data.app.view;
  state.activeMatchId = data.app.activeMatchId;
  if (state.activeMatchId != null && !state.matches.some((m) => m.id === state.activeMatchId)) {
    state.activeMatchId = null;
    if (state.view === 'match') state.view = 'matches';
  }
  if (state.view === 'match' && state.activeMatchId == null) state.view = 'matches';
  state.side = 'home';
  resetSelection();
}

export function activeMatch(): Match | null {
  if (state.activeMatchId == null) return null;
  return state.matches.find((m) => m.id === state.activeMatchId) || null;
}

export function teamById(id: number | null | undefined): Team | null {
  if (id == null) return null;
  return state.teams.find((t) => t.id === id) || null;
}

export function teamForSide(side: Side, match: Match | null = activeMatch()): Team | null {
  if (!match) return null;
  return teamById(side === 'home' ? match.homeTeamId : match.awayTeamId);
}

export function homeTeam(): Team | null {
  return teamForSide('home');
}

export function awayTeam(): Team | null {
  return teamForSide('away');
}

export function lineup(side: Side = state.side): LineupTeam {
  const m = activeMatch();
  const team = teamForSide(side, m);
  const fallback: Team = team || { id: 0, name: '', code: '', color: '#c8102e', coach: '', players: [] };
  return {
    ...fallback,
    side,
    count: m ? m.count : 6,
    formation: m ? (side === 'home' ? m.homeFormation : m.awayFormation) : '2-2-1',
    slots: m ? m[side].slots : [],
    bench: m ? m[side].bench : [],
    exportedAt: m ? m.exportedAt : null,
    dirty: false,
  };
}

export function cur(): LineupTeam {
  return lineup();
}

export function activeUi() {
  const m = activeMatch();
  return m ? m[state.side].ui : { step: 1, view: 'h' as ViewMode, showPhoto: true, showName: true };
}

export function activeValidation(): ValidationResult {
  return validateLineup(lineup());
}

function snapshot(): LibraryData {
  return {
    teams: JSON.parse(JSON.stringify(state.teams)),
    matches: JSON.parse(JSON.stringify(state.matches)),
    app: { view: state.view, activeMatchId: state.activeMatchId },
  };
}

export function queueSave(delay = 450): void {
  if (!state.ready || !repository) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), delay);
}

async function flushSave(): Promise<void> {
  if (!repository) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  state.saveStatus = '保存中…';
  try {
    await repository.saveLibrary(snapshot());
    state.saveStatus = '已自动保存';
  } catch (err) {
    state.saveStatus = '保存失败';
    notify(`保存失败：${(err as Error).message}`);
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void flushSave(), 200);
    }
  }
}

async function migrateLegacy(legacy: LegacySnapshot): Promise<LibraryData> {
  const lib = legacyToLibrary(legacy);
  if (repository && repository.kind !== 'http') {
    const sideMap: Record<Side, number> = { home: 1, away: 2 };
    for (const side of ['home', 'away'] as Side[]) {
      const team = lib.teams.find((t) => t.id === sideMap[side]);
      if (!team) continue;
      for (const p of team.players) {
        if (!p.video) continue;
        const blob = await repository.loadLegacyVideo(side, p.id);
        if (blob) await repository.saveVideo(team.id, p.id, blob);
        else p.video = false;
        if (typeof p.photo === 'string' && p.photo.startsWith('data:image/')) {
          await repository.savePhoto(team.id, p.id, p.photo);
        }
      }
    }
  }
  return lib;
}

export async function initStore(): Promise<void> {
  try {
    repository = await createRepository();
  } catch {
    repository = null;
  }
  let data: LibraryData | null = null;
  let migrated = false;
  try {
    if (repository) data = await repository.loadLibrary();
    if (!data && repository) {
      const legacy = await repository.loadLegacySnapshot();
      if (legacy) {
        data = await migrateLegacy(legacy);
        migrated = true;
      }
    }
  } catch (err) {
    notify(`读取数据失败：${(err as Error).message}`);
  }
  applyLibrary(data || emptyLibrary());
  state.ready = true;
  state.saveStatus = repository ? (repository.kind === 'http' ? '已连接本机服务' : '离线模式') : '不可用';
  if (migrated) {
    notify('已把旧版主客队数据迁移为「球队 + 示例比赛」');
    queueSave(0);
  }
}

/* ---------- 一级视图 ---------- */

export function openView(view: AppView): void {
  if (view === 'match' && !activeMatch()) return;
  state.view = view;
  resetSelection();
  queueSave();
}

export function openMatches(): void {
  state.view = 'matches';
  state.activeMatchId = null;
  resetSelection();
  queueSave();
}

export function openTeams(): void {
  state.view = 'teams';
  resetSelection();
  queueSave();
}

export function openNewMatch(): void {
  state.view = 'new';
  resetSelection();
  queueSave();
}

export function openMatch(id: number): void {
  if (!state.matches.some((m) => m.id === id)) return;
  state.activeMatchId = id;
  state.view = 'match';
  state.side = 'home';
  resetSelection();
  queueSave();
}

/* ---------- 比赛 ---------- */

export interface NewMatchInput {
  name: string;
  competition: string;
  date: string;
  count: number;
  homeFormation: string;
  awayFormation: string;
  homeTeamId: number;
  awayTeamId: number;
}

export function createMatch(input: NewMatchInput): Match | null {
  const home = teamById(input.homeTeamId);
  const away = teamById(input.awayTeamId);
  if (!home || !away) {
    notify('请先选择主队和客队');
    return null;
  }
  if (home.id === away.id) {
    notify('主队和客队不能是同一支球队');
    return null;
  }
  const id = state.matches.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  const count = [5, 6, 8, 11].includes(input.count) ? input.count : 6;
  const homeFormation = FORMATIONS[count][input.homeFormation] ? input.homeFormation : DEFAULT_FORMATION[count];
  const awayFormation = FORMATIONS[count][input.awayFormation] ? input.awayFormation : DEFAULT_FORMATION[count];
  const match: Match = {
    id,
    name: input.name.trim() || `${home.name || '主队'} vs ${away.name || '客队'}`,
    competition: input.competition.trim(),
    date: input.date,
    homeTeamId: home.id,
    awayTeamId: away.id,
    count,
    homeFormation,
    awayFormation,
    status: 'draft',
    exportedAt: null,
    createdAt: new Date().toISOString(),
    home: { slots: slotsFor(count, homeFormation), bench: [], ui: { step: 1, view: 'h', showPhoto: true, showName: true } },
    away: { slots: slotsFor(count, awayFormation), bench: [], ui: { step: 1, view: 'h', showPhoto: true, showName: true } },
  };
  state.matches = [...state.matches, match];
  state.activeMatchId = id;
  state.view = 'match';
  state.side = 'home';
  resetSelection();
  queueSave(0);
  return match;
}

export function updateMatch(patch: Partial<Pick<Match, 'name' | 'competition' | 'date'>>): void {
  const m = activeMatch();
  if (!m) return;
  Object.assign(m, patch);
  queueSave();
}

export function deleteMatch(id: number): void {
  const m = state.matches.find((x) => x.id === id);
  if (!m) return;
  state.matches = state.matches.filter((x) => x.id !== id);
  if (state.activeMatchId === id) {
    state.activeMatchId = null;
    state.view = 'matches';
  }
  queueSave(0);
}

export function setMatchCount(count: number): void {
  const m = activeMatch();
  if (!m || !FORMATIONS[count]) return;
  m.count = count;
  for (const side of ['home', 'away'] as Side[]) {
    const key = side === 'home' ? 'homeFormation' : 'awayFormation';
    if (!FORMATIONS[count][m[key]]) m[key] = DEFAULT_FORMATION[count];
    rebuildSlots(side, m[key], count);
  }
  resetSelection();
  queueSave();
}

export function setFormation(side: Side, formation: string): void {
  const m = activeMatch();
  if (!m || !FORMATIONS[m.count][formation]) return;
  if (side === 'home') m.homeFormation = formation;
  else m.awayFormation = formation;
  rebuildSlots(side, formation, m.count);
  resetSelection();
  queueSave();
}

/** 按新阵型重建槽位：按索引保留已落位球员，多出的转入替补 */
function rebuildSlots(side: Side, formation: string, count: number): void {
  const m = activeMatch();
  if (!m) return;
  const sideData = m[side];
  const oldPids = sideData.slots.map((s) => s.pid);
  const slots = slotsFor(count, formation);
  const extra: number[] = [];
  slots.forEach((s, i) => {
    const pid = oldPids[i];
    s.pid = pid != null ? pid : null;
  });
  oldPids.slice(slots.length).forEach((pid) => {
    if (pid != null) extra.push(pid);
  });
  sideData.slots = slots;
  const bench = sideData.bench.filter((pid) => !slots.some((s) => s.pid === pid));
  extra.forEach((pid) => {
    if (!bench.includes(pid)) bench.push(pid);
  });
  sideData.bench = bench;
}

export function markExported(): void {
  const m = activeMatch();
  if (!m) return;
  m.exportedAt = Date.now();
  m.status = 'ready';
  queueSave();
}

/* ---------- 单侧 UI ---------- */

export function switchSide(side: Side): void {
  state.side = side;
  resetSelection();
  queueSave();
}

export function goStep(step: number): void {
  const m = activeMatch();
  if (!m) return;
  const target = Math.min(4, Math.max(1, step));
  const ui = m[state.side].ui;
  if (target >= 3 && target > ui.step) {
    const v = validateLineup(lineup());
    if (!v.ok) {
      state.showRosterError = true;
      notify(v.errors[0]);
      return;
    }
    state.showRosterError = false;
  }
  ui.step = target;
  resetSelection();
  queueSave();
}

export function setViewMode(view: ViewMode): void {
  const m = activeMatch();
  if (!m) return;
  m[state.side].ui.view = view;
  queueSave();
}

export function toggleFlag(key: 'showPhoto' | 'showName'): void {
  const m = activeMatch();
  if (!m) return;
  m[state.side].ui[key] = !m[state.side].ui[key];
  queueSave();
}

/* ---------- 球队管理 ---------- */

export function addTeam(): Team {
  const id = state.teams.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const team: Team = { id, name: '新球队', code: '', color: '#c8102e', coach: '', players: [] };
  state.teams = [...state.teams, team];
  queueSave();
  return team;
}

export function updateTeam(team: Team, patch: Partial<Pick<Team, 'name' | 'code' | 'color' | 'coach'>>): void {
  Object.assign(team, patch);
  queueSave();
}

export function deleteTeam(team: Team): boolean {
  const used = state.matches.some((m) => m.homeTeamId === team.id || m.awayTeamId === team.id);
  if (used) {
    notify('该球队已被比赛使用，请先删除相关比赛');
    return false;
  }
  state.teams = state.teams.filter((t) => t.id !== team.id);
  if (repository) {
    for (const p of team.players) {
      void repository.deletePhoto(team.id, p.id);
      void repository.deleteVideo(team.id, p.id);
    }
  }
  queueSave(0);
  return true;
}

export function addPlayer(team: Team): Player {
  const id = team.players.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const p: Player = { id, num: '', name: '', pos: '', captain: false, photo: null, video: false };
  team.players = [...team.players, p];
  queueSave();
  return p;
}

export function updatePlayer(team: Team, player: Player, patch: Partial<Pick<Player, 'num' | 'name' | 'pos'>>): void {
  Object.assign(player, patch);
  queueSave();
}

export function toggleCaptain(team: Team, player: Player): void {
  const next = !player.captain;
  team.players.forEach((p) => (p.captain = false));
  player.captain = next;
  queueSave();
}

export function deletePlayer(team: Team, player: Player): void {
  team.players = team.players.filter((p) => p.id !== player.id);
  for (const m of state.matches) {
    for (const side of ['home', 'away'] as Side[]) {
      if ((side === 'home' ? m.homeTeamId : m.awayTeamId) !== team.id) continue;
      m[side].slots.forEach((s) => {
        if (s.pid === player.id) s.pid = null;
      });
      m[side].bench = m[side].bench.filter((pid) => pid !== player.id);
    }
  }
  if (repository) {
    void repository.deletePhoto(team.id, player.id);
    void repository.deleteVideo(team.id, player.id);
  }
  dropVideo(team.id, player.id); // 球员 id 会被新增球员复用，必须清掉缓存
  queueSave();
}

export async function applyPhoto(team: Team, player: Player, dataUrl: string): Promise<void> {
  if (!dataUrl) return;
  player.photo = dataUrl;
  if (repository) {
    try {
      const url = await repository.savePhoto(team.id, player.id, dataUrl);
      if (url) player.photo = url;
    } catch (err) {
      notify(`照片保存失败：${(err as Error).message}`);
      return;
    }
  }
  queueSave();
}

export async function saveTeamVideo(team: Team, player: Player, file: File): Promise<boolean> {
  if (!repository) {
    notify('当前存储不可用，无法保存视频');
    return false;
  }
  if (file.size > 40 * 1024 * 1024) {
    notify('视频超过 40MB，请压缩后再上传');
    return false;
  }
  try {
    const ok = await repository.saveVideo(team.id, player.id, file);
    if (!ok) {
      notify('视频保存失败');
      return false;
    }
    player.video = true;
    delete player.videoCrop; // 新文件沿用旧构图会错位，由上传方重新裁切后再写入
    delete player.videoTrim;
    dropVideo(team.id, player.id); // 丢弃旧缓存，下次导出重新加载
    queueSave();
    notify('视频已保存');
    return true;
  } catch (err) {
    notify(`视频保存失败：${(err as Error).message}`);
    return false;
  }
}

export async function getTeamVideoUrl(team: Team, player: Player): Promise<string | null> {
  if (!repository) return null;
  return repository.getVideoUrl(team.id, player.id);
}

export async function removeTeamVideo(team: Team, player: Player): Promise<void> {
  if (repository) await repository.deleteVideo(team.id, player.id);
  player.video = false;
  delete player.videoCrop;
  delete player.videoTrim;
  dropVideo(team.id, player.id);
  queueSave();
}

/** 当前比赛当前一方的视频操作（队员展示页使用） */
export async function saveVideo(player: Player, file: File): Promise<boolean> {
  const team = teamForSide(state.side);
  if (!team) return false;
  return saveTeamVideo(team, player, file);
}

export function getVideoUrl(player: Player): Promise<string | null> {
  const team = teamForSide(state.side);
  return team ? getTeamVideoUrl(team, player) : Promise.resolve(null);
}

export async function removeVideo(player: Player): Promise<void> {
  const team = teamForSide(state.side);
  if (team) await removeTeamVideo(team, player);
}

/* ---------- 名单拖拽 ---------- */

export function resetSelection(): void {
  state.selPid = null;
  state.selSlot = -1;
}

export function selectPlayer(pid: number | null): void {
  state.selPid = state.selPid === pid ? null : pid;
}

export function selectSlot(idx: number): void {
  state.selSlot = state.selSlot === idx ? -1 : idx;
  if (state.selSlot !== -1) state.selPid = null;
}

/** 点击兜底：未选中球员时选中槽位；已选中球员时放入槽位 */
export function clickSlot(idx: number): void {
  if (state.selPid != null) {
    placePlayer(state.selPid, idx);
    return;
  }
  selectSlot(idx);
}

export function clickPlayerCard(pid: number): void {
  if (state.selSlot >= 0) {
    placePlayer(pid, state.selSlot);
    return;
  }
  selectPlayer(pid);
}

function sideSlots(): Slot[] {
  const m = activeMatch();
  return m ? m[state.side].slots : [];
}

function sideBench(): number[] {
  const m = activeMatch();
  return m ? m[state.side].bench : [];
}

function removeFromLineup(pid: number): { slot: number; bench: number } {
  const slots = sideSlots();
  const bench = sideBench();
  let slot = -1;
  let benchIdx = -1;
  slots.forEach((s, i) => {
    if (s.pid === pid) {
      slot = i;
      s.pid = null;
    }
  });
  benchIdx = bench.indexOf(pid);
  if (benchIdx >= 0) bench.splice(benchIdx, 1);
  return { slot, bench: benchIdx };
}

export function placePlayer(pid: number, slotIdx: number): void {
  const m = activeMatch();
  if (!m) return;
  const slots = m[state.side].slots;
  if (slotIdx < 0 || slotIdx >= slots.length) return;
  const target = slots[slotIdx];
  if (target.pid === pid) {
    resetSelection();
    return;
  }
  const occupant = target.pid;
  const source = removeFromLineup(pid);
  target.pid = pid;
  if (occupant != null) {
    if (source.slot >= 0) slots[source.slot].pid = occupant;
    else if (source.bench >= 0) m[state.side].bench.splice(source.bench, 0, occupant);
  }
  resetSelection();
  queueSave();
}

export function placeOnBench(pid: number, index?: number): void {
  const m = activeMatch();
  if (!m) return;
  const sideData = m[state.side];
  const source = removeFromLineup(pid);
  const at = index == null || index < 0 || index > sideData.bench.length ? sideData.bench.length : index;
  sideData.bench.splice(at, 0, pid);
  if (source.slot >= 0) {
    // 从首发移出即可，空出的槽位保持为空
  }
  resetSelection();
  queueSave();
}

export function removeFromSlot(slotIdx: number): void {
  const m = activeMatch();
  if (!m) return;
  const s = m[state.side].slots[slotIdx];
  if (s) s.pid = null;
  resetSelection();
  queueSave();
}

export function removeFromBench(pid: number): void {
  const m = activeMatch();
  if (!m) return;
  m[state.side].bench = m[state.side].bench.filter((x) => x !== pid);
  resetSelection();
  queueSave();
}

export function autoFillLineup(): void {
  const m = activeMatch();
  const team = teamForSide(state.side);
  if (!m || !team) return;
  const sideData = m[state.side];
  const placed = new Set(sideData.slots.filter((s) => s.pid != null).map((s) => s.pid!));
  const candidates = team.players.filter((p) => isFilled(p) && !placed.has(p.id));
  for (const slot of sideData.slots) {
    if (slot.pid != null) continue;
    let idx = candidates.findIndex((p) => p.pos === slot.pos);
    if (idx < 0) idx = candidates.findIndex((p) => (slot.pos === 'GK' ? p.pos === 'GK' : p.pos !== 'GK'));
    if (idx < 0 && candidates.length) idx = 0;
    if (idx < 0) break;
    const p = candidates.splice(idx, 1)[0];
    slot.pid = p.id;
  }
  sideData.bench = sideData.bench.filter((pid) => !sideData.slots.some((s) => s.pid === pid));
  resetSelection();
  queueSave();
}

export function clearLineup(): void {
  const m = activeMatch();
  const team = teamForSide(state.side);
  if (!m) return;
  const sideData = m[state.side];
  sideData.slots.forEach((s) => (s.pid = null));
  sideData.bench = team ? team.players.filter(isFilled).map((p) => p.id) : [];
  resetSelection();
  queueSave();
}

/** 名单中某个球员当前所处位置 */
export function placementOf(pid: number): 'slot' | 'bench' | 'none' {
  const m = activeMatch();
  if (!m) return 'none';
  if (m[state.side].slots.some((s) => s.pid === pid)) return 'slot';
  if (m[state.side].bench.includes(pid)) return 'bench';
  return 'none';
}

export function benchPlayers(): Player[] {
  const m = activeMatch();
  const team = teamForSide(state.side);
  if (!m || !team) return [];
  return m[state.side].bench
    .map((pid) => playerById(team, pid))
    .filter((p): p is Player => !!p);
}

export function slotPlayer(slot: Slot): Player | null {
  return slot.pid == null ? null : playerById(lineup(), slot.pid) || null;
}

export const rosterSummary = computed(() => {
  const l = lineup();
  const filled = l.slots.filter((s) => s.pid != null).length;
  const team = teamForSide(state.side);
  const total = team ? team.players.filter(isFilled).length : 0;
  return { filled, count: l.count, bench: l.bench.length, total };
});

export function normalizeIncoming(raw: unknown): LibraryData {
  return normalizeLibrary(raw);
}

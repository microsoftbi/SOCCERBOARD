import { DEFAULT_FORMATION, FORMATIONS } from './formations';
import { isFilled } from './team';
import type {
  AppState,
  LibraryData,
  Match,
  MatchSide,
  Player,
  ScoreEvent,
  Slot,
  Team,
  ViewMode,
} from './types';

/** 比分限制在 0~99 的整数 */
function normalizeScore(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0;
}

/** 步骤上限为 5（已移除「站位编排」）；旧的第 6 步「比分板」改为第 3 步 */
function normalizeStep(v: unknown): number {
  const n = Math.trunc(Number(v) || 1);
  if (n >= 6) return 3;
  return Math.min(5, Math.max(1, n));
}


function normalizeScoreLog(raw: unknown): ScoreEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e, i) => ({
      id: Number(e.id) > 0 ? Math.trunc(Number(e.id)) : i + 1,
      home: normalizeScore(e.home),
      away: normalizeScore(e.away),
      at: Number.isFinite(Number(e.at)) ? Number(e.at) : Date.now(),
    }));
}

export interface LegacySnapshot {
  v?: number;
  teams?: { home?: LegacyTeam | null; away?: LegacyTeam | null };
  ui?: { side?: 'home' | 'away'; step?: number; view?: ViewMode; showPhoto?: boolean; showName?: boolean };
}

export interface LegacyTeam {
  side?: 'home' | 'away';
  name?: string;
  code?: string;
  color?: string;
  count?: number;
  formation?: string;
  exportedAt?: number | null;
  players?: Player[];
  slots?: Slot[];
}

function nowIso(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function defaultUi(): MatchSide['ui'] {
  return {
    step: 1,
    view: 'h',
    showPhoto: true,
    showName: true,
    ptwPid: 0,
    ptwText: '',
    ptwHide: false,
    scoreNameMode: 'code',
    scoreName: '',
  };
}

export function emptyLibrary(): LibraryData {
  return {
    teams: [],
    matches: [],
    app: { view: 'matches', activeMatchId: null },
  };
}

export function normalizeApp(raw: unknown): AppState {
  const a = (raw || {}) as Partial<AppState>;
  const views = ['matches', 'teams', 'match', 'new'];
  return {
    view: views.includes(String(a.view)) ? (a.view as AppState['view']) : 'matches',
    activeMatchId: typeof a.activeMatchId === 'number' && a.activeMatchId > 0 ? a.activeMatchId : null,
  };
}

function normalizeCrop(raw: Player['videoCrop']): Player['videoCrop'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const w = Number(raw.w);
  const h = Number(raw.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return undefined;
  if (w <= 0 || h <= 0 || w > 1 || h > 1 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) {
    return undefined;
  }
  return { x, y, w, h };
}

function normalizeTrim(raw: Player['videoTrim']): Player['videoTrim'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const start = Number(raw.start);
  const end = Number(raw.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  if (start < 0 || end <= start) return undefined;
  return { start, end };
}

function normalizePlayer(raw: Partial<Player>, id: number): Player {
  return {
    id: typeof raw.id === 'number' && raw.id > 0 ? raw.id : id,
    num: String(raw.num ?? ''),
    name: String(raw.name ?? ''),
    pos: String(raw.pos ?? ''),
    captain: !!raw.captain,
    photo: typeof raw.photo === 'string' && raw.photo ? raw.photo : null,
    video: !!raw.video,
    videoCrop: normalizeCrop(raw.videoCrop),
    videoTrim: normalizeTrim(raw.videoTrim),
  };
}

function normalizeSide(raw: Partial<MatchSide> | undefined, count: number, formation: string): MatchSide {
  const slots = Array.isArray(raw?.slots)
    ? raw!.slots
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          pos: String(s.pos ?? ''),
          x: Number.isFinite(+s.x) ? +s.x : 50,
          y: Number.isFinite(+s.y) ? +s.y : 50,
          pid: typeof s.pid === 'number' ? s.pid : null,
        }))
    : [];
  if (!slots.length) slots.push(...slotsFor(count, formation));
  return {
    slots,
    bench: Array.isArray(raw?.bench) ? raw!.bench.filter((x) => typeof x === 'number') : [],
    ui: {
      step: normalizeStep(raw?.ui?.step),
      view: raw?.ui?.view === 'v' ? 'v' : 'h',
      showPhoto: raw?.ui?.showPhoto !== false,
      showName: raw?.ui?.showName !== false,
      ptwPid: Number(raw?.ui?.ptwPid) || 0,
      ptwText: String(raw?.ui?.ptwText ?? ''),
      ptwHide: raw?.ui?.ptwHide === true,
      scoreNameMode:
        raw?.ui?.scoreNameMode === 'full' || raw?.ui?.scoreNameMode === 'custom'
          ? raw.ui.scoreNameMode
          : 'code',
      scoreName: String(raw?.ui?.scoreName ?? '').slice(0, 20),
    },
  };
}

export function slotsFor(count: number, formation: string): Slot[] {
  const set = FORMATIONS[count] || FORMATIONS[6];
  const key = set[formation] ? formation : DEFAULT_FORMATION[count] || Object.keys(set)[0];
  return (set[key] || []).map((p) => ({ pos: p.pos, x: p.x, y: p.y, pid: null }));
}

export function normalizeLibrary(raw: unknown): LibraryData {
  const src = (raw || {}) as Partial<LibraryData>;
  const teams: Team[] = Array.isArray(src.teams)
    ? src.teams
        .filter((t) => t && typeof t === 'object')
        .map((t, i) => ({
          id: typeof t.id === 'number' && t.id > 0 ? t.id : i + 1,
          name: String(t.name ?? ''),
          code: String(t.code ?? ''),
          color: String(t.color ?? '#c8102e'),
          coach: String(t.coach ?? ''),
          players: Array.isArray(t.players)
            ? t.players.map((p, j) => normalizePlayer(p as Partial<Player>, j + 1))
            : [],
        }))
    : [];
  const matches: Match[] = Array.isArray(src.matches)
    ? src.matches
        .filter((m) => m && typeof m === 'object')
        .map((m, i) => {
          const count = [5, 6, 8, 11].includes(Number(m.count)) ? Number(m.count) : 6;
          const homeFormation = String(m.homeFormation || DEFAULT_FORMATION[count]);
          const awayFormation = String(m.awayFormation || DEFAULT_FORMATION[count]);
          return {
            id: typeof m.id === 'number' && m.id > 0 ? m.id : i + 1,
            name: String(m.name ?? ''),
            competition: String(m.competition ?? ''),
            date: String(m.date ?? nowIso()),
            homeTeamId: Number(m.homeTeamId) || 0,
            awayTeamId: Number(m.awayTeamId) || 0,
            count,
            homeFormation,
            awayFormation,
            status: m.status === 'ready' ? 'ready' : 'draft',
            exportedAt: typeof m.exportedAt === 'number' ? m.exportedAt : null,
            createdAt: String(m.createdAt || new Date().toISOString()),
            scoreTitle: String(m.scoreTitle ?? ''),
            scoreHome: normalizeScore(m.scoreHome),
            scoreAway: normalizeScore(m.scoreAway),
            scoreLog: normalizeScoreLog(m.scoreLog),
            home: normalizeSide(m.home, count, homeFormation),
            away: normalizeSide(m.away, count, awayFormation),
          };
        })
    : [];
  return { teams, matches, app: normalizeApp(src.app) };
}

function benchOf(players: Player[], slots: Slot[]): number[] {
  const placed = new Set(slots.filter((s) => s.pid != null).map((s) => s.pid!));
  return players.filter((p) => isFilled(p) && !placed.has(p.id)).map((p) => p.id);
}

/** 旧版单场快照（主客两队 + ui）转换为新结构 */
export function legacyToLibrary(raw: LegacySnapshot): LibraryData {
  const legacyHome = raw.teams?.home || {};
  const legacyAway = raw.teams?.away || {};
  const homeId = 1;
  const awayId = 2;
  const home: Team = {
    id: homeId,
    name: String(legacyHome.name ?? ''),
    code: String(legacyHome.code ?? ''),
    color: String(legacyHome.color ?? '#c8102e'),
    coach: '',
    players: (legacyHome.players || []).map((p, i) => normalizePlayer(p, i + 1)),
  };
  const away: Team = {
    id: awayId,
    name: String(legacyAway.name ?? ''),
    code: String(legacyAway.code ?? ''),
    color: String(legacyAway.color ?? '#1f6fd0'),
    coach: '',
    players: (legacyAway.players || []).map((p, i) => normalizePlayer(p, i + 1)),
  };
  const count = [5, 6, 8, 11].includes(Number(legacyHome.count)) ? Number(legacyHome.count) : 6;
  const formation = String(legacyHome.formation || DEFAULT_FORMATION[count]);
  const slots = (legacyHome.slots || []).map((s) => ({
    pos: String(s.pos ?? ''),
    x: Number(s.x) || 50,
    y: Number(s.y) || 50,
    pid: typeof s.pid === 'number' ? s.pid : null,
  }));
  const awayFormation = String(legacyAway.formation || formation);
  const awaySlots = (legacyAway.slots || []).map((s) => ({
    pos: String(s.pos ?? ''),
    x: Number(s.x) || 50,
    y: Number(s.y) || 50,
    pid: typeof s.pid === 'number' ? s.pid : null,
  }));
  const selected = raw.ui?.side === 'away' ? 'away' : 'home';
  const homeUi = defaultUi();
  const awayUi = defaultUi();
  if (selected === 'home') {
    homeUi.step = normalizeStep(raw.ui?.step);
    homeUi.view = raw.ui?.view === 'v' ? 'v' : 'h';
    homeUi.showPhoto = raw.ui?.showPhoto !== false;
    homeUi.showName = raw.ui?.showName !== false;
  } else {
    awayUi.step = normalizeStep(raw.ui?.step);
    awayUi.view = raw.ui?.view === 'v' ? 'v' : 'h';
    awayUi.showPhoto = raw.ui?.showPhoto !== false;
    awayUi.showName = raw.ui?.showName !== false;
  }
  const match: Match = {
    id: 1,
    name: `${home.name || '主队'} vs ${away.name || '客队'}`,
    competition: '示例比赛',
    date: nowIso(),
    homeTeamId: homeId,
    awayTeamId: awayId,
    count,
    homeFormation: formation,
    awayFormation,
    status: 'draft',
    exportedAt: legacyHome.exportedAt || null,
    createdAt: new Date().toISOString(),
    scoreTitle: '',
    scoreHome: 0,
    scoreAway: 0,
    scoreLog: [],
    home: {
      slots: slots.length ? slots : slotsFor(count, formation),
      bench: benchOf(home.players, slots),
      ui: homeUi,
    },
    away: {
      slots: awaySlots.length ? awaySlots : slotsFor(count, awayFormation),
      bench: benchOf(away.players, awaySlots),
      ui: awayUi,
    },
  };
  return {
    teams: [home, away],
    matches: [match],
    app: { view: 'match', activeMatchId: 1 },
  };
}

export type Side = 'home' | 'away';
export type ViewMode = 'h' | 'v';
export type AppView = 'matches' | 'teams' | 'match' | 'new';

/** 视频画面裁切：源帧归一化坐标（0-1），按 2:3 构图框选取 */
export interface VideoCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 视频时长截取：秒 */
export interface VideoTrim {
  start: number;
  end: number;
}

export interface Player {
  id: number;
  num: string;
  name: string;
  pos: string;
  captain: boolean;
  photo: string | null;
  video: boolean;
  /** 画面裁切；缺省表示整帧 cover 显示 */
  videoCrop?: VideoCrop;
  /** 时长截取；缺省表示整段循环 */
  videoTrim?: VideoTrim;
}

export interface Team {
  id: number;
  name: string;
  code: string;
  color: string;
  /** 主教练姓名（可选，用于转播画面信息条） */
  coach: string;
  players: Player[];
}

export interface Slot {
  pos: string;
  x: number;
  y: number;
  pid: number | null;
}

/** 比分板队名显示方式 */
export type ScoreNameMode = 'code' | 'full' | 'custom';

export interface SideUi {
  step: number;
  view: ViewMode;
  showPhoto: boolean;
  showName: boolean;
  /** PLAYER TO WATCH：本侧选中球员 id（0 表示未选） */
  ptwPid: number;
  /** PLAYER TO WATCH：本侧看点介绍 */
  ptwText: string;
  /** PLAYER TO WATCH：本侧不展示 */
  ptwHide: boolean;
  /** 比分板：队名显示方式（英文缩写 / 完整队名 / 自定义） */
  scoreNameMode: ScoreNameMode;
  /** 比分板：自定义队名（仅 scoreNameMode 为 custom 时使用） */
  scoreName: string;
}

export interface MatchSide {
  slots: Slot[];
  bench: number[];
  ui: SideUi;
}

/** 比分变化记录：记录一次比分快照 */
export interface ScoreEvent {
  id: number;
  home: number;
  away: number;
  /** 记录时刻（毫秒时间戳） */
  at: number;
}

export interface Match {
  id: number;
  name: string;
  competition: string;
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  count: number;
  homeFormation: string;
  awayFormation: string;
  status: 'draft' | 'ready';
  exportedAt: number | null;
  createdAt: string;
  /** 比分板顶部小字（留空则不画该行） */
  scoreTitle: string;
  scoreHome: number;
  scoreAway: number;
  /** 比分变化记录，按记录顺序追加 */
  scoreLog: ScoreEvent[];
  home: MatchSide;
  away: MatchSide;
}

export interface AppState {
  view: AppView;
  activeMatchId: number | null;
}

export interface LibraryData {
  teams: Team[];
  matches: Match[];
  app: AppState;
}

/** 渲染层使用的“本场单侧阵容”视图对象 */
export interface LineupTeam extends Team {
  side: Side;
  count: number;
  formation: string;
  slots: Slot[];
  bench: number[];
  exportedAt: number | null;
  dirty: boolean;
}

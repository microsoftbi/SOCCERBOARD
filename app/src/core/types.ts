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

export interface SideUi {
  step: number;
  view: ViewMode;
  showPhoto: boolean;
  showName: boolean;
}

export interface MatchSide {
  slots: Slot[];
  bench: number[];
  ui: SideUi;
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

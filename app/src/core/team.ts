import type { Player } from './types';

/** 号码与姓名都填写后视为“已录入” */
export function isFilled(p: Player): boolean {
  return !!String(p.num).trim() && !!String(p.name).trim();
}

export function filledPlayers(t: { players: Player[] }): Player[] {
  return (t.players || []).filter(isFilled);
}

export function playerById(t: { players: Player[] }, pid: number): Player | undefined {
  return (t.players || []).find((p) => p.id === pid);
}

export function teamName(t: { name: string } | null | undefined, fallback: string): string {
  return (t && t.name.trim()) || fallback;
}

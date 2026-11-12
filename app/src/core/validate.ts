import { playerById } from './team';
import type { LineupTeam, Player } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  bad: number[];
}

function validPlayer(p: Player): boolean {
  return !!p.num.trim() && !!p.name.trim();
}

/** 校验本场单侧首发名单：姓名、槽位完整、号码、门将、队长 */
export function validateLineup(t: LineupTeam): ValidationResult {
  const res: ValidationResult = { ok: true, errors: [], warnings: [], bad: [] };
  if (!t.name.trim()) {
    res.ok = false;
    res.errors.push('请先在「球队管理」填写球队名称');
  }
  const placed: Player[] = [];
  const empty = (t.slots || []).filter((s) => s.pid == null);
  (t.slots || []).forEach((s) => {
    if (s.pid == null) return;
    const p = playerById(t, s.pid);
    if (!p) {
      res.ok = false;
      res.errors.push(`槽位 ${s.pos} 的球员已不在球队中，请重新安排`);
      return;
    }
    placed.push(p);
    if (!validPlayer(p)) res.bad.push(p.id);
  });
  if (empty.length) {
    res.ok = false;
    res.errors.push(`首发未排满：还有 ${empty.length} 个位置未安排球员`);
  }
  const invalid = placed.find((p) => !validPlayer(p));
  if (invalid) {
    res.ok = false;
    res.errors.push(`${invalid.name || '某球员'} 的号码或姓名未填写`);
  }
  const badNum = placed.find((p) => +p.num >= 1 && +p.num <= 99 ? false : true);
  if (badNum) {
    res.ok = false;
    res.errors.push(`${badNum.name || '某球员'} 的号码需在 1–99 之间`);
    res.bad.push(badNum.id);
  }
  const seen: Record<string, Player> = {};
  placed.forEach((p) => {
    const k = String(p.num).trim();
    if (seen[k]) {
      res.ok = false;
      res.errors.push(`号码 ${p.num} 已被 ${seen[k].name || '另一名球员'} 占用`);
      res.bad.push(p.id);
    } else seen[k] = p;
  });
  if (!placed.some((p) => p.pos === 'GK')) {
    res.ok = false;
    res.errors.push('首发中没有门将：请把一位首发球员的主位置设为 GK');
  }
  if (placed.filter((p) => p.captain).length > 1) {
    res.ok = false;
    res.errors.push('首发中只能有一名队长');
  }
  if (!placed.some((p) => p.captain)) res.warnings.push('首发尚未指定队长');
  const noPhoto = placed.filter((p) => !p.photo).length;
  if (noPhoto) res.warnings.push(`${noPhoto} 名首发球员未上传照片（站位图将显示号码占位）`);
  return res;
}

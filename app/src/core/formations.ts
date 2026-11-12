export interface FormationPoint {
  pos: string;
  x: number;
  y: number;
}

const mk = (pos: string, x: number, y: number): FormationPoint => ({ pos, x, y });

/** 阵型库（后场 → 前场） */
export const FORMATIONS: Record<number, Record<string, FormationPoint[]>> = {
  5: {
    '2-2': [mk('GK', 50, 88), mk('LB', 32, 66), mk('RB', 68, 66), mk('LST', 34, 30), mk('RST', 66, 30)],
    '1-2-1': [mk('GK', 50, 88), mk('CB', 50, 70), mk('LM', 26, 48), mk('RM', 74, 48), mk('ST', 50, 24)],
    '3-1': [mk('GK', 50, 88), mk('LB', 24, 68), mk('CB', 50, 68), mk('RB', 76, 68), mk('ST', 50, 28)],
  },
  6: {
    '2-2-1': [mk('GK', 50, 88), mk('LB', 28, 68), mk('RB', 72, 68), mk('LCM', 30, 48), mk('RCM', 70, 48), mk('ST', 50, 24)],
    '1-3-1': [mk('GK', 50, 88), mk('CB', 50, 70), mk('LM', 18, 48), mk('CM', 50, 48), mk('RM', 82, 48), mk('ST', 50, 24)],
    '3-2': [mk('GK', 50, 88), mk('LB', 22, 68), mk('CB', 50, 68), mk('RB', 78, 68), mk('LM', 32, 44), mk('RM', 68, 44)],
    '2-1-2': [mk('GK', 50, 88), mk('LB', 30, 70), mk('RB', 70, 70), mk('CM', 50, 50), mk('LST', 32, 26), mk('RST', 68, 26)],
  },
  8: {
    '3-2-2': [mk('GK', 50, 88), mk('LB', 24, 70), mk('CB', 50, 70), mk('RB', 76, 70), mk('LCM', 34, 50), mk('RCM', 66, 50), mk('LST', 34, 26), mk('RST', 66, 26)],
    '2-3-2': [mk('GK', 50, 88), mk('LB', 32, 72), mk('RB', 68, 72), mk('LM', 22, 50), mk('CM', 50, 50), mk('RM', 78, 50), mk('LST', 34, 26), mk('RST', 66, 26)],
    '3-3-1': [mk('GK', 50, 88), mk('LB', 24, 72), mk('CB', 50, 72), mk('RB', 76, 72), mk('LM', 22, 48), mk('CM', 50, 48), mk('RM', 78, 48), mk('ST', 50, 24)],
    '4-2-1': [mk('GK', 50, 88), mk('LB', 18, 72), mk('LCB', 38, 72), mk('RCB', 62, 72), mk('RB', 82, 72), mk('LCM', 36, 48), mk('RCM', 64, 48), mk('ST', 50, 24)],
  },
  11: {
    '4-4-2': [mk('GK', 50, 90), mk('LB', 16, 72), mk('LCB', 38, 72), mk('RCB', 62, 72), mk('RB', 84, 72), mk('LM', 14, 48), mk('LCM', 38, 48), mk('RCM', 62, 48), mk('RM', 86, 48), mk('LST', 38, 22), mk('RST', 62, 22)],
    '4-3-3': [mk('GK', 50, 90), mk('LB', 16, 72), mk('LCB', 38, 72), mk('RCB', 62, 72), mk('RB', 84, 72), mk('LCM', 30, 50), mk('CM', 50, 54), mk('RCM', 70, 50), mk('LW', 22, 26), mk('ST', 50, 18), mk('RW', 78, 26)],
    '4-2-3-1': [mk('GK', 50, 90), mk('LB', 16, 72), mk('LCB', 38, 72), mk('RCB', 62, 72), mk('RB', 84, 72), mk('LDM', 38, 56), mk('RDM', 62, 56), mk('LAM', 24, 34), mk('CAM', 50, 32), mk('RAM', 76, 34), mk('ST', 50, 16)],
    '4-4-1-1': [mk('GK', 50, 90), mk('LB', 16, 72), mk('LCB', 38, 72), mk('RCB', 62, 72), mk('RB', 84, 72), mk('LM', 14, 50), mk('LCM', 38, 52), mk('RCM', 62, 52), mk('RM', 86, 50), mk('SS', 50, 32), mk('ST', 50, 15)],
    '3-5-2': [mk('GK', 50, 90), mk('LCB', 28, 72), mk('CB', 50, 74), mk('RCB', 72, 72), mk('LM', 12, 52), mk('LCM', 34, 52), mk('CM', 50, 56), mk('RCM', 66, 52), mk('RM', 88, 52), mk('LST', 36, 24), mk('RST', 64, 24)],
    '5-3-2': [mk('GK', 50, 90), mk('LWB', 10, 66), mk('LCB', 28, 74), mk('CB', 50, 76), mk('RCB', 72, 74), mk('RWB', 90, 66), mk('LCM', 32, 50), mk('CM', 50, 52), mk('RCM', 68, 50), mk('LST', 38, 24), mk('RST', 62, 24)],
  },
};

export const LABEL: Record<string, string> = {
  GK: '门将', LB: '左后卫', RB: '右后卫', CB: '中后卫', LCB: '左中卫', RCB: '右中卫',
  LWB: '左翼卫', RWB: '右翼卫', CDM: '后腰', LDM: '左后腰', RDM: '右后腰',
  CM: '中前卫', LCM: '左中前卫', RCM: '右中前卫', CAM: '前腰', LAM: '左前腰', RAM: '右前腰',
  LM: '左前卫', RM: '右前卫', LW: '左边锋', RW: '右边锋', ST: '中锋', LST: '左前锋', RST: '右前锋', SS: '影子前锋', CF: '前锋',
};

export const POS_BY_COUNT: Record<number, string[]> = {
  5: ['GK', 'LB', 'RB', 'CB', 'CM', 'LM', 'RM', 'ST'],
  6: ['GK', 'LB', 'RB', 'CB', 'LCM', 'RCM', 'CM', 'LM', 'RM', 'ST', 'LST', 'RST'],
  8: ['GK', 'LB', 'RB', 'CB', 'LCB', 'RCB', 'CDM', 'LCM', 'RCM', 'CM', 'LM', 'RM', 'LW', 'RW', 'ST', 'LST', 'RST', 'CAM'],
  11: ['GK', 'LB', 'RB', 'CB', 'LCB', 'RCB', 'LWB', 'RWB', 'CDM', 'LDM', 'RDM', 'LCM', 'RCM', 'CM', 'CAM', 'LAM', 'RAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'LST', 'RST', 'SS', 'CF'],
};

export const DEFAULT_FORMATION: Record<number, string> = {
  5: '2-2',
  6: '2-2-1',
  8: '3-2-2',
  11: '4-4-2',
};

export const FONT_SYS = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
export const FONT_MONO = 'ui-monospace,Menlo,Consolas,monospace';

import { CustomQuest, Log, Quest, RareEvent, Rarity, Settings } from './types';
import { PRESET_QUESTS, RARITIES, rarityOf, levelOf, XP_DROP_BONUS, XP_NOTE_BONUS, XP_EVENT } from './options';
import { parseKey, weekStart, addDays } from './dates';

/** ドロップの対象になるお題（出さないことにしたプリセットは除く） */
export function allQuests(custom: CustomQuest[]): Quest[] {
  return [
    ...PRESET_QUESTS,
    ...custom.map((c) => ({ id: c.id, title: c.title, category: c.category, rarity: c.rarity, custom: true })),
  ];
}

export function activeQuests(custom: CustomQuest[], settings: Settings): Quest[] {
  const hidden = new Set(settings.hidden);
  return allQuests(custom).filter((q) => !hidden.has(q.id));
}

export function logXp(log: Log): number {
  return rarityOf(log.rarity).xp + (log.fromDrop ? XP_DROP_BONUS : 0) + (log.note.trim() ? XP_NOTE_BONUS : 0);
}

export function totalXp(logs: Log[], events: RareEvent[]): number {
  return logs.reduce((sum, l) => sum + logXp(l), 0)
    + events.filter((e) => e.status === 'done').length * XP_EVENT;
}

/** お題ID → やってみた回数 */
export function countByQuest(logs: Log[]): Map<string, number> {
  const map = new Map<string, number>();
  logs.forEach((l) => map.set(l.questId, (map.get(l.questId) ?? 0) + 1));
  return map;
}

function weightedPick<T>(items: T[], weightOf: (item: T) => number, rand: () => number): T | null {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

/**
 * ドロップを1つ引く。
 * 1) レア度を確率で決める（そのレア度のお題が無ければ他のレア度から）
 * 2) まだやったことのないお題ほど出やすく（3倍）、直近に出たお題は避ける
 */
export function drawQuest(
  pool: Quest[],
  counts: Map<string, number>,
  avoidIds: string[],
  rand: () => number = Math.random,
): Quest | null {
  const avoid = new Set(avoidIds);
  let candidates = pool.filter((q) => !avoid.has(q.id));
  if (candidates.length === 0) candidates = pool;
  if (candidates.length === 0) return null;

  const available = RARITIES.filter((r) => candidates.some((q) => q.rarity === r.key));
  const rarity = weightedPick(available, (r) => r.weight, rand);
  const inRarity = candidates.filter((q) => q.rarity === rarity?.key);
  return weightedPick(inRarity, (q) => ((counts.get(q.id) ?? 0) === 0 ? 3 : 1), rand);
}

export function hitRate(logs: Log[]): number | null {
  if (logs.length === 0) return null;
  return Math.round((logs.filter((l) => l.result === 'hit').length / logs.length) * 100);
}

/** 1回以上やってみた週が続いている数（今週まだでも先週まで続いていれば数える） */
export function weekStreak(logs: Log[], today: string): number {
  const weeks = new Set(logs.map((l) => weekStart(l.date)));
  let week = weekStart(today);
  if (!weeks.has(week)) week = addDays(week, -7);
  let n = 0;
  while (weeks.has(week)) {
    n += 1;
    week = addDays(week, -7);
  }
  return n;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000);
}

/** 予定中のレアイベントを日付順（未定は最後）に */
export function plannedEvents(events: RareEvent[]): RareEvent[] {
  return events
    .filter((e) => e.status === 'planned')
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.createdAt - b.createdAt;
    });
}

export function doneEvents(events: RareEvent[]): RareEvent[] {
  return events
    .filter((e) => e.status === 'done')
    .sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
}

/** レア度ごとの発見数 / 総数（図鑑の埋まり具合） */
export function discoveryByRarity(pool: Quest[], counts: Map<string, number>): { rarity: Rarity; found: number; total: number }[] {
  return RARITIES.map((r) => {
    const list = pool.filter((q) => q.rarity === r.key);
    return { rarity: r.key, found: list.filter((q) => (counts.get(q.id) ?? 0) > 0).length, total: list.length };
  });
}

// ============================================================
// これまでの行動（はじめた頃と今の比較・年表）
// ============================================================
export type TimelineEntry =
  | { kind: 'log'; no: number; date: string; log: Log; levelUp: number | null }
  | { kind: 'event'; no: number; date: string; event: RareEvent; levelUp: number | null };

/** やってみた記録と行ってきたレアイベントを古い順に並べ、通し番号と「この行動でレベルが上がったか」を付ける */
export function buildTimeline(logs: Log[], events: RareEvent[]): TimelineEntry[] {
  const items: { date: string; at: number; xp: number; entry: (no: number, levelUp: number | null) => TimelineEntry }[] = [
    ...logs.map((l) => ({
      date: l.date, at: l.createdAt, xp: logXp(l),
      entry: (no: number, levelUp: number | null): TimelineEntry => ({ kind: 'log', no, date: l.date, log: l, levelUp }),
    })),
    ...events.filter((e) => e.status === 'done' && e.doneDate).map((e) => ({
      date: e.doneDate, at: e.createdAt, xp: XP_EVENT,
      entry: (no: number, levelUp: number | null): TimelineEntry => ({ kind: 'event', no, date: e.doneDate, event: e, levelUp }),
    })),
  ];
  items.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
  let xp = 0;
  let level = 1;
  return items.map((it, i) => {
    xp += it.xp;
    const next = levelOf(xp).level;
    const up = next > level ? next : null;
    level = next;
    return it.entry(i + 1, up);
  });
}

export interface PeriodSummary {
  count: number;
  from: string;
  to: string;
  hitRate: number; // %
  rareRate: number; // レア以上の割合 %
  categories: number; // 試したカテゴリの数
  noteRate: number; // ひとことを残した割合 %
}

function summarize(list: Log[]): PeriodSummary {
  const pct = (n: number): number => Math.round((n / list.length) * 100);
  return {
    count: list.length,
    from: list[0].date,
    to: list[list.length - 1].date,
    hitRate: pct(list.filter((l) => l.result === 'hit').length),
    rareRate: pct(list.filter((l) => l.rarity !== 'common').length),
    categories: new Set(list.map((l) => l.category)).size,
    noteRate: pct(list.filter((l) => l.note.trim()).length),
  };
}

export const COMPARE_SIZE = 5;

/** 最初の数回と最近の数回をくらべる（同じ回数どうしで比較。記録が2件未満なら null） */
export function compareStartNow(logs: Log[]): { start: PeriodSummary; now: PeriodSummary } | null {
  if (logs.length < 2) return null;
  const asc = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const n = Math.min(COMPARE_SIZE, Math.floor(asc.length / 2));
  return { start: summarize(asc.slice(0, n)), now: summarize(asc.slice(-n)) };
}

import { CustomQuest, Log, Quest, RareEvent, Rarity, Settings } from './types';
import { PRESET_QUESTS, RARITIES, rarityOf, XP_DROP_BONUS, XP_NOTE_BONUS, XP_EVENT } from './options';
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

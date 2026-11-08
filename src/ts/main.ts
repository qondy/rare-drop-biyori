import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf, addDays } from './dates';
import {
  CATEGORIES, RARITIES, RESULTS, EVENT_EXAMPLES, EVENT_INTERVAL_DAYS, XP_EVENT,
  categoryLabel, rarityOf, resultLabel, levelOf,
} from './options';
import {
  subscribeQuests, subscribeDraws, subscribeLogs, subscribeEvents, subscribeSettings,
  createQuest, updateQuest, deleteQuest, saveHidden, saveDraw, setDrawStatus,
  createLog, updateLog, deleteLog, createEvent, updateEventPlan, completeEvent, reopenEvent, deleteEvent,
  QuestInput, MAX_TITLE,
} from './store';
import {
  allQuests, activeQuests, logXp, totalXp, countByQuest, drawQuest, hitRate, weekStreak,
  daysBetween, plannedEvents, doneEvents, discoveryByRarity,
  buildTimeline, compareStartNow, TimelineEntry,
} from './stats';
import { Category, CustomQuest, Draw, Log, Quest, RareEvent, Rarity, Result, Settings } from './types';
import { initClickTracking, track } from './analytics';
import { initTextareas, autoGrow, renderMemoView } from './memo-ui';

initClickTracking();

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const btnFab = $<HTMLButtonElement>('btn-fab');

const todayDateEl = $('today-date');
const todayLevel = $('today-level');
const todayTitle = $('today-title');
const todayFound = $('today-found');
const todayStreak = $('today-streak');
const dropArea = $('drop-area');
const todayEvent = $('today-event');
const todayRecent = $('today-recent');

const zukanProgress = $('zukan-progress');
const zukanChips = $('zukan-chips');
const toggleReveal = $<HTMLInputElement>('toggle-reveal');
const zukanList = $('zukan-list');
const hiddenFold = $('hidden-fold');
const hiddenCount = $('hidden-count');
const hiddenList = $('hidden-list');

const eventNudge = $('event-nudge');
const eventList = $('event-list');
const eventDoneFold = $('event-done-fold');
const eventDoneCount = $('event-done-count');
const eventDoneList = $('event-done-list');

const recLevel = $('rec-level');
const recTitle = $('rec-title');
const recFill = $('rec-fill');
const recNext = $('rec-next');
const recTries = $('rec-tries');
const recHit = $('rec-hit');
const recEvents = $('rec-events');
const recCats = $('rec-cats');
const recList = $('rec-list');
const recCompare = $('rec-compare');
const recCount = $('rec-count');
const orderButtons = document.querySelectorAll<HTMLButtonElement>('.order-toggle__btn');

const logOverlay = $('log-modal-overlay');
const logForm = $<HTMLFormElement>('log-form');
const logModalTitle = $('log-modal-title');
const logQuest = $('log-quest');
const inputLogDate = $<HTMLInputElement>('input-log-date');
const logResults = $('log-results');
const inputLogNote = $<HTMLTextAreaElement>('input-log-note');
const btnLogDelete = $<HTMLButtonElement>('btn-log-delete');
const btnLogSubmit = $<HTMLButtonElement>('btn-log-submit');

const questOverlay = $('quest-modal-overlay');
const questForm = $<HTMLFormElement>('quest-form');
const questModalTitle = $('quest-modal-title');
const inputQuestTitle = $<HTMLInputElement>('input-quest-title');
const questCats = $('quest-cats');
const questRarities = $('quest-rarities');
const btnQuestDelete = $<HTMLButtonElement>('btn-quest-delete');
const btnQuestSubmit = $<HTMLButtonElement>('btn-quest-submit');

const detailOverlay = $('detail-modal-overlay');
const detailQuest = $('detail-quest');
const detailLogs = $('detail-logs');
const detailActions = $('detail-actions');

const eventOverlay = $('event-modal-overlay');
const eventForm = $<HTMLFormElement>('event-form');
const eventModalTitle = $('event-modal-title');
const inputEventTitle = $<HTMLInputElement>('input-event-title');
const eventExamples = $('event-examples');
const inputEventDate = $<HTMLInputElement>('input-event-date');
const btnEventDelete = $<HTMLButtonElement>('btn-event-delete');
const btnEventSubmit = $<HTMLButtonElement>('btn-event-submit');

const doneOverlay = $('done-modal-overlay');
const doneForm = $<HTMLFormElement>('done-form');
const doneEvent = $('done-event');
const inputDoneDate = $<HTMLInputElement>('input-done-date');
const inputDoneNote = $<HTMLTextAreaElement>('input-done-note');
const btnDoneSubmit = $<HTMLButtonElement>('btn-done-submit');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'today' | 'zukan' | 'events' | 'record';

interface LogEditing {
  quest: Quest; // 記録の対象（ドロップ・図鑑からの新規、または既存記録の編集）
  fromDrop: boolean;
  drawDate: string | null;
  log: Log | null; // 編集中の既存記録
}

const state = {
  uid: null as string | null,
  quests: [] as CustomQuest[],
  draws: [] as Draw[],
  logs: [] as Log[],
  events: [] as RareEvent[],
  settings: { hidden: [] } as Settings,
  loaded: false,
  tab: 'today' as Tab,
  zukanFilter: 'all' as Category | 'all',
  reveal: false,
  recOrder: 'desc' as 'asc' | 'desc',
  justDrew: false,
  pending: new Set<string>(),
  confirmAction: null as null | (() => Promise<void>),
  unsubscribers: [] as (() => void)[],
  // モーダル
  logEditing: null as LogEditing | null,
  logResult: 'hit' as Result,
  questEditingId: null as string | null,
  questCategory: 'town' as Category,
  questRarity: 'common' as Rarity,
  detailQuestId: null as string | null,
  eventEditingId: null as string | null,
  doneEventId: null as string | null,
};

// ============================================================
// Helpers
// ============================================================
/** 二重送信を防ぎつつ、失敗時はトーストで知らせる */
async function run(key: string, task: () => Promise<void>, errorMessage: string): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await task();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function emptyState(text: string): HTMLElement {
  return textEl('p', 'empty-state', text);
}

function radioChip(label: string, active: boolean, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const b = button(label, `chip${extraClass ? ` ${extraClass}` : ''}${active ? ' is-active' : ''}`, onClick);
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(active));
  return b;
}

function rarityBadge(rarity: Rarity): HTMLElement {
  return textEl('span', `rarity rarity--${rarity}`, rarityOf(rarity).label);
}

function categoryBadge(category: Category): HTMLElement {
  return textEl('span', `cat-badge cat-badge--${category}`, categoryLabel(category));
}

function questHeader(title: string, category: Category, rarity: Rarity): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'quest-head';
  const tags = document.createElement('div');
  tags.className = 'quest-head__tags';
  tags.append(rarityBadge(rarity), categoryBadge(category));
  wrap.append(tags, textEl('p', 'quest-head__title', title));
  return wrap;
}

function questById(id: string): Quest | null {
  return allQuests(state.quests).find((q) => q.id === id) ?? null;
}

function todayDraw(): Draw | null {
  const t = todayKey();
  return state.draws.find((d) => d.date === t) ?? null;
}

function drawOfLog(log: Log): Draw | null {
  return state.draws.find((d) => d.logId === log.id) ?? null;
}

function shortDate(key: string): string {
  return labelOf(key);
}

// ============================================================
// Render: きょう
// ============================================================
function renderToday(): void {
  const today = todayKey();
  todayDateEl.textContent = labelOf(today);

  const lv = levelOf(totalXp(state.logs, state.events));
  todayLevel.textContent = `Lv.${lv.level}`;
  todayTitle.textContent = lv.title;
  const counts = countByQuest(state.logs);
  const pool = activeQuests(state.quests, state.settings);
  todayFound.textContent = `${pool.filter((q) => (counts.get(q.id) ?? 0) > 0).length}/${pool.length}`;
  todayStreak.textContent = `${weekStreak(state.logs, today)}週`;

  renderDropArea();
  renderTodayEvent();

  todayRecent.replaceChildren();
  const recent = state.logs.slice(0, 3);
  if (recent.length === 0) {
    todayRecent.append(emptyState('やってみたドロップがここに並びます'));
  } else {
    recent.forEach((l) => todayRecent.append(logItem(l)));
  }
}

function renderDropArea(): void {
  dropArea.replaceChildren();
  if (!state.loaded) {
    dropArea.append(emptyState('読み込み中…'));
    return;
  }
  const draw = todayDraw();
  const drawing = state.pending.has('draw');

  if (!draw) {
    const card = document.createElement('div');
    card.className = 'drop__chest';
    card.append(
      chestIcon(),
      textEl('p', 'drop__lead', 'ルーティンから一歩だけ外れるお題を、1日1回ひとつ。'),
      textEl('p', 'drop__sub', 'コモン65%・レア28%・エピック7%。まだやったことのないお題ほど出やすくなります。'),
    );
    const b = button(drawing ? '引いています…' : 'きょうのドロップを引く', 'btn btn--primary btn--lg drop__btn', () => void doDraw(false));
    b.disabled = drawing;
    card.append(b);
    dropArea.append(card);
    return;
  }

  const card = document.createElement('div');
  card.className = `drop__card drop__card--${draw.rarity}${state.justDrew ? ' is-new' : ''}${draw.status !== 'drawn' ? ' is-settled' : ''}`;
  card.append(textEl('p', 'drop__label', `${rarityOf(draw.rarity).label}ドロップ！`));
  card.append(questHeader(draw.title, draw.category, draw.rarity));

  const actions = document.createElement('div');
  actions.className = 'drop__actions';
  if (draw.status === 'drawn') {
    const quest = questById(draw.questId) ?? { id: draw.questId, title: draw.title, category: draw.category, rarity: draw.rarity, custom: false };
    actions.append(
      button('やってみた！', 'btn btn--primary', () => openLogModal({ quest, fromDrop: true, drawDate: draw.date, log: null })),
    );
    const skip = button('きょうはパス', 'btn btn--ghost', () => void run('draw-status', () => setDrawStatus(state.uid as string, draw.date, 'skipped'), '更新に失敗しました'));
    skip.disabled = state.pending.has('draw-status');
    actions.append(skip);
    if (!draw.rerolled) {
      const reroll = button('引き直す（1回だけ）', 'btn btn--ghost', () => void doDraw(true));
      reroll.disabled = drawing;
      actions.append(reroll);
    }
    card.append(actions);
    card.append(textEl('p', 'drop__hint', 'やらなくても大丈夫。気が向いたら、きょうのうちに。'));
  } else if (draw.status === 'done') {
    const log = state.logs.find((l) => l.id === draw.logId);
    card.append(textEl('p', 'drop__done', log ? `やってみた！ 結果：${resultLabel(log.result)}（+${logXp(log)}XP）` : 'やってみた！'));
    card.append(textEl('p', 'drop__hint', 'また明日、新しいドロップが引けます。'));
  } else {
    card.append(textEl('p', 'drop__done', 'きょうはパスしました'));
    const undo = button('やっぱりやる', 'btn btn--ghost btn--sm', () => void run('draw-status', () => setDrawStatus(state.uid as string, draw.date, 'drawn'), '更新に失敗しました'));
    undo.disabled = state.pending.has('draw-status');
    actions.append(undo);
    card.append(actions);
  }
  dropArea.append(card);
}

function chestIcon(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'drop__icon';
  // 開発者定義の固定SVG（ユーザー入力は含まない）
  span.innerHTML = '<svg width="72" height="72" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 28 H54 V52 H10 Z"/><path d="M10 28 C10 18 18 14 32 14 C46 14 54 18 54 28"/><path d="M28 28 V36 H36 V28"/><path d="M32 6 V9"/><path d="M20 9 L22 12"/><path d="M44 9 L42 12"/></svg>';
  return span;
}

async function doDraw(reroll: boolean): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const today = todayKey();
  const current = todayDraw();
  if (!reroll && current) return;
  if (reroll && (!current || current.rerolled || current.status !== 'drawn')) return;

  const pool = activeQuests(state.quests, state.settings);
  const yesterday = state.draws.find((d) => d.date === addDays(today, -1));
  const avoid = [current?.questId, yesterday?.questId].filter((v): v is string => !!v);
  const quest = drawQuest(pool, countByQuest(state.logs), avoid);
  if (!quest) {
    showToast('お題がありません。図鑑からお題を追加してください');
    return;
  }
  const ok = await run('draw', () => saveDraw(uid, today, {
    questId: quest.id, title: quest.title, category: quest.category, rarity: quest.rarity, rerolled: reroll,
  }), 'ドロップを引けませんでした。もう一度お試しください');
  if (ok) {
    state.justDrew = true;
    renderAll();
    window.setTimeout(() => { state.justDrew = false; }, 1200);
    track(reroll ? 'drop_reroll' : 'drop_draw', { rarity: quest.rarity });
  }
}

function renderTodayEvent(): void {
  todayEvent.replaceChildren();
  const next = plannedEvents(state.events)[0];
  if (next) {
    todayEvent.append(eventItem(next, true));
    return;
  }
  todayEvent.append(eventNudgeEl());
}

// ============================================================
// Render: 図鑑
// ============================================================
function renderZukan(): void {
  const counts = countByQuest(state.logs);
  const pool = activeQuests(state.quests, state.settings);

  zukanProgress.replaceChildren();
  const found = pool.filter((q) => (counts.get(q.id) ?? 0) > 0).length;
  const pct = pool.length ? Math.round((found / pool.length) * 100) : 0;
  const head = document.createElement('div');
  head.className = 'zukan-progress__head';
  head.append(textEl('span', 'zukan-progress__num', `${found} / ${pool.length}`), textEl('span', 'zukan-progress__pct', `${pct}%`));
  const bar = document.createElement('div');
  bar.className = 'zukan-progress__bar';
  const fill = document.createElement('span');
  fill.style.width = `${pct}%`;
  bar.append(fill);
  const rarityRow = document.createElement('div');
  rarityRow.className = 'zukan-progress__rarities';
  discoveryByRarity(pool, counts).forEach((r) => {
    const item = document.createElement('span');
    item.className = 'zukan-progress__rarity';
    item.append(rarityBadge(r.rarity), textEl('span', '', `${r.found}/${r.total}`));
    rarityRow.append(item);
  });
  zukanProgress.append(head, bar, rarityRow);

  zukanChips.replaceChildren(
    radioChip('すべて', state.zukanFilter === 'all', () => { state.zukanFilter = 'all'; renderZukan(); }),
    ...CATEGORIES.map((c) => radioChip(c.label, state.zukanFilter === c.key, () => { state.zukanFilter = c.key; renderZukan(); })),
  );

  const filtered = pool.filter((q) => state.zukanFilter === 'all' || q.category === state.zukanFilter);
  const order: Record<Rarity, number> = { epic: 0, rare: 1, common: 2 };
  filtered.sort((a, b) => {
    const fa = (counts.get(a.id) ?? 0) > 0 ? 0 : 1;
    const fb = (counts.get(b.id) ?? 0) > 0 ? 0 : 1;
    return fa - fb || order[a.rarity] - order[b.rarity];
  });

  zukanList.replaceChildren();
  if (filtered.length === 0) {
    zukanList.append(emptyState('このカテゴリのお題はまだありません'));
  }
  filtered.forEach((q) => zukanList.append(zukanItem(q, counts.get(q.id) ?? 0)));

  const hidden = allQuests(state.quests).filter((q) => state.settings.hidden.includes(q.id));
  hiddenFold.classList.toggle('hidden', hidden.length === 0);
  hiddenCount.textContent = String(hidden.length);
  hiddenList.replaceChildren(...hidden.map((q) => zukanItem(q, counts.get(q.id) ?? 0, true)));
}

function zukanItem(q: Quest, count: number, isHidden = false): HTMLElement {
  const found = count > 0;
  // 自分で追加したお題は最初から見える。プリセットは出るまで「？？？」
  const veiled = !found && !q.custom && !state.reveal && !isHidden;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `zukan-item zukan-item--${q.rarity}${found ? ' is-found' : ''}${veiled ? ' is-veiled' : ''}`;
  b.dataset.track = 'zukan_item';
  const top = document.createElement('div');
  top.className = 'zukan-item__tags';
  top.append(rarityBadge(q.rarity), categoryBadge(q.category));
  if (q.custom) top.append(textEl('span', 'mine-badge', 'じぶん'));
  b.append(top, textEl('span', 'zukan-item__title', veiled ? '？？？' : q.title));
  b.append(textEl('span', 'zukan-item__count', found ? `${count}回やってみた` : '未発見'));
  b.addEventListener('click', () => openDetail(q.id));
  return b;
}

// ============================================================
// Render: レアイベント
// ============================================================
function eventNudgeEl(): HTMLElement {
  const done = doneEvents(state.events)[0];
  const box = document.createElement('div');
  box.className = 'nudge';
  let text = 'まだレアイベントの予定がありません。半年に1回、ルーティンの外にある予定を入れてみませんか？';
  if (done?.doneDate) {
    const days = daysBetween(done.doneDate, todayKey());
    text = days >= EVENT_INTERVAL_DAYS
      ? `前回のレアイベントから${days}日。そろそろ次の予定を入れる頃です。`
      : `前回のレアイベントから${days}日。次の予定も先に枠だけ入れておきましょう。`;
  }
  box.append(textEl('p', 'nudge__text', text));
  box.append(button('予定を入れる', 'btn btn--primary btn--sm', () => openEventModal(null)));
  return box;
}

function eventItem(e: RareEvent, compact = false): HTMLElement {
  const item = document.createElement('div');
  item.className = `event-item${e.status === 'done' ? ' is-done' : ''}`;
  const main = document.createElement('div');
  main.className = 'event-item__main';
  main.append(textEl('p', 'event-item__title', e.title));

  const today = todayKey();
  if (e.status === 'done') {
    main.append(textEl('p', 'event-item__meta', `${e.doneDate ? shortDate(e.doneDate) : ''}に行ってきた（+${XP_EVENT}XP）`));
    if (e.note.trim()) {
      const memo = document.createElement('div');
      memo.className = 'event-item__note';
      renderMemoView(memo, e.note, { clampLines: 3 });
      main.append(memo);
    }
  } else if (e.date) {
    const diff = daysBetween(today, e.date);
    const when = diff > 0 ? `あと${diff}日` : diff === 0 ? 'きょう！' : `${-diff}日すぎています`;
    main.append(textEl('p', 'event-item__meta', `${shortDate(e.date)}・${when}`));
  } else {
    main.append(textEl('p', 'event-item__meta', '日付未定'));
  }

  const count = document.createElement('div');
  count.className = 'event-item__count';
  if (e.status === 'planned' && e.date) {
    const diff = daysBetween(today, e.date);
    if (diff >= 0) {
      count.append(textEl('span', 'event-item__days', String(diff)), textEl('span', 'event-item__unit', diff === 0 ? 'きょう' : '日'));
    }
  }

  const actions = document.createElement('div');
  actions.className = 'event-item__actions';
  if (e.status === 'planned') {
    actions.append(button('行ってきた', 'btn btn--primary btn--sm', () => openDoneModal(e)));
    if (!compact) actions.append(button('編集', 'btn btn--ghost btn--sm', () => openEventModal(e)));
  } else {
    const reopen = button('予定に戻す', 'btn btn--ghost btn--sm', () => void run(`event-${e.id}`, () => reopenEvent(state.uid as string, e.id), '更新に失敗しました'));
    reopen.disabled = state.pending.has(`event-${e.id}`);
    actions.append(reopen);
    actions.append(button('削除', 'btn btn--ghost btn--sm is-danger', () => askConfirm(
      'このレアイベントを削除しますか？', '記録とXPも消えます。この操作は元に戻せません。', '削除する',
      async () => { await run(`event-${e.id}`, () => deleteEvent(state.uid as string, e.id), '削除に失敗しました'); },
    )));
  }

  const row = document.createElement('div');
  row.className = 'event-item__row';
  row.append(main);
  if (count.childElementCount) row.append(count);
  item.append(row, actions);
  return item;
}

function renderEvents(): void {
  const planned = plannedEvents(state.events);
  const done = doneEvents(state.events);
  eventNudge.replaceChildren();
  if (planned.length === 0) eventNudge.append(eventNudgeEl());
  eventList.replaceChildren(...planned.map((e) => eventItem(e)));
  eventDoneFold.classList.toggle('hidden', done.length === 0);
  eventDoneCount.textContent = String(done.length);
  eventDoneList.replaceChildren(...done.map((e) => eventItem(e)));
}

// ============================================================
// Render: 記録
// ============================================================
function logItem(l: Log, withEdit = false): HTMLElement {
  const item = document.createElement('div');
  item.className = `log-item log-item--${l.result}`;
  const head = document.createElement('div');
  head.className = 'log-item__head';
  head.append(rarityBadge(l.rarity), textEl('span', 'log-item__date', shortDate(l.date)));
  if (l.fromDrop) head.append(textEl('span', 'log-item__drop', 'ドロップ'));
  head.append(textEl('span', `result result--${l.result}`, resultLabel(l.result)));
  item.append(head, textEl('p', 'log-item__title', l.title));
  if (l.note.trim()) {
    const memo = document.createElement('div');
    memo.className = 'log-item__note';
    renderMemoView(memo, l.note, { clampLines: 3 });
    item.append(memo);
  }
  if (withEdit) {
    const foot = document.createElement('div');
    foot.className = 'log-item__foot';
    foot.append(textEl('span', 'log-item__xp', `+${logXp(l)}XP`));
    foot.append(button('編集', 'btn btn--ghost btn--sm', () => {
      const quest = questById(l.questId) ?? { id: l.questId, title: l.title, category: l.category, rarity: l.rarity, custom: false };
      openLogModal({ quest, fromDrop: l.fromDrop, drawDate: null, log: l });
    }));
    item.append(foot);
  }
  return item;
}

function renderRecord(): void {
  const lv = levelOf(totalXp(state.logs, state.events));
  recLevel.textContent = `Lv.${lv.level}`;
  recTitle.textContent = lv.title;
  recFill.style.width = `${Math.round((lv.current / lv.need) * 100)}%`;
  recNext.textContent = `次のレベルまで あと${lv.need - lv.current}XP`;

  recTries.textContent = String(state.logs.length);
  const rate = hitRate(state.logs);
  recHit.textContent = rate === null ? '-' : `${rate}%`;
  recEvents.textContent = String(doneEvents(state.events).length);

  recCats.replaceChildren();
  const max = Math.max(1, ...CATEGORIES.map((c) => state.logs.filter((l) => l.category === c.key).length));
  CATEGORIES.forEach((c) => {
    const n = state.logs.filter((l) => l.category === c.key).length;
    const row = document.createElement('div');
    row.className = 'cat-bars__row';
    const bar = document.createElement('div');
    bar.className = 'cat-bars__bar';
    const fill = document.createElement('span');
    fill.className = `cat-bars__fill cat-bars__fill--${c.key}`;
    fill.style.width = `${Math.round((n / max) * 100)}%`;
    bar.append(fill);
    row.append(textEl('span', 'cat-bars__label', c.label), bar, textEl('span', 'cat-bars__num', `${n}回`));
    recCats.append(row);
  });

  renderCompare();
  renderTimeline();
}

/** はじめた頃と今：最初の数回と最近の数回を同じ回数でくらべる */
function renderCompare(): void {
  recCompare.replaceChildren();
  const cmp = compareStartNow(state.logs);
  if (!cmp) {
    recCompare.append(emptyState(state.logs.length === 0
      ? 'やってみた記録が2つ以上になると、はじめた頃と今をくらべられます'
      : 'あと1回やってみると、はじめた頃と今をくらべられます'));
    return;
  }
  const { start, now } = cmp;
  const first = start.from;
  const days = daysBetween(first, todayKey()) + 1;
  const head = document.createElement('div');
  head.className = 'compare__head';
  head.append(
    textEl('p', 'compare__since', `${shortDate(first)}にはじめて ${days}日目`),
    textEl('p', 'compare__basis', `最初の${start.count}回 と 最近の${now.count}回 をくらべています`),
  );

  const table = document.createElement('div');
  table.className = 'compare__table';
  const cols = document.createElement('div');
  cols.className = 'compare__row compare__row--head';
  cols.append(textEl('span', 'compare__label', ''), textEl('span', 'compare__col', 'はじめた頃'), textEl('span', 'compare__col compare__col--now', '今'));
  table.append(cols);

  const metric = (label: string, a: number, b: number, unit: string): void => {
    const row = document.createElement('div');
    row.className = 'compare__row';
    const diff = b - a;
    const nowCell = document.createElement('span');
    nowCell.className = 'compare__value compare__value--now';
    nowCell.append(`${b}${unit}`);
    if (diff !== 0) {
      nowCell.append(textEl('span', `compare__diff compare__diff--${diff > 0 ? 'up' : 'down'}`, `${diff > 0 ? '+' : ''}${diff}`));
    }
    row.append(textEl('span', 'compare__label', label), textEl('span', 'compare__value', `${a}${unit}`), nowCell);
    table.append(row);
  };
  metric('当たり率', start.hitRate, now.hitRate, '%');
  metric('レア以上の割合', start.rareRate, now.rareRate, '%');
  metric('試したカテゴリ', start.categories, now.categories, '種');
  metric('ひとこと率', start.noteRate, now.noteRate, '%');

  const timeline = buildTimeline(state.logs, state.events);
  const lvNow = levelOf(totalXp(state.logs, state.events));
  const found = new Set(state.logs.map((l) => l.questId)).size;
  const sum = document.createElement('div');
  sum.className = 'compare__summary';
  sum.append(
    summaryChip('レベル', `Lv.1 → Lv.${lvNow.level}`),
    summaryChip('行動の数', `${timeline.length}回`),
    summaryChip('出会ったお題', `${found}種`),
  );
  recCompare.append(head, table, sum);
}

function summaryChip(label: string, value: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'compare__chip';
  el.append(textEl('span', 'compare__chip-label', label), textEl('span', 'compare__chip-value', value));
  return el;
}

/** これまでの行動：やってみた記録と行ってきたレアイベントを月ごとに並べる */
function renderTimeline(): void {
  const entries = buildTimeline(state.logs, state.events);
  recCount.textContent = entries.length ? `${entries.length}回` : '';
  orderButtons.forEach((b) => {
    const active = b.dataset.order === state.recOrder;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-checked', String(active));
  });
  recList.replaceChildren();
  if (entries.length === 0) {
    recList.append(emptyState('まだ記録がありません。きょうのドロップを引いてみましょう'));
    return;
  }
  const ordered = state.recOrder === 'asc' ? entries : [...entries].reverse();
  let month = '';
  let group: HTMLElement | null = null;
  ordered.forEach((e) => {
    const m = e.date.slice(0, 7);
    if (m !== month || !group) {
      month = m;
      const [y, mo] = m.split('-').map(Number);
      const n = entries.filter((x) => x.date.startsWith(m)).length;
      const head = document.createElement('div');
      head.className = 'timeline__month';
      head.append(textEl('span', 'timeline__month-label', `${y}年${mo}月`), textEl('span', 'timeline__month-count', `${n}回`));
      group = document.createElement('div');
      group.className = 'timeline__group log-list';
      recList.append(head, group);
    }
    group.append(timelineItem(e));
  });
}

function timelineItem(e: TimelineEntry): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'timeline__item';
  const meta = document.createElement('div');
  meta.className = 'timeline__meta';
  meta.append(textEl('span', 'timeline__no', `No.${e.no}`));
  if (e.no === 1) meta.append(textEl('span', 'timeline__tag', 'はじめの一歩'));
  if (e.levelUp) meta.append(textEl('span', 'timeline__tag timeline__tag--level', `Lv.${e.levelUp}にアップ`));
  wrap.append(meta);
  if (e.kind === 'log') {
    wrap.append(logItem(e.log, true));
  } else {
    const item = document.createElement('div');
    item.className = 'log-item log-item--event';
    const head = document.createElement('div');
    head.className = 'log-item__head';
    head.append(textEl('span', 'rarity rarity--event', 'レアイベント'), textEl('span', 'log-item__date', shortDate(e.date)));
    item.append(head, textEl('p', 'log-item__title', e.event.title));
    if (e.event.note.trim()) {
      const memo = document.createElement('div');
      memo.className = 'log-item__note';
      renderMemoView(memo, e.event.note, { clampLines: 3 });
      item.append(memo);
    }
    const foot = document.createElement('div');
    foot.className = 'log-item__foot';
    foot.append(textEl('span', 'log-item__xp', `+${XP_EVENT}XP`));
    item.append(foot);
    wrap.append(item);
  }
  return wrap;
}

function renderFab(): void {
  btnFab.classList.toggle('hidden', state.tab !== 'zukan' && state.tab !== 'events');
  btnFab.setAttribute('aria-label', state.tab === 'events' ? 'レアイベントを予定に入れる' : 'お題を追加');
}

function renderAll(): void {
  if (!state.uid) return;
  renderToday();
  renderZukan();
  renderEvents();
  renderRecord();
  renderFab();
  if (state.detailQuestId && detailOverlay.classList.contains('is-open')) renderDetail();
}

function switchTab(tab: Tab): void {
  state.tab = tab;
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  renderFab();
  window.scrollTo({ top: 0 });
}

// ============================================================
// やってみた記録モーダル
// ============================================================
function renderLogResults(): void {
  logResults.replaceChildren(...RESULTS.map((r) => radioChip(r.label, state.logResult === r.key, () => {
    state.logResult = r.key;
    renderLogResults();
  }, `seg seg--${r.key}`)));
}

function openLogModal(editing: LogEditing): void {
  state.logEditing = editing;
  const { quest, log } = editing;
  logModalTitle.textContent = log ? '記録を編集' : 'やってみた！';
  logQuest.replaceChildren(questHeader(log ? log.title : quest.title, log ? log.category : quest.category, log ? log.rarity : quest.rarity));
  inputLogDate.value = log ? log.date : (editing.drawDate ?? todayKey());
  inputLogDate.max = todayKey();
  state.logResult = log ? log.result : 'hit';
  renderLogResults();
  inputLogNote.value = log ? log.note : '';
  autoGrow(inputLogNote);
  inputLogNote.dispatchEvent(new Event('input'));
  btnLogDelete.classList.toggle('hidden', !log);
  btnLogSubmit.textContent = log ? '保存する' : '記録する';
  openOverlay(logOverlay);
}

function closeLogModal(): void {
  state.logEditing = null;
  closeOverlay(logOverlay);
}

logForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editing = state.logEditing;
  const uid = state.uid;
  if (!editing || !uid) return;
  const date = inputLogDate.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showToast('やった日を選んでください');
    return;
  }
  if (date > todayKey()) {
    showToast('未来の日付は選べません');
    return;
  }
  const note = inputLogNote.value;
  btnLogSubmit.disabled = true;
  const { quest, log } = editing;
  const ok = log
    ? await run('log', () => updateLog(uid, log.id, state.logResult, note, date), '保存に失敗しました')
    : await run('log', () => createLog(uid, {
      date, questId: quest.id, title: quest.title, category: quest.category, rarity: quest.rarity,
      result: state.logResult, note, fromDrop: editing.fromDrop,
    }, editing.drawDate), '記録に失敗しました');
  btnLogSubmit.disabled = false;
  if (!ok) return;
  if (!log) {
    const xp = logXp({ id: '', date, questId: quest.id, title: quest.title, category: quest.category, rarity: quest.rarity, result: state.logResult, note, fromDrop: editing.fromDrop, createdAt: 0 });
    showToast(`記録しました！ +${xp}XP`);
    track('log_create', { rarity: quest.rarity, result: state.logResult, from: editing.fromDrop ? 'drop' : 'zukan' });
  } else {
    showToast('保存しました');
  }
  closeLogModal();
});

btnLogDelete.addEventListener('click', () => {
  const log = state.logEditing?.log;
  const uid = state.uid;
  if (!log || !uid) return;
  askConfirm('この記録を削除しますか？', 'XPも減ります。この操作は元に戻せません。', '削除する', async () => {
    const draw = drawOfLog(log);
    const ok = await run('log', () => deleteLog(uid, log.id, draw ? draw.date : null), '削除に失敗しました');
    if (ok) {
      closeLogModal();
      showToast('削除しました');
      track('log_delete');
    }
  });
});

// ============================================================
// お題モーダル（追加・編集）
// ============================================================
function renderQuestChoices(): void {
  questCats.replaceChildren(...CATEGORIES.map((c) => radioChip(c.label, state.questCategory === c.key, () => {
    state.questCategory = c.key;
    renderQuestChoices();
  })));
  questRarities.replaceChildren(...RARITIES.map((r) => radioChip(r.label, state.questRarity === r.key, () => {
    state.questRarity = r.key;
    renderQuestChoices();
  }, `seg seg--${r.key}`)));
}

function openQuestModal(quest: CustomQuest | null): void {
  state.questEditingId = quest ? quest.id : null;
  questModalTitle.textContent = quest ? 'お題を編集' : 'お題を追加';
  inputQuestTitle.value = quest ? quest.title : '';
  state.questCategory = quest ? quest.category : (state.zukanFilter === 'all' ? 'town' : state.zukanFilter);
  state.questRarity = quest ? quest.rarity : 'common';
  renderQuestChoices();
  btnQuestDelete.classList.toggle('hidden', !quest);
  btnQuestSubmit.textContent = quest ? '保存する' : '追加する';
  openOverlay(questOverlay);
  window.setTimeout(() => inputQuestTitle.focus(), 50);
}

questForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const title = inputQuestTitle.value.trim();
  if (!title) {
    showToast('お題を入力してください');
    return;
  }
  if (title.length > MAX_TITLE) {
    showToast(`お題は${MAX_TITLE}文字以内で入力してください`);
    return;
  }
  const input: QuestInput = { title, category: state.questCategory, rarity: state.questRarity };
  const editingId = state.questEditingId;
  btnQuestSubmit.disabled = true;
  const ok = await run('quest', () => (editingId ? updateQuest(uid, editingId, input) : createQuest(uid, input)), '保存に失敗しました');
  btnQuestSubmit.disabled = false;
  if (!ok) return;
  closeOverlay(questOverlay);
  showToast(editingId ? '保存しました' : 'お題を追加しました。ドロップに出るようになります');
  if (!editingId) track('quest_create', { rarity: input.rarity });
});

btnQuestDelete.addEventListener('click', () => {
  const id = state.questEditingId;
  const uid = state.uid;
  if (!id || !uid) return;
  askConfirm('このお題を削除しますか？', 'ドロップに出なくなります。これまでの記録は残ります。この操作は元に戻せません。', '削除する', async () => {
    const ok = await run('quest', () => deleteQuest(uid, id), '削除に失敗しました');
    if (ok) {
      closeOverlay(questOverlay);
      closeOverlay(detailOverlay);
      state.detailQuestId = null;
      showToast('削除しました');
      track('quest_delete');
    }
  });
});

// ============================================================
// お題の詳細
// ============================================================
function openDetail(id: string): void {
  state.detailQuestId = id;
  renderDetail();
  openOverlay(detailOverlay);
}

function renderDetail(): void {
  const id = state.detailQuestId;
  const quest = id ? questById(id) : null;
  if (!quest) {
    closeOverlay(detailOverlay);
    return;
  }
  const logs = state.logs.filter((l) => l.questId === quest.id);
  const isHidden = state.settings.hidden.includes(quest.id);
  const veiled = logs.length === 0 && !quest.custom && !state.reveal && !isHidden;

  detailQuest.replaceChildren(questHeader(veiled ? '？？？（まだ出ていないお題）' : quest.title, quest.category, quest.rarity));
  detailLogs.replaceChildren();
  if (logs.length === 0) {
    detailLogs.append(emptyState(veiled ? 'ドロップで出会えるまでのお楽しみ。' : 'まだやってみた記録はありません'));
  } else {
    logs.forEach((l) => detailLogs.append(logItem(l)));
  }

  detailActions.replaceChildren();
  if (!veiled) {
    detailActions.append(button('これをやってみた', 'btn btn--primary btn--sm', () => {
      closeOverlay(detailOverlay);
      openLogModal({ quest, fromDrop: false, drawDate: null, log: null });
    }));
  }
  if (quest.custom) {
    const custom = state.quests.find((c) => c.id === quest.id) ?? null;
    detailActions.append(button('編集', 'btn btn--ghost btn--sm', () => openQuestModal(custom)));
  } else {
    const toggle = button(isHidden ? 'ドロップに戻す' : 'このお題は出さない', 'btn btn--ghost btn--sm', () => {
      const uid = state.uid;
      if (!uid) return;
      const next = isHidden
        ? state.settings.hidden.filter((h) => h !== quest.id)
        : [...state.settings.hidden, quest.id];
      void run('hidden', () => saveHidden(uid, next), '更新に失敗しました').then((ok) => {
        if (ok) showToast(isHidden ? 'ドロップに戻しました' : 'このお題はドロップに出なくなります');
      });
    });
    toggle.disabled = state.pending.has('hidden');
    detailActions.append(toggle);
  }
}

// ============================================================
// レアイベントモーダル
// ============================================================
function openEventModal(e: RareEvent | null): void {
  state.eventEditingId = e ? e.id : null;
  eventModalTitle.textContent = e ? 'レアイベントを編集' : 'レアイベントを予定に入れる';
  inputEventTitle.value = e ? e.title : '';
  inputEventDate.value = e ? e.date : '';
  inputEventDate.min = e?.date && e.date < todayKey() ? e.date : todayKey();
  btnEventDelete.classList.toggle('hidden', !e);
  btnEventSubmit.textContent = e ? '保存する' : '予定に入れる';
  eventExamples.replaceChildren(...EVENT_EXAMPLES.map((ex) => button(ex, 'chip', () => {
    inputEventTitle.value = ex;
    inputEventTitle.focus();
  })));
  openOverlay(eventOverlay);
  window.setTimeout(() => inputEventTitle.focus(), 50);
}

eventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const title = inputEventTitle.value.trim();
  if (!title) {
    showToast('なにをするかを入力してください');
    return;
  }
  const date = inputEventDate.value;
  const editingId = state.eventEditingId;
  btnEventSubmit.disabled = true;
  const ok = await run('event', () => (editingId ? updateEventPlan(uid, editingId, title, date) : createEvent(uid, title, date)), '保存に失敗しました');
  btnEventSubmit.disabled = false;
  if (!ok) return;
  closeOverlay(eventOverlay);
  showToast(editingId ? '保存しました' : 'レアイベントを予定に入れました');
  if (!editingId) track('event_create');
});

btnEventDelete.addEventListener('click', () => {
  const id = state.eventEditingId;
  const uid = state.uid;
  if (!id || !uid) return;
  askConfirm('この予定を削除しますか？', 'この操作は元に戻せません。', '削除する', async () => {
    const ok = await run('event', () => deleteEvent(uid, id), '削除に失敗しました');
    if (ok) {
      closeOverlay(eventOverlay);
      showToast('削除しました');
      track('event_delete');
    }
  });
});

function openDoneModal(e: RareEvent): void {
  state.doneEventId = e.id;
  doneEvent.replaceChildren(textEl('p', 'quest-head__title', e.title));
  const today = todayKey();
  inputDoneDate.value = e.date && e.date <= today ? e.date : today;
  inputDoneDate.max = today;
  inputDoneNote.value = '';
  autoGrow(inputDoneNote);
  inputDoneNote.dispatchEvent(new Event('input'));
  openOverlay(doneOverlay);
}

doneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  const id = state.doneEventId;
  if (!uid || !id) return;
  const date = inputDoneDate.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey()) {
    showToast('行った日を正しく選んでください');
    return;
  }
  btnDoneSubmit.disabled = true;
  const ok = await run('done', () => completeEvent(uid, id, date, inputDoneNote.value), '記録に失敗しました');
  btnDoneSubmit.disabled = false;
  if (!ok) return;
  closeOverlay(doneOverlay);
  state.doneEventId = null;
  showToast(`おかえりなさい！ +${XP_EVENT}XP`);
  track('event_done');
});

// ============================================================
// 確認ダイアログ
// ============================================================
btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

// ============================================================
// フィードバック
// ============================================================
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// ============================================================
// モーダルの開閉
// ============================================================
$('btn-log-close').addEventListener('click', closeLogModal);
$('btn-log-cancel').addEventListener('click', closeLogModal);
$('btn-quest-close').addEventListener('click', () => closeOverlay(questOverlay));
$('btn-quest-cancel').addEventListener('click', () => closeOverlay(questOverlay));
$('btn-detail-close').addEventListener('click', () => { state.detailQuestId = null; closeOverlay(detailOverlay); });
$('btn-event-close').addEventListener('click', () => closeOverlay(eventOverlay));
$('btn-event-cancel').addEventListener('click', () => closeOverlay(eventOverlay));
$('btn-done-close').addEventListener('click', () => closeOverlay(doneOverlay));
$('btn-done-cancel').addEventListener('click', () => closeOverlay(doneOverlay));

// 背景クリックで閉じる（確認ダイアログ・入力中のフォームは誤操作防止のため除外）
[detailOverlay, feedbackOverlay].forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (overlay === detailOverlay) state.detailQuestId = null;
    closeOverlay(overlay);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmOverlay.classList.contains('is-open')) {
    state.confirmAction = null;
    closeOverlay(confirmOverlay);
    return;
  }
  closeLogModal();
  [questOverlay, detailOverlay, eventOverlay, doneOverlay, feedbackOverlay].forEach(closeOverlay);
  state.detailQuestId = null;
});

// ============================================================
// Tabs / buttons
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => switchTab((b.dataset.tab as Tab) || 'today')));
orderButtons.forEach((b) => b.addEventListener('click', () => {
  const order = b.dataset.order === 'asc' ? 'asc' : 'desc';
  if (order === state.recOrder) return;
  state.recOrder = order;
  track('timeline_order', { order });
  renderTimeline();
}));

btnFab.addEventListener('click', () => {
  if (state.tab === 'events') openEventModal(null);
  else openQuestModal(null);
});
$('btn-add-quest').addEventListener('click', () => openQuestModal(null));
$('btn-add-event').addEventListener('click', () => openEventModal(null));

toggleReveal.addEventListener('change', () => {
  state.reveal = toggleReveal.checked;
  renderZukan();
});

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
    track('login');
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    state.uid = null;
    state.quests = [];
    state.draws = [];
    state.logs = [];
    state.events = [];
    state.settings = { hidden: [] };
    state.loaded = false;
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  renderAll();

  const onError = (err: Error): void => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  };
  // ドロップの判定に必要な4つ（お題・ドロップ・記録・設定）がそろったら「読み込み完了」
  const waiting = new Set(['quests', 'draws', 'logs', 'settings']);
  const loadedOne = (key: string): void => {
    if (!waiting.delete(key)) return;
    if (waiting.size === 0) state.loaded = true;
  };
  state.unsubscribers.push(subscribeQuests(user.uid, (items) => { state.quests = items; loadedOne('quests'); renderAll(); }, onError));
  state.unsubscribers.push(subscribeDraws(user.uid, (items) => { state.draws = items; loadedOne('draws'); renderAll(); }, onError));
  state.unsubscribers.push(subscribeLogs(user.uid, (items) => { state.logs = items; loadedOne('logs'); renderAll(); }, onError));
  state.unsubscribers.push(subscribeSettings(user.uid, (s) => { state.settings = s; loadedOne('settings'); renderAll(); }, onError));
  state.unsubscribers.push(subscribeEvents(user.uid, (items) => { state.events = items; renderAll(); }, onError));
});

// 日付が変わったら「きょう」の表示を更新する
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    renderAll();
  }
}, 60 * 1000);

initTextareas();

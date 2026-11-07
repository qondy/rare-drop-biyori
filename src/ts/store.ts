import {
  collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { CustomQuest, Draw, Log, RareEvent, Settings, Category, Rarity, Result, DrawStatus, EventStatus } from './types';
import { CATEGORY_KEYS, RARITY_KEYS, RESULT_KEYS } from './options';

const DRAW_STATUSES: DrawStatus[] = ['drawn', 'done', 'skipped'];
const EVENT_STATUSES: EventStatus[] = ['planned', 'done'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_TITLE = 60;
export const MAX_NOTE = 500;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const dateStr = (v: unknown): string => (typeof v === 'string' && DATE_RE.test(v) ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());
const pick = <T extends string>(v: unknown, list: T[], fallback: T): T =>
  (list.includes(v as T) ? v as T : fallback);
const clip = (s: string, max: number): string => s.trim().slice(0, max);

const questsCol = (uid: string) => collection(db, 'users', uid, 'quests');
const questDoc = (uid: string, id: string) => doc(db, 'users', uid, 'quests', id);
const drawsCol = (uid: string) => collection(db, 'users', uid, 'draws');
const drawDoc = (uid: string, date: string) => doc(db, 'users', uid, 'draws', date);
const logsCol = (uid: string) => collection(db, 'users', uid, 'logs');
const logDoc = (uid: string, id: string) => doc(db, 'users', uid, 'logs', id);
const eventsCol = (uid: string) => collection(db, 'users', uid, 'events');
const eventDoc = (uid: string, id: string) => doc(db, 'users', uid, 'events', id);
const settingsDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'settings');

type OnError = (err: Error) => void;

// ============================================================
// 購読
// ============================================================
export function subscribeQuests(uid: string, onData: (items: CustomQuest[]) => void, onError: OnError): () => void {
  return onSnapshot(questsCol(uid), (snap) => {
    const list: CustomQuest[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const title = str(data.title).trim();
      if (!title) return;
      list.push({
        id: d.id,
        title,
        category: pick(data.category, CATEGORY_KEYS, 'town'),
        rarity: pick(data.rarity, RARITY_KEYS, 'common'),
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => a.createdAt - b.createdAt);
    onData(list);
  }, onError);
}

export function subscribeDraws(uid: string, onData: (items: Draw[]) => void, onError: OnError): () => void {
  return onSnapshot(drawsCol(uid), (snap) => {
    const list: Draw[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (!DATE_RE.test(d.id) || !str(data.questId)) return;
      list.push({
        date: d.id,
        questId: str(data.questId),
        title: str(data.title),
        category: pick(data.category, CATEGORY_KEYS, 'town'),
        rarity: pick(data.rarity, RARITY_KEYS, 'common'),
        rerolled: data.rerolled === true,
        status: pick(data.status, DRAW_STATUSES, 'drawn'),
        logId: str(data.logId),
      });
    });
    list.sort((a, b) => b.date.localeCompare(a.date));
    onData(list);
  }, onError);
}

export function subscribeLogs(uid: string, onData: (items: Log[]) => void, onError: OnError): () => void {
  return onSnapshot(logsCol(uid), (snap) => {
    const list: Log[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const date = dateStr(data.date);
      if (!date || !str(data.questId)) return;
      list.push({
        id: d.id,
        date,
        questId: str(data.questId),
        title: str(data.title),
        category: pick(data.category, CATEGORY_KEYS, 'town'),
        rarity: pick(data.rarity, RARITY_KEYS, 'common'),
        result: pick(data.result, RESULT_KEYS, 'normal'),
        note: str(data.note),
        fromDrop: data.fromDrop === true,
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export function subscribeEvents(uid: string, onData: (items: RareEvent[]) => void, onError: OnError): () => void {
  return onSnapshot(eventsCol(uid), (snap) => {
    const list: RareEvent[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const title = str(data.title).trim();
      if (!title) return;
      list.push({
        id: d.id,
        title,
        date: dateStr(data.date),
        status: pick(data.status, EVENT_STATUSES, 'planned'),
        note: str(data.note),
        doneDate: dateStr(data.doneDate),
        createdAt: millis(data.createdAt),
      });
    });
    onData(list);
  }, onError);
}

export function subscribeSettings(uid: string, onData: (s: Settings) => void, onError: OnError): () => void {
  return onSnapshot(settingsDoc(uid), (snap) => {
    const data = snap.data() ?? {};
    const hidden = Array.isArray(data.hidden)
      ? (data.hidden as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    onData({ hidden });
  }, onError);
}

// ============================================================
// お題
// ============================================================
export interface QuestInput {
  title: string;
  category: Category;
  rarity: Rarity;
}

export async function createQuest(uid: string, input: QuestInput): Promise<void> {
  await addDoc(questsCol(uid), {
    title: clip(input.title, MAX_TITLE),
    category: input.category,
    rarity: input.rarity,
    createdAt: serverTimestamp(),
  });
}

export async function updateQuest(uid: string, id: string, input: QuestInput): Promise<void> {
  await updateDoc(questDoc(uid, id), {
    title: clip(input.title, MAX_TITLE),
    category: input.category,
    rarity: input.rarity,
  });
}

export async function deleteQuest(uid: string, id: string): Promise<void> {
  await deleteDoc(questDoc(uid, id));
}

export async function saveHidden(uid: string, hidden: string[]): Promise<void> {
  await setDoc(settingsDoc(uid), { hidden }, { merge: true });
}

// ============================================================
// ドロップ
// ============================================================
export interface DrawInput {
  questId: string;
  title: string;
  category: Category;
  rarity: Rarity;
  rerolled: boolean;
}

export async function saveDraw(uid: string, date: string, input: DrawInput): Promise<void> {
  await setDoc(drawDoc(uid, date), {
    questId: input.questId,
    title: clip(input.title, MAX_TITLE),
    category: input.category,
    rarity: input.rarity,
    rerolled: input.rerolled,
    status: 'drawn',
    logId: '',
    updatedAt: serverTimestamp(),
  });
}

export async function setDrawStatus(uid: string, date: string, status: DrawStatus): Promise<void> {
  await updateDoc(drawDoc(uid, date), { status, updatedAt: serverTimestamp() });
}

// ============================================================
// やってみた記録
// ============================================================
export interface LogInput {
  date: string;
  questId: string;
  title: string;
  category: Category;
  rarity: Rarity;
  result: Result;
  note: string;
  fromDrop: boolean;
}

const logData = (input: LogInput) => ({
  date: input.date,
  questId: input.questId,
  title: clip(input.title, MAX_TITLE),
  category: input.category,
  rarity: input.rarity,
  result: input.result,
  note: clip(input.note, MAX_NOTE),
  fromDrop: input.fromDrop,
});

/** 記録を作る。ドロップから来た場合は、その日のドロップも「やってみた」にする（1回の書き込みで） */
export async function createLog(uid: string, input: LogInput, drawDate: string | null): Promise<void> {
  const batch = writeBatch(db);
  const ref = doc(logsCol(uid));
  batch.set(ref, { ...logData(input), createdAt: serverTimestamp() });
  if (drawDate) {
    batch.update(drawDoc(uid, drawDate), { status: 'done', logId: ref.id, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

export async function updateLog(uid: string, id: string, result: Result, note: string, date: string): Promise<void> {
  await updateDoc(logDoc(uid, id), { result, note: clip(note, MAX_NOTE), date });
}

/** 記録を消す。ドロップと紐づいていれば、そのドロップは「引いた」状態に戻す */
export async function deleteLog(uid: string, id: string, drawDate: string | null): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(logDoc(uid, id));
  if (drawDate) {
    batch.update(drawDoc(uid, drawDate), { status: 'drawn', logId: '', updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

// ============================================================
// レアイベント
// ============================================================
export async function createEvent(uid: string, title: string, date: string): Promise<void> {
  await addDoc(eventsCol(uid), {
    title: clip(title, MAX_TITLE),
    date: DATE_RE.test(date) ? date : '',
    status: 'planned',
    note: '',
    doneDate: '',
    createdAt: serverTimestamp(),
  });
}

export async function updateEventPlan(uid: string, id: string, title: string, date: string): Promise<void> {
  await updateDoc(eventDoc(uid, id), { title: clip(title, MAX_TITLE), date: DATE_RE.test(date) ? date : '' });
}

export async function completeEvent(uid: string, id: string, doneDate: string, note: string): Promise<void> {
  await updateDoc(eventDoc(uid, id), { status: 'done', doneDate, note: clip(note, MAX_NOTE) });
}

export async function reopenEvent(uid: string, id: string): Promise<void> {
  await updateDoc(eventDoc(uid, id), { status: 'planned', doneDate: '', note: '' });
}

export async function deleteEvent(uid: string, id: string): Promise<void> {
  await deleteDoc(eventDoc(uid, id));
}

export type Category = 'town' | 'taste' | 'play' | 'build';
export type Rarity = 'common' | 'rare' | 'epic';
export type Result = 'hit' | 'normal' | 'miss';
export type DrawStatus = 'drawn' | 'done' | 'skipped';
export type EventStatus = 'planned' | 'done';

/** お題（プリセット・自分で追加したものの両方） */
export interface Quest {
  id: string;
  title: string;
  category: Category;
  rarity: Rarity;
  custom: boolean;
}

/** 自分で追加したお題（Firestore: users/{uid}/quests） */
export interface CustomQuest {
  id: string;
  title: string;
  category: Category;
  rarity: Rarity;
  createdAt: number;
}

/** その日のドロップ（Firestore: users/{uid}/draws/{YYYY-MM-DD}） */
export interface Draw {
  date: string;
  questId: string;
  title: string;
  category: Category;
  rarity: Rarity;
  rerolled: boolean;
  status: DrawStatus;
  logId: string;
}

/** やってみた記録（Firestore: users/{uid}/logs） */
export interface Log {
  id: string;
  date: string;
  questId: string;
  title: string;
  category: Category;
  rarity: Rarity;
  result: Result;
  note: string;
  fromDrop: boolean;
  createdAt: number;
}

/** 半年に1回レベルのレアイベント（Firestore: users/{uid}/events） */
export interface RareEvent {
  id: string;
  title: string;
  date: string; // 空文字 = 日付未定
  status: EventStatus;
  note: string;
  doneDate: string;
  createdAt: number;
}

/** 設定（Firestore: users/{uid}/meta/settings） */
export interface Settings {
  hidden: string[]; // 出さないことにしたプリセットのお題ID
}

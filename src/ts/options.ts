import { Category, Quest, Rarity, Result } from './types';

export const CATEGORIES: { key: Category; label: string; desc: string }[] = [
  { key: 'town', label: 'まち・お店', desc: '知らない店・道・駅へ' },
  { key: 'taste', label: 'たべる・のむ', desc: 'いつもと違う一品を' },
  { key: 'play', label: 'あそぶ・ふれる', desc: 'ジャンル外に少しだけ' },
  { key: 'build', label: 'つくる・ビルド', desc: '新しい技術をひとつ' },
];
export const CATEGORY_KEYS: Category[] = CATEGORIES.map((c) => c.key);
export const categoryLabel = (key: Category): string =>
  CATEGORIES.find((c) => c.key === key)?.label ?? '';

export const RARITIES: { key: Rarity; label: string; weight: number; xp: number }[] = [
  { key: 'common', label: 'コモン', weight: 65, xp: 10 },
  { key: 'rare', label: 'レア', weight: 28, xp: 20 },
  { key: 'epic', label: 'エピック', weight: 7, xp: 40 },
];
export const RARITY_KEYS: Rarity[] = RARITIES.map((r) => r.key);
export const rarityOf = (key: Rarity) => RARITIES.find((r) => r.key === key) ?? RARITIES[0];

export const RESULTS: { key: Result; label: string }[] = [
  { key: 'hit', label: '当たり' },
  { key: 'normal', label: 'ふつう' },
  { key: 'miss', label: 'ハズレ' },
];
export const RESULT_KEYS: Result[] = RESULTS.map((r) => r.key);
export const resultLabel = (key: Result): string => RESULTS.find((r) => r.key === key)?.label ?? '';

/** XP: レア度ごとの基本値 + ドロップに従ったら +5 + ひとことを残したら +5。レアイベントは +50 */
export const XP_DROP_BONUS = 5;
export const XP_NOTE_BONUS = 5;
export const XP_EVENT = 50;

/** レアイベントの目安（半年） */
export const EVENT_INTERVAL_DAYS = 182;

export const EVENT_EXAMPLES = ['美術館・博物館', 'ライブ・コンサート', '展示会・イベント', '観劇・お笑い', '泊まりの旅行', '体験ツアー'];

const q = (id: string, category: Category, rarity: Rarity, title: string): Quest =>
  ({ id: `p-${id}`, title, category, rarity, custom: false });

/** プリセットのお題。IDは記録と紐づくので変更しないこと */
export const PRESET_QUESTS: Quest[] = [
  // まち・お店
  q('town-01', 'town', 'common', '入ったことのないお店に入ってみる'),
  q('town-02', 'town', 'common', 'いつもと違う道で帰る'),
  q('town-03', 'town', 'common', '知らない喫茶店でひと休みする'),
  q('town-04', 'town', 'common', '本屋で普段は行かない棚を5分見る'),
  q('town-05', 'town', 'common', '使ったことのない物を1つ買ってみる'),
  q('town-06', 'town', 'rare', '降りたことのない駅で降りて30分歩く'),
  q('town-07', 'town', 'rare', '行ったことのない商店街を端から端まで歩く'),
  q('town-08', 'town', 'rare', '近所の小さな催し・お祭りをのぞいてみる'),
  q('town-09', 'town', 'epic', '日帰りで知らない町へ出かける'),
  // たべる・のむ
  q('taste-01', 'taste', 'common', '普段は頼まないメニューを頼む'),
  q('taste-02', 'taste', 'common', 'コンビニの新商品を1つ買ってみる'),
  q('taste-03', 'taste', 'common', '飲んだことのない飲み物を試す'),
  q('taste-04', 'taste', 'common', '使ったことのない調味料で味つけする'),
  q('taste-05', 'taste', 'rare', '食べたことのない国の料理を食べる'),
  q('taste-06', 'taste', 'rare', '作ったことのないレシピに挑戦する'),
  q('taste-07', 'taste', 'rare', '気になっていた行列のお店に並んでみる'),
  q('taste-08', 'taste', 'epic', '「おまかせ」やコース料理を頼んでみる'),
  // あそぶ・ふれる
  q('play-01', 'play', 'common', 'ジャンル外のゲームを15分だけ触る'),
  q('play-02', 'play', 'common', '聴いたことのないジャンルの音楽を1曲聴く'),
  q('play-03', 'play', 'common', '読まないジャンルの本を10ページ読む'),
  q('play-04', 'play', 'common', 'ランキングに入っていない映画・動画を1本観る'),
  q('play-05', 'play', 'common', '知らない人の配信・ブログを1つ見てみる'),
  q('play-06', 'play', 'rare', '体験教室・ワークショップを探して申し込む'),
  q('play-07', 'play', 'rare', 'やったことのない運動・スポーツを試す'),
  q('play-08', 'play', 'rare', 'テーマを1つ決めて写真を10枚撮る'),
  q('play-09', 'play', 'epic', 'やったことのない趣味を1日まるごと体験する'),
  // つくる・ビルド
  q('build-01', 'build', 'common', '触ったことのないライブラリを1つ入れてみる'),
  q('build-02', 'build', 'common', '使ったことのないAI機能を1つ試す'),
  q('build-03', 'build', 'common', '新しいショートカット・設定を1つ覚える'),
  q('build-04', 'build', 'common', '何かひとつ、記録を取り始める'),
  q('build-05', 'build', 'common', '新しいCSS・言語機能を1つ使ってみる'),
  q('build-06', 'build', 'rare', '新しい技術で小さなものを1つ作る'),
  q('build-07', 'build', 'rare', '使ったことのない言語でHello Worldを書く'),
  q('build-08', 'build', 'rare', '作ったものを人に見せて感想をもらう'),
  q('build-09', 'build', 'epic', '週末に、新しい技術だけでミニアプリを作る'),
];

export interface LevelInfo {
  level: number;
  title: string;
  current: number; // このレベルに入ってから得たXP
  need: number; // 次のレベルまでに必要なXP（このレベル分）
}

const TITLES: { from: number; title: string }[] = [
  { from: 1, title: 'いつもの村人' },
  { from: 3, title: '見習い冒険者' },
  { from: 5, title: '寄り道冒険者' },
  { from: 8, title: 'ベテラン冒険者' },
  { from: 11, title: 'トレジャーハンター' },
  { from: 15, title: '伝説のレアハンター' },
];

/** レベル n → n+1 に必要なXP = 30n（Lv2:30, Lv3:90, Lv4:180 ...） */
export function levelOf(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= 30 * level) {
    rest -= 30 * level;
    level += 1;
  }
  const title = TITLES.filter((t) => t.from <= level).pop()?.title ?? TITLES[0].title;
  return { level, title, current: rest, need: 30 * level };
}

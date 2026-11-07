import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyAxAO6FaR_Y8e_nKKMUhObXoa76cqC0w3I',
  authDomain: 'rare-drop-biyori.firebaseapp.com',
  projectId: 'rare-drop-biyori',
  storageBucket: 'rare-drop-biyori.firebasestorage.app',
  messagingSenderId: '304698341024',
  appId: '1:304698341024:web:a0895dd3f4a1033d0dfbc5',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

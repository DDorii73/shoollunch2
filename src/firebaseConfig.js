// Firebase 설정 파일
// 환경변수에서 Firebase 설정값을 불러옵니다
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 환경변수에서 Firebase 설정 불러오기
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

// Firebase 설정값 검증
const isFirebaseConfigured = apiKey && 
                             authDomain && 
                             projectId &&
                             apiKey.trim() !== '' &&
                             authDomain.trim() !== '' &&
                             projectId.trim() !== '';

if (!isFirebaseConfigured) {
  console.warn('⚠️ Firebase 설정이 완료되지 않았습니다.');
  console.info('📝 .env 파일에 Firebase 설정값을 입력해주세요.');
  console.info('   Firebase Console에서 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 설정값을 복사하세요.');
}

const firebaseConfig = {
  apiKey: apiKey || '',
  authDomain: authDomain || '',
  projectId: projectId || '',
  storageBucket: storageBucket || '',
  messagingSenderId: messagingSenderId || '',
  appId: appId || ''
};

// Firebase 초기화
let app;
let auth;
let googleProvider;
let db;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase 초기화 성공');
    
    // 인증 및 Firestore 초기화
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    db = getFirestore(app);
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    throw error;
  }
} else {
  console.warn('⚠️ Firebase 설정이 없어 초기화를 건너뜁니다.');
  console.info('💡 .env 파일에 Firebase 설정값을 입력한 후 페이지를 새로고침하세요.');
}

// 관리자 UID 체크 함수
function isAdmin(uid) {
  if (!uid) return false;
  
  // 환경변수에서 관리자 UID 가져오기 (쉼표로 구분된 여러 UID 지원)
  const adminUids = import.meta.env.VITE_ADMIN_UID;
  
  if (!adminUids || adminUids.trim() === '') {
    console.warn('⚠️ 관리자 UID가 설정되지 않았습니다.');
    return false;
  }
  
  // 쉼표로 구분된 여러 UID 지원
  const adminUidList = adminUids.split(',').map(uid => uid.trim()).filter(uid => uid.length > 0);
  
  return adminUidList.includes(uid);
}

export { auth, googleProvider, db, isAdmin };

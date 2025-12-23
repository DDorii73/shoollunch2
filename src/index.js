// 메인 페이지 로그인 관리
import { auth, googleProvider, db, isAdmin } from './firebaseConfig.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// DOM 요소
const googleLoginBtn = document.getElementById('google-login-btn');
const loginStatus = document.getElementById('login-status');
const userInfo = document.getElementById('user-info');
const userName = document.getElementById('user-name');
const enterBtn = document.getElementById('enter-btn');
const logoutBtn = document.getElementById('logout-btn');
const roleRadios = document.querySelectorAll('input[name="role"]');
const navButtons = document.querySelector('.nav-buttons');
const teacherMonitorBtn = document.getElementById('teacher-monitor-btn');

// 초기 상태 설정
function initializeUI() {
  // 로그인 전에는 네비게이션 버튼과 사용자 정보 숨김
if (navButtons) {
  navButtons.classList.add('hidden');
}
  if (userInfo) {
    userInfo.classList.add('hidden');
  }
  if (googleLoginBtn) {
    googleLoginBtn.style.display = 'block';
  }
  if (teacherMonitorBtn) {
    teacherMonitorBtn.classList.add('hidden');
  }
}

// 페이지 로드 시 초기화
initializeUI();

// Google 로그인
googleLoginBtn.addEventListener('click', async () => {
  try {
    // Firebase 설정 확인
    if (!auth || !googleProvider) {
      loginStatus.textContent = '⚠️ Firebase 설정이 필요합니다. .env 파일에 Firebase 설정값을 입력한 후 페이지를 새로고침해주세요.';
      loginStatus.className = 'error';
      return;
    }
    
    googleLoginBtn.disabled = true;
    const originalContent = googleLoginBtn.innerHTML;
    googleLoginBtn.innerHTML = '<span>로그인 중...</span>';
    loginStatus.textContent = '';
    loginStatus.className = '';
    
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // 사용자 정보를 Firestore에 저장
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'student', // 기본값은 학생
          createdAt: new Date().toISOString()
        });
      }
    } catch (dbError) {
      console.warn('Firestore 저장 오류 (무시 가능):', dbError);
      // Firestore 오류는 로그인을 막지 않음
    }
    
    // 로그인 성공 후 UI 업데이트
    showUserInfo(user);
    showNavButtons(user);
    loginStatus.textContent = '✅ 로그인 성공! 이제 학생 활동 또는 교사 모니터링 페이지로 이동할 수 있습니다.';
    loginStatus.className = 'success';
  } catch (error) {
    console.error('로그인 오류:', error);
    
    let errorMessage = '로그인에 실패했습니다.';
    
    // Firebase 오류 코드별 메시지
    if (error.code) {
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          errorMessage = '로그인 창이 닫혔습니다. 다시 시도해주세요.';
          break;
        case 'auth/popup-blocked':
          errorMessage = '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.';
          break;
        case 'auth/unauthorized-domain':
          errorMessage = '인증되지 않은 도메인입니다. Firebase Console에서 도메인을 추가해주세요.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Google 로그인이 활성화되지 않았습니다. Firebase Console에서 활성화해주세요.';
          break;
        case 'auth/configuration-not-found':
          errorMessage = 'Firebase 설정을 찾을 수 없습니다. Firebase Console에서 Google 로그인을 활성화해주세요. (Authentication → Sign-in method → Google 활성화)';
          break;
        case 'auth/network-request-failed':
          errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
          break;
        default:
          errorMessage = `로그인 오류: ${error.message || error.code}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    loginStatus.textContent = errorMessage;
    loginStatus.className = 'error';
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google로 로그인
    `;
  }
});

// 로그아웃
logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
    hideUserInfo();
    hideNavButtons();
  } catch (error) {
    console.error('로그아웃 오류:', error);
  }
});

// 입장하기 버튼
enterBtn.addEventListener('click', () => {
  const selectedRole = document.querySelector('input[name="role"]:checked').value;
  const user = auth.currentUser;
  
  if (!user) return;
  
  // 선택한 역할을 Firestore에 저장
  const userRef = doc(db, 'users', user.uid);
  setDoc(userRef, { role: selectedRole }, { merge: true });
  
  // 역할에 따라 페이지 이동
  if (selectedRole === 'student') {
    window.location.href = '/student.html';
  } else {
    window.location.href = '/teacherMonitor.html';
  }
});

// 네비게이션 버튼 클릭 이벤트 (로그인 및 권한 확인)
if (navButtons) {
  navButtons.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // auth가 없거나 사용자가 로그인하지 않은 경우
      if (!auth || !auth.currentUser) {
        e.preventDefault();
        e.stopPropagation();
        alert('⚠️ 로그인이 필요합니다.\nGoogle 로그인을 먼저 해주세요.');
        // 로그인 버튼으로 스크롤
        if (googleLoginBtn) {
          googleLoginBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
      }
      
      // 교사 모니터링 버튼인 경우 관리자 권한 확인
      if (btn.id === 'teacher-monitor-btn' || btn.href.includes('teacherMonitor.html')) {
        const user = auth.currentUser;
        if (!isAdmin(user.uid)) {
          e.preventDefault();
          e.stopPropagation();
          alert('⚠️ 관리자 권한이 필요합니다.\n교사 모니터링 페이지에 접근할 수 없습니다.');
          return false;
        }
      }
      
      // 로그인된 경우 정상적으로 링크 이동 허용
    });
  });
}

// 사용자 정보 표시
function showUserInfo(user) {
  userName.textContent = user.displayName || user.email;
  userInfo.classList.remove('hidden');
  googleLoginBtn.style.display = 'none';
  loginStatus.textContent = '';
  loginStatus.className = '';
  
  // Firestore에서 역할 정보 가져오기
  const userRef = doc(db, 'users', user.uid);
  getDoc(userRef).then(docSnap => {
    if (docSnap.exists()) {
      const userData = docSnap.data();
      if (userData.role) {
        const roleRadio = document.querySelector(`input[value="${userData.role}"]`);
        if (roleRadio) {
          roleRadio.checked = true;
        }
      }
    }
  });
}

// 사용자 정보 숨기기
function hideUserInfo() {
  userInfo.classList.add('hidden');
  googleLoginBtn.style.display = 'block';
  loginStatus.textContent = '';
  loginStatus.className = '';
  googleLoginBtn.disabled = false;
  googleLoginBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Google로 로그인
  `;
}

// 네비게이션 버튼 표시
function showNavButtons(user) {
  if (navButtons) {
    navButtons.classList.remove('hidden');
  }
  
  // 관리자 UID 체크 후 교사 모니터링 버튼 표시/숨김
  if (teacherMonitorBtn && user) {
    if (isAdmin(user.uid)) {
      teacherMonitorBtn.classList.remove('hidden');
      console.log('✅ 관리자 권한 확인: 교사 모니터링 버튼 표시');
    } else {
      teacherMonitorBtn.classList.add('hidden');
      console.log('ℹ️ 일반 사용자: 교사 모니터링 버튼 숨김');
    }
  }
}

// 네비게이션 버튼 숨기기
function hideNavButtons() {
  if (navButtons) {
    navButtons.classList.add('hidden');
  }
  if (teacherMonitorBtn) {
    teacherMonitorBtn.classList.add('hidden');
  }
}

// 인증 상태 감지 및 자동 UI 업데이트
if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // 로그인된 경우
      console.log('✅ 사용자 로그인 감지:', user.email);
      showUserInfo(user);
      showNavButtons(user);
    } else {
      // 로그아웃된 경우
      console.log('ℹ️ 사용자 로그아웃 감지');
      hideUserInfo();
      hideNavButtons();
      initializeUI();
    }
  });
} else {
  console.warn('⚠️ Firebase가 설정되지 않아 인증 상태 감지를 건너뜁니다.');
  console.info('💡 .env 파일에 Firebase 설정값을 입력한 후 페이지를 새로고침하세요.');
}

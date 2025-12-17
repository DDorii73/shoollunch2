// 교사 모니터링 페이지 관련
import { auth, db, isAdmin } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';

// 오늘의 날짜 가져오기
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// DOM 요소
const datePicker = document.getElementById('date-picker');
const todayBtn = document.getElementById('today-btn');
const refreshBtn = document.getElementById('refresh-btn');
const backBtn = document.getElementById('back-btn');
const recordsList = document.getElementById('records-list');
const totalStudents = document.getElementById('total-students');

// 날짜 선택기 초기화
datePicker.value = getTodayDate();

// 인증 확인 및 관리자 권한 체크
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.warn('⚠️ 로그인이 필요합니다.');
    alert('로그인이 필요합니다.');
    window.location.href = '/index.html';
    return;
  }
  
  // 관리자 UID 확인
  if (!isAdmin(user.uid)) {
    console.warn('⚠️ 관리자 권한이 필요합니다. 현재 UID:', user.uid);
    alert('⚠️ 관리자 권한이 필요합니다.\n교사 모니터링 페이지에 접근할 수 없습니다.');
    window.location.href = '/index.html';
    return;
  }
  
  console.log('✅ 관리자 권한 확인 완료:', user.email);
  
  // 사용자 인사말 표시 (관리자이므로 무조건 선생님으로 표시)
  const displayName = user.displayName || user.email;
  const userGreeting = document.getElementById('user-greeting');
  if (userGreeting) {
    userGreeting.textContent = `안녕하세요! ${displayName}선생님!`;
  }
  
  // Firestore에 역할이 'teacher'로 저장되어 있지 않다면 업데이트
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().role !== 'teacher') {
      await setDoc(userRef, { role: 'teacher' }, { merge: true });
      console.log('✅ 사용자 역할을 teacher로 업데이트했습니다.');
    } else if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: 'teacher',
        createdAt: new Date().toISOString()
      });
      console.log('✅ 새 사용자 정보를 teacher 역할로 저장했습니다.');
    }
  } catch (error) {
    console.warn('사용자 역할 업데이트 실패:', error);
  }
  
  // 데이터 로드
  loadRecords(datePicker.value);
});

// 오늘 버튼
todayBtn.addEventListener('click', () => {
  datePicker.value = getTodayDate();
  loadRecords(datePicker.value);
});

// 날짜 변경
datePicker.addEventListener('change', (e) => {
  loadRecords(e.target.value);
});

// 새로고침
refreshBtn.addEventListener('click', () => {
  loadRecords(datePicker.value);
});

// 돌아가기
backBtn.addEventListener('click', () => {
  window.location.href = '/index.html';
});

// 기록 로드
async function loadRecords(date) {
  recordsList.innerHTML = '<p class="loading">데이터를 불러오는 중...</p>';
  
  try {
    const recordsRef = collection(db, 'foodRecords');
    
    // orderBy 없이 먼저 시도 (인덱스 문제 방지)
    let q = query(recordsRef, where('date', '==', date));
    let querySnapshot;
    
    try {
      // orderBy를 포함한 쿼리 시도 (updatedAt 우선, 없으면 createdAt)
      try {
        q = query(recordsRef, where('date', '==', date), orderBy('updatedAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (updatedAtError) {
        // updatedAt이 없으면 createdAt으로 시도
        q = query(recordsRef, where('date', '==', date), orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      }
    } catch (orderByError) {
      // orderBy 오류 시 orderBy 없이 재시도
      console.warn('orderBy 오류, orderBy 없이 재시도:', orderByError);
      q = query(recordsRef, where('date', '==', date));
      querySnapshot = await getDocs(q);
    }
    
    if (querySnapshot.empty) {
      recordsList.innerHTML = '<p class="no-data">해당 날짜에 기록이 없습니다.</p>';
      updateStats([]);
      return;
    }
    
    const records = [];
    querySnapshot.forEach(doc => {
      records.push({ id: doc.id, ...doc.data() });
    });
    
    // updatedAt 또는 createdAt 기준으로 수동 정렬 (orderBy 실패 시)
    records.sort((a, b) => {
      const aTime = (a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0) || 
                     (a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0);
      const bTime = (b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0) || 
                     (b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0);
      return bTime - aTime; // 내림차순 (최신순)
    });
    
    displayRecords(records);
    updateStats(records);
  } catch (error) {
    console.error('기록 로드 오류:', error);
    
    // 더 자세한 오류 메시지 표시
    let errorMessage = '데이터를 불러오는 중 오류가 발생했습니다.';
    
    if (error.code === 'failed-precondition') {
      errorMessage = '⚠️ Firebase 인덱스가 필요합니다.\nFirebase Console에서 인덱스를 생성해주세요.\n(콘솔에 표시된 링크를 클릭하면 자동 생성됩니다)';
    } else if (error.code === 'permission-denied') {
      errorMessage = '⚠️ 데이터 읽기 권한이 없습니다.\nFirebase Firestore 규칙을 확인해주세요.';
    } else if (error.message) {
      errorMessage = `⚠️ 오류: ${error.message}`;
    }
    
    recordsList.innerHTML = `<p class="error">${errorMessage}</p>`;
    updateStats([]);
  }
}

// 기록 표시
function displayRecords(records) {
  recordsList.innerHTML = '';
  
  if (records.length === 0) {
    recordsList.innerHTML = '<p class="no-data">해당 날짜에 기록이 없습니다.</p>';
    return;
  }
  
  // 사용자별로 그룹화 (같은 날짜, 같은 사용자의 점심과 간식을 합침)
  const userRecordsMap = new Map();
  
  // 각 사용자별로 가장 최신 점심/간식 기록만 저장
  const userLunchRecords = new Map(); // userId -> 가장 최신 점심 기록
  const userSnackRecords = new Map(); // userId -> 가장 최신 간식 기록
  
  records.forEach(record => {
    const userId = record.userId;
    const userName = record.userName || record.userEmail || '익명';
    
    // 기록 시간 계산 (updatedAt 우선, 없으면 createdAt)
    const recordTime = record.updatedAt || record.createdAt;
    const timeValue = recordTime?.toMillis?.() || recordTime?.seconds || 0;
    
    // 점심 기록 처리 - 가장 최신 기록만 저장
    if (record.type === 'lunch' && record.menuItems) {
      const existingLunch = userLunchRecords.get(userId);
      if (!existingLunch || timeValue > (existingLunch.time || 0)) {
        userLunchRecords.set(userId, {
          record: record,
          time: timeValue,
          userName: userName
        });
      }
    }
    
    // 간식 기록 처리 - 가장 최신 기록만 저장
    if (record.type === 'snack' && record.snacks) {
      const existingSnack = userSnackRecords.get(userId);
      if (!existingSnack || timeValue > (existingSnack.time || 0)) {
        userSnackRecords.set(userId, {
          record: record,
          time: timeValue,
          userName: userName
        });
      }
    }
  });
  
  // 모든 사용자 ID 수집
  const allUserIds = new Set();
  userLunchRecords.forEach((_, userId) => allUserIds.add(userId));
  userSnackRecords.forEach((_, userId) => allUserIds.add(userId));
  
  // 사용자별로 최종 기록 생성
  allUserIds.forEach(userId => {
    const lunchRecord = userLunchRecords.get(userId);
    const snackRecord = userSnackRecords.get(userId);
    
    // 사용자 이름 결정 (점심 또는 간식 기록에서 가져옴)
    const userName = lunchRecord?.userName || snackRecord?.userName || '익명';
    
    const userRecord = {
      userId: userId,
      userName: userName,
      userEmail: lunchRecord?.record?.userEmail || snackRecord?.record?.userEmail || '',
      lunchItems: [],
      snackItems: [],
      totalCalories: 0,
      createdAt: null
    };
    
    // 점심 기록 처리 (가장 최신 기록만 사용)
    if (lunchRecord && lunchRecord.record.menuItems) {
      lunchRecord.record.menuItems.forEach(item => {
        if (item.count > 0) {
          userRecord.lunchItems.push(`${item.name} ${item.count}인분`);
        }
      });
      if (lunchRecord.record.totalCalories) {
        userRecord.totalCalories = lunchRecord.record.totalCalories;
      }
      // 가장 최신 시간 설정
      const lunchTime = lunchRecord.record.updatedAt || lunchRecord.record.createdAt;
      if (lunchTime && (!userRecord.createdAt || 
          (lunchTime.toMillis?.() || lunchTime.seconds || 0) > 
          (userRecord.createdAt.toMillis?.() || userRecord.createdAt.seconds || 0))) {
        userRecord.createdAt = lunchTime;
      }
    }
    
    // 간식 기록 처리 (가장 최신 기록만 사용)
    if (snackRecord && snackRecord.record.snacks) {
      userRecord.snackItems = [...snackRecord.record.snacks];
      // 가장 최신 시간 설정
      const snackTime = snackRecord.record.updatedAt || snackRecord.record.createdAt;
      if (snackTime && (!userRecord.createdAt || 
          (snackTime.toMillis?.() || snackTime.seconds || 0) > 
          (userRecord.createdAt.toMillis?.() || userRecord.createdAt.seconds || 0))) {
        userRecord.createdAt = snackTime;
      }
    }
    
    userRecordsMap.set(userId, userRecord);
  });
  
  // 그룹화된 기록을 카드로 표시
  const groupedRecords = Array.from(userRecordsMap.values());
  
  // 시간순으로 정렬 (최신순) - updatedAt 또는 createdAt 기준
  groupedRecords.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
    return bTime - aTime; // 내림차순 (최신순)
  });
  
  groupedRecords.forEach(userRecord => {
    const recordCard = document.createElement('div');
    recordCard.className = 'record-card';
    
    // 점심 메뉴 표시
    const lunchItems = userRecord.lunchItems.length > 0
      ? userRecord.lunchItems.map(food => `<span class="food-tag">${food}</span>`).join('')
      : '<span class="no-food">기록 없음</span>';
    
    // 간식 표시
    const snackItems = userRecord.snackItems.length > 0
      ? userRecord.snackItems.map(food => `<span class="food-tag snack">${food}</span>`).join('')
      : '<span class="no-food">기록 없음</span>';
    
    recordCard.innerHTML = `
      <div class="record-header">
        <h3>${userRecord.userName}</h3>
        <span class="record-time">${formatTime(userRecord.createdAt)}</span>
      </div>
      <div class="record-content">
        <div class="record-section">
          <h4>🍱 점심 급식</h4>
          <div class="food-tags">${lunchItems}</div>
          ${userRecord.totalCalories > 0 ? `<p class="calories-info">총 칼로리: ${userRecord.totalCalories}kcal</p>` : ''}
        </div>
        <div class="record-section">
          <h4>🍪 방과후 간식</h4>
          <div class="food-tags">${snackItems}</div>
        </div>
      </div>
    `;
    
    recordsList.appendChild(recordCard);
  });
}

// 통계 업데이트
function updateStats(records) {
  if (records.length === 0) {
    totalStudents.textContent = '0';
    return;
  }
  
  // 사용자별로 그룹화하여 학생 수 계산
  const uniqueUsers = new Set();
  
  records.forEach(record => {
    uniqueUsers.add(record.userId);
  });
  
  totalStudents.textContent = uniqueUsers.size;
}

// 시간 포맷팅
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  let date;
  
  // Firestore Timestamp 객체인 경우
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } 
  // toMillis 메서드가 있는 경우 (Firestore Timestamp)
  else if (timestamp.toMillis && typeof timestamp.toMillis === 'function') {
    date = new Date(timestamp.toMillis());
  }
  // seconds 속성이 있는 경우 (Firestore Timestamp)
  else if (timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  }
  // 이미 Date 객체인 경우
  else if (timestamp instanceof Date) {
    date = timestamp;
  }
  // 숫자(밀리초)인 경우
  else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  }
  // 문자열인 경우
  else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  }
  // 그 외의 경우
  else {
    console.warn('알 수 없는 timestamp 형식:', timestamp);
    return '';
  }
  
  // 유효한 날짜인지 확인
  if (isNaN(date.getTime())) {
    console.warn('Invalid Date:', timestamp);
    return '';
  }
  
  return date.toLocaleTimeString('ko-KR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}


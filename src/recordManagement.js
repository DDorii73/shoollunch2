// 기록 관리 페이지
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

// DOM 요소
const backBtn = document.getElementById('back-btn');
const heightInput = document.getElementById('height-input');
const weightInput = document.getElementById('weight-input');
const targetWeightInput = document.getElementById('target-weight-input');
const ageInput = document.getElementById('age-input');
const genderRadios = document.querySelectorAll('input[name="gender"]');
const calculateBtn = document.getElementById('calculate-btn');
const saveBtn = document.getElementById('save-btn');
const resultSection = document.getElementById('result-section');
const savedInfo = document.getElementById('saved-info');

const bmiValue = document.getElementById('bmi-value');
const bmiStatus = document.getElementById('bmi-status');
const bmrValue = document.getElementById('bmr-value');

const savedHeight = document.getElementById('saved-height');
const savedWeight = document.getElementById('saved-weight');
const savedTargetWeight = document.getElementById('saved-target-weight');
const savedAge = document.getElementById('saved-age');
const savedGender = document.getElementById('saved-gender');
const savedBmi = document.getElementById('saved-bmi');
const savedBmr = document.getElementById('saved-bmr');
const savedAllergySummary = document.getElementById('saved-allergy-summary');
const updateDate = document.getElementById('update-date');

// 알레르기 관련 DOM 요소
const saveAllergyBtn = document.getElementById('save-allergy-btn');
const savedAllergyInfo = document.getElementById('saved-allergy-info');
const savedAllergyList = document.getElementById('saved-allergy-list');

// 그래프 관련 DOM 요소
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const loadChartBtn = document.getElementById('load-chart-btn');
const chartCanvas = document.getElementById('weight-bmi-chart');

let currentUser = null;
let calculatedBmi = null;
let calculatedBmr = null;
let weightBmiChart = null;

// 오늘의 날짜 가져오기 (YYYY-MM-DD 형식)
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// 날짜 범위 초기화 (최근 30일)
function initializeDateRange() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  endDateInput.value = getTodayDate();
  startDateInput.value = thirtyDaysAgo.toISOString().split('T')[0];
}

// BMI 계산 함수
function calculateBMI(height, weight) {
  if (!height || !weight || height <= 0 || weight <= 0) {
    return null;
  }
  const heightInMeters = height / 100;
  return weight / (heightInMeters * heightInMeters);
}

// BMI 상태 판정
function getBMIStatus(bmi) {
  if (bmi < 18.5) return { text: '저체중', color: '#4A90E2' };
  if (bmi < 23) return { text: '정상', color: '#7ED321' };
  if (bmi < 25) return { text: '과체중', color: '#F5A623' };
  if (bmi < 30) return { text: '비만', color: '#D0021B' };
  return { text: '고도비만', color: '#9013FE' };
}

// BMR 계산 함수 (Mifflin-St Jeor Equation)
function calculateBMR(weight, height, age, gender) {
  if (!weight || !height || !age || weight <= 0 || height <= 0 || age <= 0) {
    return null;
  }
  
  // 남성: BMR = 10 × 체중(kg) + 6.25 × 키(cm) - 5 × 나이(년) + 5
  // 여성: BMR = 10 × 체중(kg) + 6.25 × 키(cm) - 5 × 나이(년) - 161
  const baseBMR = 10 * weight + 6.25 * height - 5 * age;
  return gender === 'male' ? baseBMR + 5 : baseBMR - 161;
}

// 저장하기 버튼 클릭 (계산 + 저장)
calculateBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = '/index.html';
    return;
  }
  
  const height = parseFloat(heightInput.value);
  const weight = parseFloat(weightInput.value);
  const targetWeight = parseFloat(targetWeightInput.value) || null;
  const age = parseInt(ageInput.value);
  const gender = document.querySelector('input[name="gender"]:checked').value;
  
  if (!height || !weight || !age) {
    alert('키, 몸무게, 나이를 모두 입력해주세요.');
    return;
  }
  
  // BMI 계산
  calculatedBmi = calculateBMI(height, weight);
  const bmiStatusInfo = getBMIStatus(calculatedBmi);
  
  // BMR 계산
  calculatedBmr = calculateBMR(weight, height, age, gender);
  
  // 결과 표시
  bmiValue.textContent = calculatedBmi.toFixed(1);
  bmiStatus.textContent = bmiStatusInfo.text;
  bmiStatus.style.color = bmiStatusInfo.color;
  bmrValue.textContent = Math.round(calculatedBmr);
  
  resultSection.classList.remove('hidden');
  
  // 계산 후 바로 저장
  try {
    const date = getTodayDate();
    // 날짜별로 별도 문서 저장 (추이 그래프를 위해)
    const dateRecordRef = doc(db, 'userRecords', currentUser.uid, 'dailyRecords', date);
    // 알레르기 정보 가져오기
    const allergyCheckboxes = document.querySelectorAll('input[name="allergy"]:checked');
    const allergies = Array.from(allergyCheckboxes).map(cb => cb.value);
    
    const recordData = {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: currentUser.displayName || '익명',
      height: height,
      weight: weight,
      targetWeight: targetWeight,
      age: age,
      gender: gender,
      bmi: calculatedBmi,
      bmr: calculatedBmr,
      allergies: allergies,
      date: date,
      createdAt: serverTimestamp()
    };
    
    await setDoc(dateRecordRef, recordData);
    
    // 최신 정보도 메인 문서에 저장 (현재 정보 표시용)
    const userRecordRef = doc(db, 'userRecords', currentUser.uid);
    await setDoc(userRecordRef, {
      ...recordData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    console.log('✅ 신체 정보가 저장되었습니다.');
    alert('✅ 신체 정보가 저장되었습니다!');
    
    // 저장된 정보 표시
    await loadSavedRecord();
    
    // 그래프 업데이트
    if (startDateInput.value && endDateInput.value) {
      await loadChartData();
    }
  } catch (error) {
    console.error('신체 정보 저장 오류:', error);
    alert('신체 정보 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
});

// 저장하기 버튼 클릭
saveBtn.addEventListener('click', async () => {
  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = '/index.html';
    return;
  }
  
  if (!calculatedBmi || !calculatedBmr) {
    alert('먼저 계산하기 버튼을 눌러주세요.');
    return;
  }
  
  const height = parseFloat(heightInput.value);
  const weight = parseFloat(weightInput.value);
  const targetWeight = parseFloat(targetWeightInput.value) || null;
  const age = parseInt(ageInput.value);
  const gender = document.querySelector('input[name="gender"]:checked').value;
  
  try {
    const date = getTodayDate();
    // 날짜별로 별도 문서 저장 (추이 그래프를 위해)
    const dateRecordRef = doc(db, 'userRecords', currentUser.uid, 'dailyRecords', date);
    // 알레르기 정보 가져오기
    const allergyCheckboxes = document.querySelectorAll('input[name="allergy"]:checked');
    const allergies = Array.from(allergyCheckboxes).map(cb => cb.value);
    
    const recordData = {
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: currentUser.displayName || '익명',
      height: height,
      weight: weight,
      targetWeight: targetWeight,
      age: age,
      gender: gender,
      bmi: calculatedBmi,
      bmr: calculatedBmr,
      allergies: allergies,
      date: date,
      createdAt: serverTimestamp()
    };
    
    await setDoc(dateRecordRef, recordData);
    
    // 최신 정보도 메인 문서에 저장 (현재 정보 표시용)
    const userRecordRef = doc(db, 'userRecords', currentUser.uid);
    await setDoc(userRecordRef, {
      ...recordData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    console.log('✅ 신체 정보가 저장되었습니다.');
    alert('✅ 신체 정보가 저장되었습니다!');
    
    // 저장된 정보 표시
    await loadSavedRecord();
    
    // 그래프 업데이트
    if (startDateInput.value && endDateInput.value) {
      await loadChartData();
    }
  } catch (error) {
    console.error('저장 오류:', error);
    alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
});

// 저장된 기록 불러오기
async function loadSavedRecord() {
  if (!currentUser || !db) {
    return;
  }
  
  try {
    const userRecordRef = doc(db, 'userRecords', currentUser.uid);
    const docSnap = await getDoc(userRecordRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // 입력 필드에 값 채우기
      if (data.height) heightInput.value = data.height;
      if (data.weight) weightInput.value = data.weight;
      if (data.targetWeight) targetWeightInput.value = data.targetWeight;
      if (data.age) ageInput.value = data.age;
      if (data.gender) {
        document.querySelector(`input[value="${data.gender}"]`).checked = true;
      }
      
      // 저장된 정보 표시
      savedHeight.textContent = data.height || '-';
      savedWeight.textContent = data.weight || '-';
      savedTargetWeight.textContent = data.targetWeight || '-';
      savedAge.textContent = data.age || '-';
      savedGender.textContent = data.gender === 'male' ? '남성' : '여성';
      savedBmi.textContent = data.bmi ? data.bmi.toFixed(1) : '-';
      savedBmr.textContent = data.bmr ? Math.round(data.bmr) : '-';
      
      // 알레르기 정보 표시
      if (data.allergies && data.allergies.length > 0) {
        if (savedAllergySummary) savedAllergySummary.textContent = data.allergies.join(', ');
        // 알레르기 체크박스에도 표시
        data.allergies.forEach(allergy => {
          const checkbox = document.querySelector(`input[name="allergy"][value="${allergy}"]`);
          if (checkbox) checkbox.checked = true;
        });
        // 저장된 알레르기 정보 섹션 표시
        displaySavedAllergies(data.allergies);
      } else {
        if (savedAllergySummary) savedAllergySummary.textContent = '없음';
      }
      
      // 업데이트 날짜 표시
      if (data.updatedAt) {
        const date = data.updatedAt.toDate();
        updateDate.textContent = date.toLocaleDateString('ko-KR') + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      }
      
      savedInfo.classList.remove('hidden');
    }
  } catch (error) {
    console.error('기록 불러오기 오류:', error);
  }
}

// 저장된 알레르기 정보 표시
function displaySavedAllergies(allergies) {
  if (!allergies || allergies.length === 0) {
    if (savedAllergyInfo) savedAllergyInfo.classList.add('hidden');
    return;
  }
  
  if (savedAllergyList) {
    savedAllergyList.innerHTML = '';
    allergies.forEach(allergy => {
      const tag = document.createElement('span');
      tag.className = 'allergy-tag';
      tag.textContent = allergy;
      savedAllergyList.appendChild(tag);
    });
  }
  
  if (savedAllergyInfo) savedAllergyInfo.classList.remove('hidden');
}

// 알레르기 정보 저장 버튼 이벤트 리스너
if (saveAllergyBtn) {
  saveAllergyBtn.addEventListener('click', async () => {
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = '/index.html';
      return;
    }
    
    if (!db) {
      alert('Firebase가 초기화되지 않았습니다.');
      return;
    }
    
    const allergyCheckboxes = document.querySelectorAll('input[name="allergy"]:checked');
    const allergies = Array.from(allergyCheckboxes).map(cb => cb.value);
    
    try {
      const userRecordRef = doc(db, 'userRecords', currentUser.uid);
      await setDoc(userRecordRef, {
        allergies: allergies,
        allergyUpdatedAt: serverTimestamp()
      }, { merge: true });
      
      console.log('✅ 알레르기 정보가 저장되었습니다.');
      alert('✅ 알레르기 정보가 저장되었습니다!');
      
      // 저장된 알레르기 정보 표시
      displaySavedAllergies(allergies);
      
      // 저장된 정보 섹션 업데이트
      await loadSavedRecord();
    } catch (error) {
      console.error('알레르기 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  });
} else {
  console.error('알레르기 저장 버튼을 찾을 수 없습니다. HTML에 버튼이 있는지 확인해주세요.');
}

// 돌아가기 버튼
backBtn.addEventListener('click', () => {
  window.location.href = '/index.html';
});

// 날짜별 기록 데이터 불러오기
async function loadChartData() {
  if (!currentUser || !db || !startDateInput.value || !endDateInput.value) {
    return;
  }
  
  try {
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    const dailyRecordsRef = collection(db, 'userRecords', currentUser.uid, 'dailyRecords');
    const q = query(
      dailyRecordsRef,
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    
    const dates = [];
    const weights = [];
    const bmis = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.date && data.weight && data.bmi) {
        dates.push(data.date);
        weights.push(data.weight);
        bmis.push(data.bmi);
      }
    });
    
    if (dates.length === 0) {
      alert('선택한 날짜 범위에 기록이 없습니다.');
      return;
    }
    
    // 그래프 그리기
    drawChart(dates, weights, bmis);
  } catch (error) {
    console.error('그래프 데이터 불러오기 오류:', error);
    alert('그래프 데이터를 불러오는 중 오류가 발생했습니다.');
  }
}

// 그래프 그리기
function drawChart(dates, weights, bmis) {
  const ctx = chartCanvas.getContext('2d');
  
  // 기존 차트가 있으면 제거
  if (weightBmiChart) {
    weightBmiChart.destroy();
  }
  
  // 날짜 포맷팅 (MM/DD 형식)
  const formattedDates = dates.map(date => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  
  weightBmiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: formattedDates,
      datasets: [
        {
          label: '몸무게 (kg)',
          data: weights,
          borderColor: '#FF8C69',
          backgroundColor: 'rgba(255, 140, 105, 0.1)',
          yAxisID: 'y',
          tension: 0.4,
          fill: false
        },
        {
          label: 'BMI',
          data: bmis,
          borderColor: '#4A90E2',
          backgroundColor: 'rgba(74, 144, 226, 0.1)',
          yAxisID: 'y1',
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: '몸무게 및 BMI 추이',
          font: {
            size: 18,
            weight: 'bold'
          },
          color: '#5C4033'
        },
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          enabled: true
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: '날짜'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '몸무게 (kg)'
          },
          beginAtZero: false
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'BMI'
          },
          beginAtZero: false,
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}

// 그래프 불러오기 버튼 클릭
if (loadChartBtn) {
  loadChartBtn.addEventListener('click', async () => {
    if (!startDateInput.value || !endDateInput.value) {
      alert('시작 날짜와 종료 날짜를 모두 선택해주세요.');
      return;
    }
    
    if (startDateInput.value > endDateInput.value) {
      alert('시작 날짜가 종료 날짜보다 늦을 수 없습니다.');
      return;
    }
    
    await loadChartData();
  });
}

// 사용자 인증 상태 확인
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log('✅ 사용자 로그인:', user.email);
      await loadSavedRecord();
      initializeDateRange();
      // 기본 그래프 로드
      await loadChartData();
    } else {
      currentUser = null;
      console.warn('⚠️ 사용자가 로그인하지 않았습니다.');
      alert('로그인이 필요합니다.');
      window.location.href = '/index.html';
    }
  });
} else {
  console.warn('⚠️ Firebase 인증이 설정되지 않았습니다.');
}


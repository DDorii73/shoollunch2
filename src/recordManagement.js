// 기록 관리 페이지
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, orderBy, updateDoc } from 'firebase/firestore';

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

// 월별 음식 기록 관련 DOM 요소
const monthSelect = document.getElementById('month-select');
const loadFoodRecordsBtn = document.getElementById('load-food-records-btn');
const foodRecordsContainer = document.getElementById('food-records-container');

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

// 월 선택 드롭다운 초기화 (최근 12개월)
function initializeMonthSelector() {
  if (!monthSelect) return;
  
  monthSelect.innerHTML = '<option value="">월을 선택하세요</option>';
  
  const today = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    const monthLabel = `${year}년 ${month}월`;
    
    const option = document.createElement('option');
    option.value = monthStr;
    option.textContent = monthLabel;
    monthSelect.appendChild(option);
  }
}

// 월별 음식 기록 불러오기
async function loadMonthlyFoodRecords() {
  if (!currentUser || !monthSelect.value) {
    alert('월을 선택해주세요.');
    return;
  }
  
  const selectedMonth = monthSelect.value; // "YYYY-MM" 형식
  const [year, month] = selectedMonth.split('-').map(Number);
  
  // 해당 월의 시작일과 종료일 계산
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // 해당 월의 마지막 날
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  try {
    foodRecordsContainer.innerHTML = '<p>기록을 불러오는 중...</p>';
    
    const recordsRef = collection(db, 'foodRecords');
    // 인덱스 없이 작동하도록 userId만으로 필터링하고 클라이언트 측에서 날짜 필터링
    const q = query(
      recordsRef,
      where('userId', '==', currentUser.uid)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      foodRecordsContainer.innerHTML = `<p class="no-records-message">${year}년 ${month}월에는 기록된 음식이 없습니다.</p>`;
      return;
    }
    
    // 날짜별로 그룹화하고 해당 월의 데이터만 필터링
    const recordsByDate = {};
    const docIdsByDate = {}; // 문서 ID 저장용
    querySnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      const date = data.date;
      const docId = docSnapshot.id;
      
      // 해당 월의 데이터만 포함
      if (date >= startDateStr && date <= endDateStr) {
        if (!recordsByDate[date]) {
          recordsByDate[date] = {
            lunch: null,
            snack: null
          };
          docIdsByDate[date] = {
            lunch: null,
            snack: null
          };
        }
        
        if (data.type === 'lunch') {
          recordsByDate[date].lunch = data;
          docIdsByDate[date].lunch = docId;
        } else if (data.type === 'snack') {
          recordsByDate[date].snack = data;
          docIdsByDate[date].snack = docId;
        }
      }
    });
    
    // 날짜별로 정렬 (최신순)
    const sortedDates = Object.keys(recordsByDate).sort((a, b) => b.localeCompare(a));
    
    if (sortedDates.length === 0) {
      foodRecordsContainer.innerHTML = `<p class="no-records-message">${year}년 ${month}월에는 기록된 음식이 없습니다.</p>`;
      return;
    }
    
    // HTML 생성
    let html = `<h3 style="margin-bottom: 20px;">${year}년 ${month}월 음식 기록</h3>`;
    
    sortedDates.forEach(date => {
      const records = recordsByDate[date];
      const docIds = docIdsByDate[date];
      const dateObj = new Date(date);
      const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
      const formattedDate = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dayOfWeek})`;
      
      html += `<div class="daily-food-record" data-date="${date}" style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border: 2px solid var(--border-color);">`;
      html += `<h4 style="margin-bottom: 15px; color: var(--text-color);">📅 ${formattedDate}</h4>`;
      
      // 점심 기록
      if (records.lunch) {
        html += `<div style="margin-bottom: 15px; position: relative;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
        html += `<strong style="color: var(--primary-color);">🍱 점심:</strong>`;
        html += `<button class="edit-lunch-btn" data-date="${date}" data-doc-id="${docIds.lunch}" style="background: var(--primary-color); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">수정</button>`;
        html += `</div>`;
        html += `<ul style="margin-top: 8px; padding-left: 20px;">`;
        
        if (records.lunch.menuItems && records.lunch.menuItems.length > 0) {
          records.lunch.menuItems.forEach(item => {
            if (item.count > 0) {
              html += `<li>${item.name} ${item.count}인분</li>`;
            }
          });
        }
        
        if (records.lunch.totalCalories) {
          html += `<li style="margin-top: 5px; font-weight: 600; color: var(--primary-color);">총 칼로리: ${records.lunch.totalCalories}kcal</li>`;
        }
        
        html += `</ul>`;
        html += `</div>`;
      }
      
      // 간식 기록
      if (records.snack) {
        html += `<div style="position: relative;">`;
        html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
        html += `<strong style="color: var(--secondary-color);">🍪 간식:</strong>`;
        html += `<button class="edit-snack-btn" data-date="${date}" data-doc-id="${docIds.snack}" style="background: var(--secondary-color); color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">수정</button>`;
        html += `</div>`;
        html += `<ul style="margin-top: 8px; padding-left: 20px;">`;
        
        if (records.snack.snacks && records.snack.snacks.length > 0) {
          records.snack.snacks.forEach(snack => {
            html += `<li>${snack}</li>`;
          });
        } else {
          html += `<li>기록 없음</li>`;
        }
        
        html += `</ul>`;
        html += `</div>`;
      }
      
      // 기록이 없는 경우
      if (!records.lunch && !records.snack) {
        html += `<p style="color: var(--text-light);">기록 없음</p>`;
      }
      
      html += `</div>`;
    });
    
    foodRecordsContainer.innerHTML = html;
    
    // 수정 버튼 이벤트 리스너 추가
    setupEditButtons();
    
  } catch (error) {
    console.error('월별 음식 기록 불러오기 오류:', error);
    foodRecordsContainer.innerHTML = `<p style="color: red;">기록을 불러오는 중 오류가 발생했습니다: ${error.message}</p>`;
  }
}

// 수정 버튼 이벤트 리스너 설정
function setupEditButtons() {
  // 점심 수정 버튼
  document.querySelectorAll('.edit-lunch-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const date = e.target.dataset.date;
      const docId = e.target.dataset.docId;
      await openEditLunchModal(date, docId);
    });
  });
  
  // 간식 수정 버튼
  document.querySelectorAll('.edit-snack-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const date = e.target.dataset.date;
      const docId = e.target.dataset.docId;
      await openEditSnackModal(date, docId);
    });
  });
}

// 점심 수정 모달 열기
async function openEditLunchModal(date, docId) {
  try {
    // 기존 기록 불러오기
    const docRef = doc(db, 'foodRecords', docId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      alert('기록을 찾을 수 없습니다.');
      return;
    }
    
    const recordData = docSnap.data();
    const menuItems = recordData.menuItems || [];
    
    // 모달에 데이터 표시
    const lunchMenuEditList = document.getElementById('lunch-menu-edit-list');
    lunchMenuEditList.innerHTML = '';
    
    // 각 메뉴 아이템의 칼로리 정보 저장 (기존 기록에서 가져오거나 추정)
    const menuCaloriesMap = {};
    
    menuItems.forEach(item => {
      // 기존 기록에 칼로리 정보가 있으면 사용, 없으면 추정
      const itemCalories = item.calories ? (item.calories / item.count) : estimateCalories(item.name);
      menuCaloriesMap[item.name] = itemCalories;
      
      const menuItemDiv = document.createElement('div');
      menuItemDiv.className = 'menu-item';
      menuItemDiv.style.marginBottom = '10px';
      menuItemDiv.style.display = 'flex';
      menuItemDiv.style.justifyContent = 'space-between';
      menuItemDiv.style.alignItems = 'center';
      menuItemDiv.innerHTML = `
        <span style="flex: 1;">${item.name}</span>
        <div style="display: flex; align-items: center; gap: 5px;">
          <button class="count-btn minus" data-menu="${item.name}">-</button>
          <input type="number" class="count-input" id="edit-count-${item.name}" 
                 value="${item.count}" min="0" max="10" 
                 data-menu="${item.name}" data-calories="${itemCalories}" style="width: 60px; text-align: center;" />
          <button class="count-btn plus" data-menu="${item.name}">+</button>
        </div>
      `;
      lunchMenuEditList.appendChild(menuItemDiv);
    });
    
    // 모달에 칼로리 맵 저장
    const modal = document.getElementById('edit-lunch-modal');
    modal.dataset.menuCalories = JSON.stringify(menuCaloriesMap);
    
    // 버튼 이벤트 리스너
    lunchMenuEditList.querySelectorAll('.count-btn.plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const menuName = e.target.dataset.menu;
        const input = document.getElementById(`edit-count-${menuName}`);
        const currentValue = parseInt(input.value) || 0;
        if (currentValue < 10) {
          input.value = currentValue + 1;
          updateLunchEditCalories();
        }
      });
    });
    
    lunchMenuEditList.querySelectorAll('.count-btn.minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const menuName = e.target.dataset.menu;
        const input = document.getElementById(`edit-count-${menuName}`);
        const currentValue = parseInt(input.value) || 0;
        if (currentValue > 0) {
          input.value = currentValue - 1;
          updateLunchEditCalories();
        }
      });
    });
    
    lunchMenuEditList.querySelectorAll('.count-input').forEach(input => {
      input.addEventListener('change', () => {
        updateLunchEditCalories();
      });
    });
    
    // 총 칼로리 계산
    updateLunchEditCalories();
    
    // 모달 표시
    const modal = document.getElementById('edit-lunch-modal');
    modal.dataset.date = date;
    modal.dataset.docId = docId;
    modal.classList.remove('hidden');
    
  } catch (error) {
    console.error('점심 기록 불러오기 오류:', error);
    alert('기록을 불러오는 중 오류가 발생했습니다.');
  }
}

// 간식 수정 모달 열기
async function openEditSnackModal(date, docId) {
  try {
    // 기존 기록 불러오기
    const docRef = doc(db, 'foodRecords', docId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      alert('기록을 찾을 수 없습니다.');
      return;
    }
    
    const recordData = docSnap.data();
    const snacks = recordData.snacks || [];
    
    // 모달에 데이터 표시
    const snackEditList = document.getElementById('snack-edit-list');
    snackEditList.innerHTML = '';
    
    snacks.forEach((snack, index) => {
      const snackItem = document.createElement('div');
      snackItem.className = 'food-item';
      snackItem.style.display = 'flex';
      snackItem.style.justifyContent = 'space-between';
      snackItem.style.alignItems = 'center';
      snackItem.style.marginBottom = '8px';
      snackItem.innerHTML = `
        <span>${snack}</span>
        <button class="remove-btn" data-index="${index}" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">삭제</button>
      `;
      snackEditList.appendChild(snackItem);
    });
    
    // 삭제 버튼 이벤트 리스너
    snackEditList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        const snackItems = Array.from(snackEditList.children);
        snackItems[index].remove();
      });
    });
    
    // 모달 표시
    const modal = document.getElementById('edit-snack-modal');
    modal.dataset.date = date;
    modal.dataset.docId = docId;
    modal.classList.remove('hidden');
    
  } catch (error) {
    console.error('간식 기록 불러오기 오류:', error);
    alert('기록을 불러오는 중 오류가 발생했습니다.');
  }
}

// 점심 수정 모달의 총 칼로리 업데이트
function updateLunchEditCalories() {
  const modal = document.getElementById('edit-lunch-modal');
  const menuCaloriesMap = JSON.parse(modal.dataset.menuCalories || '{}');
  const menuItems = [];
  const lunchMenuEditList = document.getElementById('lunch-menu-edit-list');
  
  lunchMenuEditList.querySelectorAll('.menu-item').forEach(item => {
    const menuName = item.querySelector('span').textContent;
    const countInput = document.getElementById(`edit-count-${menuName}`);
    const count = parseInt(countInput.value) || 0;
    
    if (count > 0) {
      menuItems.push({ name: menuName, count: count });
    }
  });
  
  // 총 칼로리 계산 (기존 기록의 칼로리 정보 사용)
  let totalCalories = 0;
  menuItems.forEach(item => {
    // 각 메뉴 아이템의 칼로리는 저장된 맵에서 가져오거나 추정
    const itemCalories = menuCaloriesMap[item.name] || estimateCalories(item.name);
    totalCalories += itemCalories * item.count;
  });
  
  document.getElementById('lunch-edit-total-calories').textContent = Math.round(totalCalories);
}

// 간단한 칼로리 추정 함수
function estimateCalories(menuName) {
  const lowerName = menuName.toLowerCase();
  
  if (lowerName.includes('밥')) return 210;
  if (lowerName.includes('국') || lowerName.includes('탕')) return 50;
  if (lowerName.includes('찌개') || lowerName.includes('전골')) return 120;
  if (lowerName.includes('나물') || lowerName.includes('무침')) return 30;
  if (lowerName.includes('볶음')) return 150;
  if (lowerName.includes('구이') || lowerName.includes('조림')) return 180;
  if (lowerName.includes('튀김')) return 200;
  if (lowerName.includes('김치')) return 15;
  
  return 100;
}

// 점심 수정 저장
async function saveLunchEdit() {
  const modal = document.getElementById('edit-lunch-modal');
  const date = modal.dataset.date;
  const docId = modal.dataset.docId;
  
  if (!date || !docId) {
    alert('오류가 발생했습니다.');
    return;
  }
  
  try {
    // 수정된 메뉴 아이템 수집
    const modal = document.getElementById('edit-lunch-modal');
    const menuCaloriesMap = JSON.parse(modal.dataset.menuCalories || '{}');
    const menuItems = [];
    const lunchMenuEditList = document.getElementById('lunch-menu-edit-list');
    
    lunchMenuEditList.querySelectorAll('.menu-item').forEach(item => {
      const menuName = item.querySelector('span').textContent;
      const countInput = document.getElementById(`edit-count-${menuName}`);
      const count = parseInt(countInput.value) || 0;
      
      if (count > 0) {
        // 저장된 칼로리 정보 사용 또는 추정
        const itemCalories = menuCaloriesMap[menuName] || estimateCalories(menuName);
        menuItems.push({
          name: menuName,
          count: count,
          calories: itemCalories * count
        });
      }
    });
    
    // 총 칼로리 계산
    const totalCalories = menuItems.reduce((sum, item) => sum + item.calories, 0);
    
    // records 객체 생성
    const records = {};
    menuItems.forEach(item => {
      records[item.name] = item.count;
    });
    
    // Firebase 업데이트
    const docRef = doc(db, 'foodRecords', docId);
    await updateDoc(docRef, {
      menuItems: menuItems,
      records: records,
      totalCalories: Math.round(totalCalories),
      updatedAt: serverTimestamp()
    });
    
    alert('✅ 점심 기록이 수정되었습니다!');
    modal.classList.add('hidden');
    
    // 기록 다시 불러오기
    await loadMonthlyFoodRecords();
    
  } catch (error) {
    console.error('점심 기록 수정 오류:', error);
    alert('기록 수정 중 오류가 발생했습니다.');
  }
}

// 간식 수정 저장
async function saveSnackEdit() {
  const modal = document.getElementById('edit-snack-modal');
  const date = modal.dataset.date;
  const docId = modal.dataset.docId;
  
  if (!date || !docId) {
    alert('오류가 발생했습니다.');
    return;
  }
  
  try {
    // 수정된 간식 목록 수집
    const snackEditList = document.getElementById('snack-edit-list');
    const snacks = [];
    
    snackEditList.querySelectorAll('.food-item').forEach(item => {
      const snackName = item.querySelector('span').textContent.trim();
      if (snackName) {
        snacks.push(snackName);
      }
    });
    
    // Firebase 업데이트
    const docRef = doc(db, 'foodRecords', docId);
    await updateDoc(docRef, {
      snacks: snacks,
      count: snacks.length,
      updatedAt: serverTimestamp()
    });
    
    alert('✅ 간식 기록이 수정되었습니다!');
    modal.classList.add('hidden');
    
    // 기록 다시 불러오기
    await loadMonthlyFoodRecords();
    
  } catch (error) {
    console.error('간식 기록 수정 오류:', error);
    alert('기록 수정 중 오류가 발생했습니다.');
  }
}

// 모달 닫기 및 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
  // 점심 모달 닫기
  const closeLunchModal = document.getElementById('close-lunch-modal');
  const cancelLunchEditBtn = document.getElementById('cancel-lunch-edit-btn');
  const saveLunchEditBtn = document.getElementById('save-lunch-edit-btn');
  
  if (closeLunchModal) {
    closeLunchModal.addEventListener('click', () => {
      document.getElementById('edit-lunch-modal').classList.add('hidden');
    });
  }
  
  if (cancelLunchEditBtn) {
    cancelLunchEditBtn.addEventListener('click', () => {
      document.getElementById('edit-lunch-modal').classList.add('hidden');
    });
  }
  
  if (saveLunchEditBtn) {
    saveLunchEditBtn.addEventListener('click', saveLunchEdit);
  }
  
  // 간식 모달 닫기
  const closeSnackModal = document.getElementById('close-snack-modal');
  const cancelSnackEditBtn = document.getElementById('cancel-snack-edit-btn');
  const saveSnackEditBtn = document.getElementById('save-snack-edit-btn');
  const snackEditInput = document.getElementById('snack-edit-input');
  const addSnackEditBtn = document.getElementById('add-snack-edit-btn');
  
  if (closeSnackModal) {
    closeSnackModal.addEventListener('click', () => {
      document.getElementById('edit-snack-modal').classList.add('hidden');
    });
  }
  
  if (cancelSnackEditBtn) {
    cancelSnackEditBtn.addEventListener('click', () => {
      document.getElementById('edit-snack-modal').classList.add('hidden');
    });
  }
  
  if (saveSnackEditBtn) {
    saveSnackEditBtn.addEventListener('click', saveSnackEdit);
  }
  
  // 간식 추가 버튼
  if (addSnackEditBtn && snackEditInput) {
    addSnackEditBtn.addEventListener('click', () => {
      const snackName = snackEditInput.value.trim();
      if (!snackName) return;
      
      const snackEditList = document.getElementById('snack-edit-list');
      const snackItem = document.createElement('div');
      snackItem.className = 'food-item';
      snackItem.style.display = 'flex';
      snackItem.style.justifyContent = 'space-between';
      snackItem.style.alignItems = 'center';
      snackItem.style.marginBottom = '8px';
      const index = snackEditList.children.length;
      snackItem.innerHTML = `
        <span>${snackName}</span>
        <button class="remove-btn" data-index="${index}" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;">삭제</button>
      `;
      snackEditList.appendChild(snackItem);
      snackEditInput.value = '';
      
      // 삭제 버튼 이벤트 리스너
      snackItem.querySelector('.remove-btn').addEventListener('click', (e) => {
        snackItem.remove();
      });
    });
    
    snackEditInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addSnackEditBtn.click();
      }
    });
  }
});

// 월별 음식 기록 불러오기 버튼 클릭
if (loadFoodRecordsBtn) {
  loadFoodRecordsBtn.addEventListener('click', async () => {
    await loadMonthlyFoodRecords();
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
      initializeMonthSelector();
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


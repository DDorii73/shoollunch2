// 학생 활동 관리
// ChatGPT API를 사용한 챗봇 및 음식 기록 기능
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';

// 오늘의 날짜 가져오기 (YYYY-MM-DD 형식)
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// 음식 칼로리 데이터베이스 (간단한 예시)
const foodCalories = {
  '밥': 210,
  '된장찌개': 120,
  '김치': 15,
  '계란후라이': 90,
  '시금치나물': 30,
  '미역국': 25,
  '불고기': 180,
  '비빔밥': 350,
  '김밥': 250,
  '라면': 500,
  '떡볶이': 300,
  '순두부찌개': 150,
  '제육볶음': 200,
  '닭볶음탕': 250,
  '잡채': 180,
  '콩나물국': 20,
  '시래기국': 30,
  '된장국': 25,
  '계란국': 40,
  '어묵국': 50
};

// 오늘의 급식 메뉴 (NEIS API에서 가져옴)
let todayMenu = [];
let nutritionInfo = null; // 영양 정보 저장
let totalCalories = 0; // 총 칼로리

// 알레르기 번호를 이름으로 변환하는 함수
function convertAllergyNumbersToNames(allergyNumbers) {
  if (!allergyNumbers || allergyNumbers.trim() === '') return '';
  
  const allergyMap = {
    '1': '난류', '2': '우유', '3': '메밀', '4': '땅콩', '5': '대두',
    '6': '밀', '7': '고등어', '8': '게', '9': '새우', '10': '돼지고기',
    '11': '복숭아', '12': '토마토', '13': '아황산류', '14': '호두', '15': '닭고기',
    '16': '쇠고기', '17': '오징어', '18': '조개류(굴,전복,홍합 포함)', '19': '잣'
  };
  
  // 숫자를 분리하고 이름으로 변환
  const numbers = allergyNumbers.split('.').map(n => n.trim()).filter(n => n);
  const names = numbers.map(num => allergyMap[num] || `알레르기${num}번`).filter(Boolean);
  
  return names.join(', ');
}

// 오늘의 급식 메뉴 가져오기
async function fetchTodayMenu() {
  const today = new Date();
  const apiKey = import.meta.env.VITE_NEIS_API_KEY;
  const atptOfcdcScCode = import.meta.env.VITE_NEIS_ATPT_OFCDC_SC_CODE;
  const sdSchulCode = import.meta.env.VITE_NEIS_SD_SCHUL_CODE;
  
  // 디버깅: 환경변수 확인
  console.log('🔍 NEIS API 환경변수 확인:');
  console.log('  API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : '❌ 없음');
  console.log('  교육청 코드:', atptOfcdcScCode || '❌ 없음');
  console.log('  학교 코드:', sdSchulCode || '❌ 없음');
  
  if (!apiKey || !atptOfcdcScCode || !sdSchulCode) {
    console.warn('⚠️ NEIS API 설정이 없어 기본 메뉴를 사용합니다.');
    console.warn('💡 .env 파일에 다음 값들이 설정되어 있는지 확인하세요:');
    console.warn('   - VITE_NEIS_API_KEY');
    console.warn('   - VITE_NEIS_ATPT_OFCDC_SC_CODE');
    console.warn('   - VITE_NEIS_SD_SCHUL_CODE');
    // 기본 메뉴로 폴백
    todayMenu = [
      { name: '밥', calories: foodCalories['밥'] || 210 },
      { name: '된장찌개', calories: foodCalories['된장찌개'] || 120 },
      { name: '김치', calories: foodCalories['김치'] || 15 },
      { name: '계란후라이', calories: foodCalories['계란후라이'] || 90 },
      { name: '시금치나물', calories: foodCalories['시금치나물'] || 30 }
    ];
    return;
  }
  
  try {
    // 오늘 날짜를 YYYYMMDD 형식으로 변환
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    console.log('📅 조회할 날짜:', `${year}-${month}-${day}`, `(${dateStr})`);
    
    // NEIS API 호출 (직접 호출 - NEIS API는 CORS를 허용함)
    const apiUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${apiKey}&Type=json&ATPT_OFCDC_SC_CODE=${atptOfcdcScCode}&SD_SCHUL_CODE=${sdSchulCode}&MLSV_YMD=${dateStr}`;
    
    console.log('🌐 NEIS API 호출:', apiUrl);
    
    const response = await fetch(apiUrl);
    
    console.log('📡 API 응답 상태:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 호출 실패:', errorText);
      throw new Error(`HTTP 오류: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📦 NEIS API 응답 데이터:', JSON.stringify(data, null, 2));
    
    // API 응답 파싱
    // NEIS API 응답 구조 확인
    console.log('🔍 응답 구조 분석:', {
      hasMealServiceDietInfo: !!data.mealServiceDietInfo,
      isArray: Array.isArray(data.mealServiceDietInfo),
      length: data.mealServiceDietInfo?.length,
      hasResult: !!data.RESULT,
      resultCode: data.RESULT?.CODE,
      resultMessage: data.RESULT?.MESSAGE
    });
    
    // RESULT가 있고 오류인 경우
    if (data.RESULT && data.RESULT.CODE !== 'INFO-000') {
      console.warn('⚠️ NEIS API 오류:', data.RESULT.CODE, data.RESULT.MESSAGE);
      todayMenu = getDefaultMenu();
      return;
    }
    
    // mealServiceDietInfo가 배열인 경우
    if (data.mealServiceDietInfo && Array.isArray(data.mealServiceDietInfo)) {
      // row 데이터가 있는 부분 찾기 (보통 인덱스 1에 있음)
      let rowData = null;
      
      // 인덱스 1부터 확인 (인덱스 0은 head 정보)
      for (let i = 1; i < data.mealServiceDietInfo.length; i++) {
        if (data.mealServiceDietInfo[i] && data.mealServiceDietInfo[i].row && Array.isArray(data.mealServiceDietInfo[i].row) && data.mealServiceDietInfo[i].row.length > 0) {
          rowData = data.mealServiceDietInfo[i];
          break;
        }
      }
      
      if (rowData && rowData.row && rowData.row.length > 0) {
        const menuData = rowData.row[0];
        console.log('📋 메뉴 데이터:', menuData);
        
        const menuText = menuData.DDISH_NM || '';
        const calInfo = menuData.CAL_INFO || '';
        const ntrInfo = menuData.NTR_INFO || ''; // 영양 정보
        const orplcInfo = menuData.ORPLC_INFO || ''; // 원산지 정보
        
        console.log('🍽️ 원본 메뉴 텍스트:', menuText);
        console.log('🔥 칼로리 정보:', calInfo);
        console.log('💊 영양 정보:', ntrInfo);
        console.log('🌾 원산지 정보:', orplcInfo);
        
        // 총 칼로리 파싱
        if (calInfo) {
          const calMatch = calInfo.match(/(\d+(?:\.\d+)?)\s*kcal/i);
          if (calMatch) {
            totalCalories = parseFloat(calMatch[1]);
          }
        }
        
        // 영양 정보 파싱
        if (ntrInfo) {
          nutritionInfo = {};
          const nutritionPairs = ntrInfo.split('<br/>').map(item => item.trim()).filter(item => item);
          nutritionPairs.forEach(pair => {
            const match = pair.match(/(.+?)\s*:\s*(.+)/);
            if (match) {
              const key = match[1].trim();
              const value = match[2].trim();
              nutritionInfo[key] = value;
            }
          });
          console.log('📊 파싱된 영양 정보:', nutritionInfo);
        }
        
        if (!menuText) {
          console.warn('⚠️ 메뉴 텍스트가 없습니다. 기본 메뉴를 사용합니다.');
          todayMenu = getDefaultMenu();
          return;
        }
        
        // 메뉴 파싱 (HTML 태그 제거 및 분리)
        // NEIS API는 <br/> 또는 <br>로 메뉴를 구분함
        let menuItems = menuText
          .replace(/<br\s*\/?>/gi, '|')  // <br/> 또는 <br>을 |로 변경
          .replace(/<[^>]*>/g, '')        // 나머지 HTML 태그 제거
          .split('|')                     // |로 분리
          .map(item => item.trim())
          .filter(item => item.length > 0 && item !== '');
        
        // 만약 |로 분리되지 않았다면 ,로 시도
        if (menuItems.length === 1 && menuItems[0].includes(',')) {
          menuItems = menuItems[0].split(',').map(item => item.trim()).filter(item => item.length > 0);
        }
        
        console.log('📝 파싱된 메뉴 항목:', menuItems);
        
        // 메뉴 항목을 객체로 변환
        const parsedMenuItems = menuItems
          .map(item => {
            // 모든 괄호 찾기
            const allParentheses = item.match(/\(([^)]+)\)/g) || [];
            
            // 알레르기 정보 추출 (숫자와 점(.)만 포함된 괄호만 추출)
            // 예: "(공)(1.2.5)" -> "(1.2.5)"만 추출
            let allergyInfo = '';
            for (const paren of allParentheses) {
              const content = paren.replace(/[()]/g, ''); // 괄호 제거
              // 숫자와 점(.)만 포함되어 있는지 확인 (알레르기 번호 형식)
              if (/^[\d.]+$/.test(content.trim())) {
                allergyInfo = content.trim();
                break; // 첫 번째 알레르기 번호만 사용
              }
            }
            
            // 괄호 안의 내용 제거 (알레르기 정보 등)
            // 단, 알레르기 번호가 아닌 괄호(예: "(공)")도 제거
            let cleanName = item.replace(/\([^)]*\)/g, '').trim();
            
            // 메뉴 이름 뒤의 숫자 제거 (단위가 있거나 개수가 의미가 있는 경우는 제외)
            // 단위가 있는 경우: 공기, 개, 그릇, 접시, 마리, 조각, 쪽 등
            const unitPattern = /(공기|개|그릇|접시|마리|조각|쪽|장|줄|포기|송이|알|봉지|팩|병|컵|잔|인분)\s*\d*$/i;
            
            // 개수가 의미가 있는 메뉴 패턴 (과일류, 구이류 등)
            // 예: "귤1", "고구마 구이1", "사과1", "옥수수 구이1" 등은 숫자 유지
            // "된장찌개1", "김치찌개2" 등은 숫자 제거
            const countablePattern = /(구이|과일|귤|사과|배|바나나|오렌지|포도|딸기|참외|수박|멜론|키위|망고|파인애플|자두|복숭아|살구|체리|감|감귤|한라봉|레몬|라임|석류|무화과|대추|밤|호두|땅콩|잣|아몬드|캐슈넛|피스타치오|마카다미아|브라질넛|헤이즐넛|피칸|피넛|해바라기씨|호박씨|참깨|들깨|깨|콩|완두콩|강낭콩|병아리콩|렌틸콩|녹두|팥|서리태|검은콩|고구마|옥수수|감자|계란|쿠키|과자|비스킷|크래커|스낵|사탕|젤리|초콜릿|초코|캔디|껌)\d*$/i;
            
            if (!unitPattern.test(cleanName) && !countablePattern.test(cleanName)) {
              // 단위가 없고 개수가 의미가 없는 경우, 메뉴 이름 뒤의 숫자 제거
              // 예: "된장찌개1" -> "된장찌개", "김치찌개2" -> "김치찌개"
              cleanName = cleanName.replace(/\d+$/, '').trim();
            }
            
            if (!cleanName || cleanName.length === 0) return null;
            
            // 알레르기 번호를 이름으로 변환
            const allergyNames = convertAllergyNumbersToNames(allergyInfo);
            
            return {
              name: cleanName,
              calories: 0, // 각 음식마다 칼로리는 표시하지 않음 (총 칼로리만 사용)
              allergyInfo: allergyInfo, // 원본 번호 정보 (예: "5.6.16")
              allergyNames: allergyNames // 변환된 이름 정보 (예: "대두, 밀, 쇠고기")
            };
          })
          .filter(item => item !== null && item.name.length > 0);
        
        if (parsedMenuItems.length > 0) {
          todayMenu = parsedMenuItems;
          console.log('✅ NEIS API에서 급식 메뉴를 가져왔습니다:', todayMenu.map(m => m.name).join(', '), `총 칼로리: ${totalCalories}kcal`);
        } else {
          console.warn('⚠️ 파싱된 메뉴가 없습니다. 기본 메뉴를 사용합니다.');
          todayMenu = getDefaultMenu();
        }
      } else {
        console.warn('⚠️ 오늘은 급식 데이터가 없습니다. (주말이거나 공휴일일 수 있습니다)');
        console.log('전체 응답 구조:', JSON.stringify(data, null, 2));
        todayMenu = getDefaultMenu();
      }
    } else {
      console.error('❌ 예상치 못한 API 응답 형식');
      console.log('전체 응답:', JSON.stringify(data, null, 2));
      todayMenu = getDefaultMenu();
    }
  } catch (error) {
    console.error('❌ NEIS API 호출 오류:', error);
    todayMenu = getDefaultMenu();
  }
}

// 기본 메뉴 반환 함수
function getDefaultMenu() {
  return [
    { name: '밥', calories: foodCalories['밥'] || 210 },
    { name: '된장찌개', calories: foodCalories['된장찌개'] || 120 },
    { name: '김치', calories: foodCalories['김치'] || 15 },
    { name: '계란후라이', calories: foodCalories['계란후라이'] || 90 },
    { name: '시금치나물', calories: foodCalories['시금치나물'] || 30 }
  ];
}

// 칼로리 추정 함수 (메뉴 이름으로 대략적인 칼로리 추정)
function estimateCalories(menuName) {
  // 메뉴 이름에 포함된 키워드로 칼로리 추정
  const lowerName = menuName.toLowerCase();
  
  if (lowerName.includes('밥') || lowerName.includes('쌀밥')) return 210;
  if (lowerName.includes('국') || lowerName.includes('탕')) return 50;
  if (lowerName.includes('찌개') || lowerName.includes('전골')) return 120;
  if (lowerName.includes('나물') || lowerName.includes('무침')) return 30;
  if (lowerName.includes('볶음')) return 150;
  if (lowerName.includes('구이') || lowerName.includes('조림')) return 180;
  if (lowerName.includes('튀김')) return 200;
  if (lowerName.includes('김치')) return 15;
  
  // 기본값
  return 100;
}

// 챗봇 상태 관리
let chatTurn = 0;
let chatHistory = [];
let lunchRecords = {}; // { '밥': 1, '된장찌개': 2 } 형식
let snackList = [];
let currentUser = null; // 현재 로그인한 사용자
let userBMR = null; // 사용자의 기초대사량
let userBMI = null; // 사용자의 BMI
let userHeight = null; // 사용자의 키 (cm)
let userWeight = null; // 사용자의 몸무게 (kg)
let userTargetWeight = null; // 사용자의 목표 몸무게 (kg)
let userAge = null; // 사용자의 나이
let userGender = null; // 사용자의 성별
let userAllergies = []; // 사용자의 알레르기 정보

// DOM 요소
const chatbotSection = document.getElementById('chatbot-section');
const recordSection = document.getElementById('record-section');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const endChatBtn = document.getElementById('end-chat-btn');
const backBtn = document.getElementById('back-btn');
const lunchMenuList = document.getElementById('lunch-menu-list');
const lunchTotalCalories = document.getElementById('lunch-total-calories');
const snackFoods = document.getElementById('snack-foods');
const snackInput = document.getElementById('snack-input');
const addSnackBtn = document.getElementById('add-snack-btn');
const submitLunchBtn = document.getElementById('submit-lunch-btn');
const submitSnackBtn = document.getElementById('submit-snack-btn');
const newLunchBtn = document.getElementById('new-lunch-btn');
const newSnackBtn = document.getElementById('new-snack-btn');
const nutritionChatbotSection = document.getElementById('nutrition-chatbot-section');
const nutritionChatMessages = document.getElementById('nutrition-chat-messages');
const nutritionChatInput = document.getElementById('nutrition-chat-input');
const nutritionSendBtn = document.getElementById('nutrition-send-btn');
const closeNutritionBtn = document.getElementById('close-nutrition-btn');

// 영양 브리핑 챗봇 상태
let nutritionChatHistory = [];

// ChatGPT API 호출 함수
async function callChatGPTAPI(userMessage) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.error('OpenAI API Key가 설정되지 않았습니다. .env 파일에 VITE_OPENAI_API_KEY를 설정해주세요.');
    return '죄송합니다. 챗봇 서비스가 준비되지 않았습니다. API 키를 설정해주세요.';
  }

  // 대화 히스토리에 사용자 메시지 추가
  chatHistory.push({
    role: 'user',
    content: userMessage
  });

  // 알레르기 위험 메뉴 확인
  const dangerousMenus = userAllergies && userAllergies.length > 0 ? checkAllergyInMenu() : [];
  const allergyWarningText = userAllergies && userAllergies.length > 0
    ? (dangerousMenus.length > 0 
      ? `\n\n학생의 알레르기로 인해 피해야 할 메뉴:\n${dangerousMenus.map((menu, index) => `${index + 1}. ${menu.name}(${menu.allergies.join(', ')})`).join('\n')}`
      : `\n\n학생의 알레르기로 인해 피해야 할 메뉴: 없음 (오늘 급식에는 학생의 알레르기 성분이 포함된 메뉴가 없습니다)`)
    : '';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `당신은 학교 급식 관리 챗봇입니다. 학생들과 친근하고 따뜻하게 대화하며 오늘의 급식에 대해 이야기합니다.

**매우 중요: 알레르기 정보 일관성 유지**
이 웹앱의 기록 관리 탭에 입력된 알레르기 정보를 반드시 확인하고, 한 대화 안에서 절대로 번복하지 마세요.

중요: 이전 대화 히스토리를 반드시 확인하고, 기록 관리 탭에 입력한 학생 정보를 반영하여 일관되게 답변하세요. 
- 이전 대화 히스토리에서 언급한 내용 (알레르기 정보, 건강 상태, 메뉴 추천 등)을 기억하고 일관되게 유지하세요.
- 기록 관리 탭에 입력한 정보 (알레르기, BMR, BMI 등)를 반드시 참고하여 답변하세요.
- 만약 이전 대화에서 알레르기 메뉴를 언급했다면, 나중에 "알레르기를 유발하는 음식이 없다"고 말하지 마세요.
- 대화 히스토리와 아래 제공된 기록 관리 정보를 일관되게 유지하세요.
- **절대로 한 대화 안에서 알레르기가 있다고 했다가 없다고 하지 마세요.**

오늘의 급식 메뉴 정보:
${todayMenu.map((m, i) => {
  const allergyText = m.allergyNames ? ` (알레르기: ${m.allergyNames})` : '';
  return `${i + 1}. ${m.name}${allergyText}`;
}).join('\n')}
총 칼로리: ${totalCalories > 0 ? totalCalories.toFixed(1) : 0}kcal

${userBMR ? `[기록 관리 탭에 입력한 학생 신체 정보]
키: ${userHeight ? `${userHeight}cm` : '정보 없음'}
현재 몸무게: ${userWeight ? `${userWeight}kg` : '정보 없음'}
${userTargetWeight ? `목표 몸무게: ${userTargetWeight}kg` : ''}
${userAge ? `나이: ${userAge}세` : ''}
${userGender ? `성별: ${userGender === 'male' ? '남성' : '여성'}` : ''}
기초대사량(BMR): ${Math.round(userBMR)}kcal/일
BMI: ${userBMI ? userBMI.toFixed(1) : '정보 없음'}
${userTargetWeight && userWeight ? `목표 몸무게까지: ${userWeight > userTargetWeight ? `${(userWeight - userTargetWeight).toFixed(1)}kg 감량 필요` : userWeight < userTargetWeight ? `${(userTargetWeight - userWeight).toFixed(1)}kg 증량 필요` : '목표 달성!'}` : ''}

식사 비율 기준 (BMR 기준):
- 아침: ${Math.round(userBMR * 0.25)}kcal (25%)
- 점심: ${Math.round(userBMR * 0.35)}kcal (35%)
- 저녁: ${Math.round(userBMR * 0.30)}kcal (30%)
- 간식: ${Math.round(userBMR * 0.10)}kcal (10%)

중요: 학생의 키, 현재 몸무게, 목표 몸무게를 고려하여 답변해주세요.
${userTargetWeight && userWeight ? `- 현재 몸무게(${userWeight}kg)와 목표 몸무게(${userTargetWeight}kg)를 비교하여 적절한 식단 조언을 제공하세요.` : ''}
- 급식 칼로리가 기초대사량의 점심 비율(${Math.round(userBMR * 0.35)}kcal, 35%)과 비교하여 적절한지 평가하고 조언해주세요.
- 목표 몸무게 달성을 위한 식단 조언을 제공하세요.` : ''}

${userAllergies.length > 0 ? `[기록 관리 탭에 입력한 학생 정보]
학생 이름: ${currentUser?.displayName || '학생'}
학생의 알레르기 정보 (기존에 입력한 정보 - 반드시 참고해야 함):
${userAllergies.map((allergy, index) => `${index + 1}. ${allergy}`).join('\n')}
${allergyWarningText}

**매우 중요: 알레르기 정보 일관성 유지**
이 웹앱의 기록 관리 탭에 입력된 알레르기 정보를 반드시 확인하고, 한 대화 안에서 절대로 번복하지 마세요.

1. **알레르기 정보 확인 방법:**
   - 위의 "학생의 알레르기 정보" 목록을 확인하세요. 이는 기록 관리 탭에 입력된 실제 정보입니다.
   - 위의 "학생의 알레르기로 인해 피해야 할 메뉴" 목록을 확인하세요.
   - 이전 대화 히스토리에서 이미 언급한 알레르기 정보를 확인하세요.

2. **알레르기 정보 제공 규칙:**
   건강 상태에 대한 질문에 학생이 답변하면:
   - 먼저 컨디션에 대한 피드백을 해주세요.
   - 그 다음에 반드시 위의 "기록 관리 탭에 입력한 학생 정보"와 이전 대화 히스토리를 참고하여 알레르기 정보를 알려주세요.
   
   - **위의 "학생의 알레르기로 인해 피해야 할 메뉴" 목록에 메뉴가 있는 경우:**
     학생의 이름과 알레르기 정보를 언급한 후 "아래와 같은 음식을 조심하세요"라고 말하고, 위의 피해야 할 메뉴 목록을 개조식으로 표시하세요.
     예: "${currentUser?.displayName || '학생'}은 ${userAllergies.join(', ')} 알레르기가 있네요. 아래와 같은 음식을 조심하세요.\n1. 어묵매운탕(밀, 새우)\n2. 닭볶음탕(난류)"
   
   - **위의 "학생의 알레르기로 인해 피해야 할 메뉴" 목록이 "없음"으로 표시된 경우:**
     "${currentUser?.displayName || '학생'}님 오늘은 알레르기를 유발하는 음식이 없네요, 맛있게 먹을 수 있겠어요."라고 피드백하세요.

3. **절대 금지 사항:**
   - 절대로 학생의 알레르기 정보가 있다고 했다가 없다고 하지 마세요.
   - 절대로 한 대화 안에서 알레르기가 있다고 했다가 없다고 하지 마세요.
   - 절대로 이전 대화에서 알레르기 메뉴를 언급했다면 (예: "어묵매운탕을 조심하세요"), 나중에 "알레르기를 유발하는 음식이 없다"고 말하지 마세요.
   - 위의 "기록 관리 탭에 입력한 학생 정보"와 이전 대화 히스토리를 일관되게 참고하여 판단하세요.

4. **대화 히스토리 확인:**
   - 특히 중요: 이전 대화 히스토리를 반드시 확인하세요.
   - 만약 이전 대화에서 이미 알레르기 메뉴를 언급했다면, 그 정보를 계속 유지하세요.
   - 대화 히스토리와 위의 "기록 관리 탭에 입력한 학생 정보"를 일관되게 유지하세요.

5. **알레르기 질문:**
   - 알레르기가 있냐고 묻지 말고, 컨디션 답변 후 자동으로 알레르기 정보를 포함하세요.

**요약: 기록 관리 탭에 입력된 알레르기 정보를 확인하고, 한 대화 안에서 절대로 번복하지 마세요. 이전 대화에서 언급한 알레르기 정보는 계속 유지하세요.` : ''}

${nutritionInfo ? `상세 영양 정보:
${Object.entries(nutritionInfo).map(([key, value]) => `${key}: ${value}`).join('\n')}` : ''}

알레르기 정보 (급식 메뉴의 괄호 안 숫자는 알레르기 번호를 의미합니다):
①난류 ②우유 ③메밀 ④땅콩 ⑤대두 ⑥밀 ⑦고등어 ⑧게 ⑨새우 ⑩돼지고기 ⑪복숭아 ⑫토마토 ⑬아황산류 ⑭호두 ⑮닭고기 ⑯쇠고기 ⑰오징어 ⑱조개류(굴,전복,홍합 포함) ⑲잣

알레르기 번호 매핑표 (반드시 이 표를 참고하여 정확하게 답변하세요):
1 또는 ① = 난류
2 또는 ② = 우유
3 또는 ③ = 메밀
4 또는 ④ = 땅콩
5 또는 ⑤ = 대두
6 또는 ⑥ = 밀
7 또는 ⑦ = 고등어
8 또는 ⑧ = 게
9 또는 ⑨ = 새우
10 또는 ⑩ = 돼지고기
11 또는 ⑪ = 복숭아
12 또는 ⑫ = 토마토
13 또는 ⑬ = 아황산류
14 또는 ⑭ = 호두
15 또는 ⑮ = 닭고기
16 또는 ⑯ = 쇠고기
17 또는 ⑰ = 오징어
18 또는 ⑱ = 조개류(굴,전복,홍합 포함)
19 또는 ⑲ = 잣

중요 지침:
1. 모든 답변은 짧은 문장으로 5문장 이내로 작성해주세요. 간결하고 명확하게 답변하세요.
2. 급식 메뉴를 알려줄 때는 반드시 위에 제공된 "오늘의 급식 메뉴 정보"에 있는 메뉴만 사용하세요. 절대로 메뉴를 지어내거나 추가하지 마세요.
3. 급식 메뉴를 알려줄 때는 반드시 개조식으로 줄바꿔서 표시해주세요. 각 메뉴를 한 줄씩 표시하여 가독성을 높여주세요.
4. 알레르기 정보를 말할 때는 개조식으로만 간단하게 표시하세요. 장황한 설명이나 조언은 하지 마세요. 예: "1. 대두\n2. 밀"과 같이 각 항목을 한 줄씩 표시하세요.
5. 위에 제공된 상세 영양 정보(탄수화물, 단백질, 지방, 비타민 등)를 활용하여 정확하게 답변해주세요.
6. 학생이 알레르기 정보를 물어보면, 반드시 위의 알레르기 정보와 번호 매핑표를 참고하여 정확하게 설명해주세요. 개조식으로만 표시하세요.
7. 메뉴의 알레르기 정보가 있으면, 번호가 아닌 실제 알레르기 항목 이름으로 설명하세요.
8. 알레르기 정보를 설명할 때는 개조식으로만 간단하게 표시하세요. 장황한 설명이나 조언은 하지 마세요.
9. 영양 정보를 설명할 때는 위의 상세 영양 정보를 활용하여 구체적인 수치를 언급해주세요.
10. 대화는 3~7회 정도로 자연스럽게 진행되도록 하세요.
11. 학생의 질문에 대해 긍정적이고 격려하는 톤으로 답변하세요.
12. 절대로 메뉴를 지어내거나 추가하지 마세요. 위에 제공된 메뉴 정보만 사용하세요.
13. 건강 상태에 대한 질문에 학생이 답변하면, 먼저 컨디션에 대한 피드백을 해주고, 그 다음에 위에 제공된 "학생의 알레르기 정보"와 "학생의 알레르기로 인해 피해야 할 메뉴" 목록을 반드시 참고하여 알레르기 정보를 알려주세요. 
- 위의 "학생의 알레르기로 인해 피해야 할 메뉴" 목록에 메뉴가 있는 경우: 학생의 이름과 알레르기 정보를 언급한 후 "아래와 같은 음식을 조심하세요"라고 말하고, 피해야 할 메뉴 목록을 개조식으로 표시하세요. 메뉴명 뒤에 괄호로 알레르기 정보를 표시하세요. 예: "00학생은 000알레르기가 있네요. 아래와 같은 음식을 조심하세요.\n1. 어묵매운탕(밀, 새우)\n2. 닭볶음탕(난류)" 형식으로 표시하세요.
- 위의 "학생의 알레르기로 인해 피해야 할 메뉴" 목록이 "없음"으로 표시된 경우: "00님 오늘은 알레르기를 유발하는 음식이 없네요, 맛있게 먹을 수 있겠어요."라고 피드백하세요.
절대로 학생의 알레르기 정보가 있다고 했다가 없다고 하지 마세요. 위에 제공된 "학생의 알레르기 정보"와 "학생의 알레르기로 인해 피해야 할 메뉴" 목록을 일관되게 참고하여 판단하세요.
특히 중요: 이전 대화 히스토리와 기록 관리 탭에 입력한 학생 정보를 모두 반영하여 답변하세요. 만약 이전 대화에서 이미 알레르기 메뉴를 언급했다면 (예: "어묵매운탕을 조심하세요"), 나중에 "알레르기를 유발하는 음식이 없다"고 말하지 마세요. 대화 히스토리와 기록 관리 탭에 입력한 정보를 일관되게 유지하세요. 이전에 언급한 알레르기 정보는 계속 유지해야 합니다.
알레르기가 있냐고 묻지 말고, 컨디션 답변 후 자동으로 알레르기 정보를 포함하세요.
14. "오늘의 급식 칼로리가 맞는지 확인해볼까요?" 같은 칼로리 확인 질문은 하지 마세요. 대신 "00님에게 적합한 메뉴를 알아볼까요?" 또는 "00님에게 추천하는 메뉴를 알려드릴까요?" 같은 방식으로 학생에게 적합한 메뉴를 제안하는 방향으로 대화를 이끌어주세요.`
          },
          ...chatHistory
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const botMessage = choice.message.content;
    const finishReason = choice.finish_reason;
    
    // 응답이 잘렸는지 확인
    if (finishReason === 'length') {
      console.warn('⚠️ 응답이 max_tokens 제한으로 인해 잘렸습니다.');
      // 잘린 응답에 추가 메시지 추가
      const truncatedMessage = botMessage + '\n\n(응답이 길어서 일부가 잘렸을 수 있습니다. 더 짧게 질문해주시면 더 자세히 답변드릴 수 있어요!)';
      
      chatHistory.push({
        role: 'assistant',
        content: truncatedMessage
      });
      
      return truncatedMessage;
    }
    
    // 대화 히스토리에 봇 응답 추가
    chatHistory.push({
      role: 'assistant',
      content: botMessage
    });

    return botMessage;
  } catch (error) {
    console.error('ChatGPT API 오류:', error);
    return '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

// 메시지 추가
function addChatMessage(sender, message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  // 메시지에 줄바꿈이 있으면 <br> 태그로 변환하여 표시
  const formattedMessage = message.replace(/\n/g, '<br>');
  messageContent.innerHTML = formattedMessage;
  
  messageDiv.appendChild(messageContent);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 메뉴를 개조식으로 포맷팅하는 함수
function formatMenuList() {
  if (todayMenu.length === 0) {
    return '아직 메뉴 정보가 없습니다. (주말이거나 공휴일일 수 있습니다)';
  }
  
  // 오늘 날짜 정보
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const dateStr = `${year}년 ${month}월 ${day}일`;
  
  let menuText = `📅 ${dateStr} 오늘의 점심 메뉴\n\n`;
  
  todayMenu.forEach((menu, index) => {
    const allergyText = menu.allergyNames ? ` (알레르기: ${menu.allergyNames})` : '';
    menuText += `${index + 1}. ${menu.name}${allergyText}\n`;
  });
  
  // 총 칼로리 (API에서 가져온 값 사용)
  const displayCalories = totalCalories > 0 ? totalCalories : 0;
  menuText += `\n총 칼로리: ${displayCalories.toFixed(1)}kcal`;
  
  return menuText;
}

// 챗봇 시작
async function startChatbot() {
  // 챗봇 상태 초기화
  chatTurn = 0;
  chatHistory = [];
  
  // 먼저 오늘의 급식 메뉴를 가져옴 (API에서 실제 메뉴 가져오기)
  await fetchTodayMenu();
  
  // 메뉴가 없으면 안내 메시지
  if (todayMenu.length === 0) {
    addChatMessage('bot', '오늘은 급식 메뉴 정보를 가져올 수 없습니다. (주말이거나 공휴일일 수 있습니다)');
    return;
  }
  
  // 첫 번째 메시지: 인사 및 메뉴 안내
  const greetingMessage = '안녕! 오늘 점심메뉴를 알려줄게.';
  addChatMessage('bot', greetingMessage);
  
  // 잠시 후 메뉴 표시 (API에서 가져온 실제 메뉴만 표시)
  setTimeout(() => {
    const menuMessage = formatMenuList();
    addChatMessage('bot', menuMessage);
    
    // 건강 상태 물어보기
    setTimeout(() => {
      const healthQuestion = '오늘 건강은 어떤가요? 컨디션이 어떤지 궁금해요!';
      addChatMessage('bot', healthQuestion);
      
      // 초기 시스템 메시지 (ChatGPT가 컨텍스트를 이해할 수 있도록)
      const fullMessage = greetingMessage + '\n\n' + menuMessage + '\n\n' + healthQuestion;
      chatHistory.push({
        role: 'assistant',
        content: fullMessage
      });
    }, 1500);
  }, 1000);
}

// 알레르기 정보와 급식 메뉴 비교하여 위험 메뉴 찾기
function checkAllergyInMenu() {
  if (!userAllergies || userAllergies.length === 0 || !todayMenu || todayMenu.length === 0) {
    return [];
  }
  
  // 알레르기 번호 매핑 (한글명 -> 번호)
  const allergyNumberMap = {
    '난류': '1',
    '우유': '2',
    '메밀': '3',
    '땅콩': '4',
    '대두': '5',
    '밀': '6',
    '고등어': '7',
    '게': '8',
    '새우': '9',
    '돼지고기': '10',
    '복숭아': '11',
    '토마토': '12',
    '아황산류': '13',
    '호두': '14',
    '닭고기': '15',
    '쇠고기': '16',
    '오징어': '17',
    '조개류': '18',
    '잣': '19'
  };
  
  // 사용자 알레르기를 번호로 변환
  const userAllergyNumbers = userAllergies
    .map(allergy => allergyNumberMap[allergy])
    .filter(num => num !== undefined);
  
  if (userAllergyNumbers.length === 0) {
    return [];
  }
  
  // 위험한 메뉴 찾기
  const dangerousMenus = [];
  
  todayMenu.forEach(menu => {
    // allergyInfo 속성 확인 (예: "5.6.16")
    const allergyInfo = menu.allergyInfo || menu.allergy;
    
    if (allergyInfo && allergyInfo.trim() !== '') {
      // 메뉴의 알레르기 번호와 사용자 알레르기 번호 비교
      const menuAllergyNumbers = allergyInfo.split('.').map(num => num.trim()).filter(num => num);
      const hasAllergy = menuAllergyNumbers.some(num => userAllergyNumbers.includes(num));
      
      if (hasAllergy) {
        // 해당 알레르기 항목 찾기
        const matchedAllergies = menuAllergyNumbers
          .filter(num => userAllergyNumbers.includes(num))
          .map(num => {
            const allergyName = Object.keys(allergyNumberMap).find(
              key => allergyNumberMap[key] === num
            );
            return allergyName || num;
          });
        
        dangerousMenus.push({
          name: menu.name,
          allergies: matchedAllergies,
          allergyNumbers: allergyInfo
        });
      }
    }
  });
  
  return dangerousMenus;
}

// 알레르기 안내 메시지 생성
function generateAllergyWarningMessage() {
  const dangerousMenus = checkAllergyInMenu();
  
  if (dangerousMenus.length === 0) {
    return null;
  }
  
  let message = '⚠️ 알레르기 주의 안내\n\n';
  message += '입력하신 알레르기 정보를 확인한 결과, 오늘 급식 중 다음 메뉴에 주의가 필요합니다:\n\n';
  
  dangerousMenus.forEach(menu => {
    message += `• ${menu.name}\n`;
    message += `  포함된 알레르기: ${menu.allergies.join(', ')}\n\n`;
  });
  
  message += '해당 알레르기가 있으시면 해당 메뉴를 피하시거나 주의해서 드시기 바랍니다.';
  
  return message;
}

// 알레르기 정보를 개조식으로 포맷팅
function formatAllergyInfo(allergies) {
  if (!allergies || allergies.length === 0) {
    return '';
  }
  
  return allergies.map((allergy, index) => `${index + 1}. ${allergy}`).join('\n');
}

// 챗봇 응답 처리
async function handleChatbotResponse(userMessage) {
  chatTurn++;
  
  // 사용자 메시지 표시
  addChatMessage('user', userMessage);
  
  // ChatGPT API 호출 (시스템 프롬프트에 이미 알레르기 정보와 위험 메뉴 목록이 포함되어 있음)
  const botResponse = await callChatGPTAPI(userMessage);
  addChatMessage('bot', botResponse);
  
  // 3턴 이상이면 대화 끝내기 버튼 표시
  if (chatTurn >= 3) {
    endChatBtn.classList.remove('hidden');
  }
  
  // 최대 7턴 체크
  if (chatTurn >= 7) {
    chatInput.disabled = true;
    sendBtn.disabled = true;
    endChatBtn.classList.remove('hidden');
    addChatMessage('bot', '대화가 충분히 진행되었습니다. 이제 음식 기록으로 넘어가주세요!');
  }
}

// 대화 끝내기
function endChatbot() {
  chatbotSection.classList.add('hidden');
  recordSection.classList.remove('hidden');
  initializeRecordSection();
}

// 기록 섹션 초기화
async function initializeRecordSection() {
  // 기존 점심 기록 불러오기
  await loadExistingLunchRecord();
  
  // 기존 간식 기록 불러오기
  await loadExistingSnackRecord();
  
  // 점심 메뉴 리스트 생성
  renderLunchMenuList();
  
  // 버튼 이벤트 리스너
  setupMenuControls();
  updateTotalCalories();
}

// 점심 메뉴 리스트 렌더링
function renderLunchMenuList() {
  lunchMenuList.innerHTML = '';
  todayMenu.forEach(menu => {
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    menuItem.style.cursor = 'pointer';
    menuItem.innerHTML = `
      <div class="menu-info" data-menu="${menu.name}">
        <span class="menu-name">${menu.name}</span>
      </div>
      <div class="menu-controls">
        <button class="count-btn minus" data-menu="${menu.name}">-</button>
        <input type="number" class="count-input" id="count-${menu.name}" 
               value="${lunchRecords[menu.name] || 0}" min="0" max="10" 
               data-menu="${menu.name}" />
        <button class="count-btn plus" data-menu="${menu.name}">+</button>
      </div>
    `;
    lunchMenuList.appendChild(menuItem);
    
    // 초기값 설정 (칼로리는 총 칼로리만 사용)
  });
  
  // 메뉴 아이템 클릭 이벤트 (횟수 +1)
  document.querySelectorAll('.menu-info').forEach(info => {
    info.addEventListener('click', (e) => {
      const menuName = e.currentTarget.dataset.menu;
      const input = document.getElementById(`count-${menuName}`);
      const currentValue = parseInt(input.value) || 0;
      if (currentValue < 10) {
        input.value = currentValue + 1;
        updateMenuCount(menuName, currentValue + 1);
      }
    });
  });
}

// 기존 점심 기록 불러오기
async function loadExistingLunchRecord() {
  if (!db || !currentUser) {
    return;
  }
  
  try {
    const date = getTodayDate();
    const recordsRef = collection(db, 'foodRecords');
    const q = query(
      recordsRef,
      where('userId', '==', currentUser.uid),
      where('date', '==', date),
      where('type', '==', 'lunch')
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const record = querySnapshot.docs[0].data();
      
      // 기존 기록을 lunchRecords에 로드
      if (record.menuItems) {
        record.menuItems.forEach(item => {
          if (item.count > 0) {
            lunchRecords[item.name] = item.count;
          }
        });
      }
      
      // 새로입력하기 버튼 표시
      if (newLunchBtn) {
        newLunchBtn.classList.remove('hidden');
      }
      
      console.log('✅ 기존 점심 기록을 불러왔습니다.');
    } else {
      // 기록이 없으면 새로입력하기 버튼 숨김
      if (newLunchBtn) {
        newLunchBtn.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('기존 점심 기록 불러오기 오류:', error);
  }
}

// 기존 간식 기록 불러오기
async function loadExistingSnackRecord() {
  if (!db || !currentUser) {
    return;
  }
  
  try {
    const date = getTodayDate();
    const recordsRef = collection(db, 'foodRecords');
    const q = query(
      recordsRef,
      where('userId', '==', currentUser.uid),
      where('date', '==', date),
      where('type', '==', 'snack')
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const record = querySnapshot.docs[0].data();
      
      // 기존 기록을 snackList에 로드
      if (record.snacks && Array.isArray(record.snacks)) {
        snackList = [...record.snacks];
        updateSnackList();
      }
      
      // 새로입력하기 버튼 표시
      if (newSnackBtn) {
        newSnackBtn.classList.remove('hidden');
      }
      
      console.log('✅ 기존 간식 기록을 불러왔습니다.');
    } else {
      // 기록이 없으면 새로입력하기 버튼 숨김
      if (newSnackBtn) {
        newSnackBtn.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('기존 간식 기록 불러오기 오류:', error);
  }
}

// 메뉴 컨트롤 설정
function setupMenuControls() {
  // 플러스 버튼
  document.querySelectorAll('.count-btn.plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const menuName = e.target.dataset.menu;
      const input = document.getElementById(`count-${menuName}`);
      const currentValue = parseInt(input.value) || 0;
      if (currentValue < 10) {
        input.value = currentValue + 1;
        updateMenuCount(menuName, currentValue + 1);
      }
    });
  });
  
  // 마이너스 버튼
  document.querySelectorAll('.count-btn.minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const menuName = e.target.dataset.menu;
      const input = document.getElementById(`count-${menuName}`);
      const currentValue = parseInt(input.value) || 0;
      if (currentValue > 0) {
        input.value = currentValue - 1;
        updateMenuCount(menuName, currentValue - 1);
      }
    });
  });
  
  // 직접 입력
  document.querySelectorAll('.count-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const menuName = e.target.dataset.menu;
      const value = parseInt(e.target.value) || 0;
      if (value < 0) e.target.value = 0;
      if (value > 10) e.target.value = 10;
      updateMenuCount(menuName, parseInt(e.target.value) || 0);
    });
  });
}

// 메뉴 개수 업데이트
function updateMenuCount(menuName, count) {
  lunchRecords[menuName] = count;
  updateTotalCalories();
}

// 총 칼로리 업데이트 (각 메뉴별 칼로리는 사용하지 않고 총 칼로리만 사용)
function updateTotalCalories() {
  // API에서 가져온 총 칼로리 사용
  lunchTotalCalories.textContent = totalCalories > 0 ? Math.round(totalCalories) : 0;
}

// 간식 추가
function addSnack() {
  const snackName = snackInput.value.trim();
  if (!snackName) return;
  
  snackList.push(snackName);
  snackInput.value = '';
  updateSnackList();
}

// 간식 목록 업데이트
function updateSnackList() {
  snackFoods.innerHTML = '';
  snackList.forEach((snack, index) => {
    const snackItem = document.createElement('div');
    snackItem.className = 'food-item';
    snackItem.innerHTML = `
      <span>${snack}</span>
      <button class="remove-btn" data-index="${index}">×</button>
    `;
    snackFoods.appendChild(snackItem);
  });
  
  // 삭제 버튼 이벤트
  snackFoods.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      snackList.splice(index, 1);
      updateSnackList();
    });
  });
}

// 영양 브리핑 챗봇 메시지 추가
function addNutritionMessage(sender, message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  // 메시지에 줄바꿈이 있으면 <br> 태그로 변환하여 표시
  const formattedMessage = message.replace(/\n/g, '<br>');
  messageContent.innerHTML = formattedMessage;
  
  messageDiv.appendChild(messageContent);
  nutritionChatMessages.appendChild(messageDiv);
  nutritionChatMessages.scrollTop = nutritionChatMessages.scrollHeight;
}

// 영양 브리핑 챗봇 API 호출
async function callNutritionChatGPTAPI(userMessage, lunchData) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    return '죄송합니다. 챗봇 서비스가 준비되지 않았습니다.';
  }

  nutritionChatHistory.push({
    role: 'user',
    content: userMessage
  });

  try {
    // 먹은 메뉴 정보 정리
    const eatenMenus = lunchData.menuItems.filter(item => item.count > 0);
    const menuSummary = eatenMenus.map(item => 
      `${item.name} ${item.count}인분`
    ).join(', ');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `당신은 영양사이자 건강 관리 전문가입니다. 학생들이 먹은 점심 식사의 영양을 분석하고 건강한 식습관을 위한 조언을 제공합니다.

오늘 학생이 먹은 점심 식사:
${menuSummary}
총 칼로리: ${lunchData.totalCalories}kcal

${userBMR ? `[기록 관리 탭에 입력한 학생 신체 정보]
키: ${userHeight ? `${userHeight}cm` : '정보 없음'}
현재 몸무게: ${userWeight ? `${userWeight}kg` : '정보 없음'}
${userTargetWeight ? `목표 몸무게: ${userTargetWeight}kg` : ''}
${userAge ? `나이: ${userAge}세` : ''}
${userGender ? `성별: ${userGender === 'male' ? '남성' : '여성'}` : ''}
기초대사량(BMR): ${Math.round(userBMR)}kcal/일
BMI: ${userBMI ? userBMI.toFixed(1) : '정보 없음'}
${userTargetWeight && userWeight ? `목표 몸무게까지: ${userWeight > userTargetWeight ? `${(userWeight - userTargetWeight).toFixed(1)}kg 감량 필요` : userWeight < userTargetWeight ? `${(userTargetWeight - userWeight).toFixed(1)}kg 증량 필요` : '목표 달성!'}` : ''}

식사 비율 기준 (BMR 기준):
- 아침: ${Math.round(userBMR * 0.25)}kcal (25%)
- 점심: ${Math.round(userBMR * 0.35)}kcal (35%)
- 저녁: ${Math.round(userBMR * 0.30)}kcal (30%)
- 간식: ${Math.round(userBMR * 0.10)}kcal (10%)

중요: 학생의 키, 현재 몸무게, 목표 몸무게를 고려하여 답변해주세요.
${userTargetWeight && userWeight ? `- 현재 몸무게(${userWeight}kg)와 목표 몸무게(${userTargetWeight}kg)를 비교하여 적절한 식단 조언을 제공하세요.` : ''}
- 점심 식사의 칼로리를 기초대사량의 점심 비율(${Math.round(userBMR * 0.35)}kcal, 35%)과 비교하여 적절한지 평가하고, 하루 권장 칼로리 섭취량에 대한 조언을 제공해주세요.
- 목표 몸무게 달성을 위한 식단 조언을 제공하세요.` : ''}

${nutritionInfo ? `오늘 급식의 전체 영양 정보:
${Object.entries(nutritionInfo).map(([key, value]) => `${key}: ${value}`).join('\n')}` : ''}

중요 지침:
1. 모든 답변은 짧은 문장으로 5문장 이내로 작성해주세요. 간결하고 명확하게 답변하세요.
2. 학생이 먹은 음식의 영양소(탄수화물, 단백질, 지방, 비타민 등)를 분석해주세요.
3. 먹은 양에 대해 적절한지 평가해주세요.
4. 건강한 식습관을 위한 구체적이고 실용적인 조언을 제공해주세요.
5. 긍정적이고 격려하는 톤으로 답변하세요.
6. 학생의 건강을 위한 따뜻한 조언을 해주세요.`
          },
          ...nutritionChatHistory
        ],
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    const botMessage = data.choices[0].message.content;
    
    nutritionChatHistory.push({
      role: 'assistant',
      content: botMessage
    });

    return botMessage;
  } catch (error) {
    console.error('영양 브리핑 챗봇 오류:', error);
    return '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

// 사용자 BMR 및 알레르기 정보 불러오기
async function loadUserBMR() {
  if (!db || !currentUser) {
    return;
  }
  
  try {
    const userRecordRef = doc(db, 'userRecords', currentUser.uid);
    const docSnap = await getDoc(userRecordRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      userBMR = data.bmr || null;
      userBMI = data.bmi || null;
      userHeight = data.height || null;
      userWeight = data.weight || null;
      userTargetWeight = data.targetWeight || null;
      userAge = data.age || null;
      userGender = data.gender || null;
      userAllergies = data.allergies || [];
      console.log('✅ 사용자 정보 불러옴:', { 
        bmr: userBMR, 
        bmi: userBMI, 
        height: userHeight,
        weight: userWeight,
        targetWeight: userTargetWeight,
        age: userAge,
        gender: userGender,
        allergies: userAllergies 
      });
    }
  } catch (error) {
    console.error('사용자 정보 불러오기 오류:', error);
  }
}

// 영양 브리핑 챗봇 시작
async function startNutritionChatbot(lunchData) {
  // 기록 섹션 숨기고 영양 브리핑 챗봇 표시
  recordSection.classList.add('hidden');
  nutritionChatbotSection.classList.remove('hidden');
  
  // 대화 히스토리가 없을 때만 초기 메시지 표시
  if (nutritionChatHistory.length === 0) {
    nutritionChatMessages.innerHTML = '';
    
    // 먹은 메뉴 정보 정리
    const eatenMenus = lunchData.menuItems.filter(item => item.count > 0);
    const menuSummary = eatenMenus.map(item => 
      `${item.name} ${item.count}인분`
    ).join(', ');
    
    // 초기 브리핑 메시지
    const greetingMessage = `안녕! 오늘 점심에 ${menuSummary}를 드셨군요! 영양 분석과 건강 조언을 해드릴게요.`;
    addNutritionMessage('bot', greetingMessage);
    
    // 자동으로 영양 분석 시작
    setTimeout(async () => {
      addNutritionMessage('bot', '영양 분석 중...');
      
      const analysisPrompt = '오늘 먹은 점심 식사의 영양소를 분석하고, 먹은 양이 적절한지 평가해주세요. 그리고 건강한 식습관을 위한 조언을 해주세요.';
      const analysis = await callNutritionChatGPTAPI(analysisPrompt, lunchData);
      
      // "영양 분석 중..." 메시지 제거하고 실제 분석 결과 표시
      if (nutritionChatMessages.lastChild) {
        nutritionChatMessages.removeChild(nutritionChatMessages.lastChild);
      }
      addNutritionMessage('bot', analysis);
    }, 1000);
  } else {
    // 기존 대화가 있으면 히스토리에서 메시지 복원
    nutritionChatMessages.innerHTML = '';
    nutritionChatHistory.forEach(msg => {
      const sender = msg.role === 'user' ? 'user' : 'bot';
      addNutritionMessage(sender, msg.content);
    });
  }
}

// 점심 제출
async function submitLunch() {
  // 로그인 상태 확인
  if (!currentUser) {
    alert('⚠️ 로그인이 필요합니다.\n메인 페이지에서 Google 로그인을 먼저 해주세요.');
    window.location.href = '/index.html';
    return;
  }
  
  const hasLunch = Object.values(lunchRecords).some(count => count > 0);
  
  if (!hasLunch) {
    alert('먹은 점심 메뉴를 선택해주세요.');
    return;
  }
  
  // 0으로 입력된 음식이 있는지 확인
  const zeroFoods = todayMenu.filter(menu => {
    const count = lunchRecords[menu.name] || 0;
    return count === 0;
  });
  
  // 0으로 입력된 음식이 있으면 확인 메시지 표시
  if (zeroFoods.length > 0) {
    const zeroFoodNames = zeroFoods.map(menu => menu.name).join(', ');
    const confirmMessage = `다음 음식들은 0으로 입력되어 있습니다:\n${zeroFoodNames}\n\n이 음식들은 안 먹은 음식이 맞나요?`;
    
    if (!confirm(confirmMessage)) {
      // 사용자가 취소하면 제출 중단
      return;
    }
  }
  
  const lunchData = {
    records: lunchRecords,
    totalCalories: parseInt(lunchTotalCalories.textContent) || totalCalories,
    menuItems: todayMenu.map(menu => ({
      name: menu.name,
      count: lunchRecords[menu.name] || 0,
      calories: 0, // 각 메뉴별 칼로리는 사용하지 않음 (총 칼로리만 사용)
      allergyNames: menu.allergyNames || ''
    }))
  };
  
  console.log('점심 제출 데이터:', lunchData);
  
  // 제출 버튼 비활성화 (중복 제출 방지)
  const submitBtn = document.getElementById('submit-lunch-btn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';
  
  // Firebase에 저장
  try {
    await saveLunchToFirebase(lunchData);
    console.log('✅ 점심 기록이 Firebase에 저장되었습니다.');
    alert('✅ 점심 기록이 성공적으로 저장되었습니다!');
    
    // 새로입력하기 버튼 표시
    if (newLunchBtn) {
      newLunchBtn.classList.remove('hidden');
    }
    
    // 영양 브리핑 챗봇 시작
    startNutritionChatbot(lunchData);
  } catch (error) {
    console.error('❌ Firebase 저장 오류:', error);
    
    // 더 자세한 오류 메시지 표시
    let errorMessage = '기록 저장 중 오류가 발생했습니다.';
    
    if (error.message) {
      if (error.message.includes('이미 점심 기록을 제출')) {
        errorMessage = '⚠️ 오늘 이미 점심 기록을 제출하셨습니다.\n하루에 한 번만 제출할 수 있습니다.';
      } else if (error.message.includes('로그인이 필요')) {
        errorMessage = '⚠️ 로그인이 필요합니다.\n메인 페이지에서 Google 로그인을 먼저 해주세요.';
      } else if (error.message.includes('Firebase가 초기화')) {
        errorMessage = '⚠️ Firebase 설정 오류입니다.\n페이지를 새로고침해주세요.';
      } else if (error.code === 'permission-denied') {
        errorMessage = '⚠️ 저장 권한이 없습니다.\nFirebase 권한 설정을 확인해주세요.';
      } else {
        errorMessage = `⚠️ 오류: ${error.message}`;
      }
    }
    
    alert(errorMessage);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

// 간식 제출
async function submitSnack() {
  // 로그인 상태 확인
  if (!currentUser) {
    alert('⚠️ 로그인이 필요합니다.\n메인 페이지에서 Google 로그인을 먼저 해주세요.');
    window.location.href = '/index.html';
    return;
  }
  
  if (snackList.length === 0) {
    alert('먹은 간식을 입력해주세요.');
    return;
  }
  
  const snackData = {
    snacks: snackList,
    count: snackList.length
  };
  
  console.log('간식 제출 데이터:', snackData);
  
  // 제출 버튼 비활성화 (중복 제출 방지)
  const submitBtn = document.getElementById('submit-snack-btn');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';
  
  // Firebase에 저장
  try {
    await saveSnackToFirebase(snackData);
    console.log('✅ 간식 기록이 Firebase에 저장되었습니다.');
    alert('✅ 간식 기록이 성공적으로 저장되었습니다!');
    
    // 새로입력하기 버튼 표시
    if (newSnackBtn) {
      newSnackBtn.classList.remove('hidden');
    }
    
    snackList = [];
    updateSnackList();
    snackInput.value = '';
  } catch (error) {
    console.error('❌ Firebase 저장 오류:', error);
    
    // 더 자세한 오류 메시지 표시
    let errorMessage = '기록 저장 중 오류가 발생했습니다.';
    
    if (error.message) {
      if (error.message.includes('이미 간식 기록을 제출')) {
        errorMessage = '⚠️ 오늘 이미 간식 기록을 제출하셨습니다.\n하루에 한 번만 제출할 수 있습니다.';
      } else if (error.message.includes('로그인이 필요')) {
        errorMessage = '⚠️ 로그인이 필요합니다.\n메인 페이지에서 Google 로그인을 먼저 해주세요.';
      } else if (error.message.includes('Firebase가 초기화')) {
        errorMessage = '⚠️ Firebase 설정 오류입니다.\n페이지를 새로고침해주세요.';
      } else if (error.code === 'permission-denied') {
        errorMessage = '⚠️ 저장 권한이 없습니다.\nFirebase 권한 설정을 확인해주세요.';
      } else {
        errorMessage = `⚠️ 오류: ${error.message}`;
      }
    }
    
    alert(errorMessage);
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

// 이벤트 리스너
sendBtn.addEventListener('click', async () => {
  const message = chatInput.value.trim();
  if (!message) return;
  
  chatInput.value = '';
  await handleChatbotResponse(message);
});

chatInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    const message = chatInput.value.trim();
    if (!message) return;
    
    chatInput.value = '';
    await handleChatbotResponse(message);
  }
});

endChatBtn.addEventListener('click', () => {
  endChatbot();
});

addSnackBtn.addEventListener('click', () => {
  addSnack();
});

snackInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addSnack();
  }
});

submitLunchBtn.addEventListener('click', async () => {
  await submitLunch();
});

submitSnackBtn.addEventListener('click', async () => {
  await submitSnack();
});

// 새로입력하기 버튼 이벤트
if (newLunchBtn) {
  newLunchBtn.addEventListener('click', () => {
    if (confirm('기존 입력 내용을 모두 지우고 새로 입력하시겠습니까?')) {
      // 점심 기록 초기화
      lunchRecords = {};
      renderLunchMenuList();
      setupMenuControls();
      updateTotalCalories();
      newLunchBtn.classList.add('hidden');
    }
  });
}

if (newSnackBtn) {
  newSnackBtn.addEventListener('click', () => {
    if (confirm('기존 입력 내용을 모두 지우고 새로 입력하시겠습니까?')) {
      // 간식 기록 초기화
      snackList = [];
      updateSnackList();
      snackInput.value = '';
      newSnackBtn.classList.add('hidden');
    }
  });
}

backBtn.addEventListener('click', () => {
  window.location.href = '/index.html';
});

// 영양 브리핑 챗봇 전송 버튼
nutritionSendBtn.addEventListener('click', async () => {
  const message = nutritionChatInput.value.trim();
  if (!message) return;
  
  addNutritionMessage('user', message);
  nutritionChatInput.value = '';
  
  // 점심 데이터 가져오기
  const lunchData = {
    records: lunchRecords,
    totalCalories: parseInt(lunchTotalCalories.textContent),
    menuItems: todayMenu.map(menu => ({
      name: menu.name,
      count: lunchRecords[menu.name] || 0,
      calories: menu.calories * (lunchRecords[menu.name] || 0)
    }))
  };
  
  const botResponse = await callNutritionChatGPTAPI(message, lunchData);
  addNutritionMessage('bot', botResponse);
});

// 영양 브리핑 챗봇 Enter 키
nutritionChatInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    nutritionSendBtn.click();
  }
});

// 영양 브리핑 챗봇 닫기
closeNutritionBtn.addEventListener('click', () => {
  nutritionChatbotSection.classList.add('hidden');
  recordSection.classList.remove('hidden');
  // 대화 히스토리는 유지 (다시 열면 이어서 대화 가능)
});

// 오늘 날짜에 이미 기록이 있는지 확인
async function checkExistingRecord(type) {
  if (!db || !currentUser) {
    return false;
  }
  
  const date = getTodayDate();
  try {
    const recordsRef = collection(db, 'foodRecords');
    const q = query(
      recordsRef,
      where('userId', '==', currentUser.uid),
      where('date', '==', date),
      where('type', '==', type)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('기록 확인 오류:', error);
    return false;
  }
}

// Firebase에 점심 기록 저장 (기존 기록이 있으면 업데이트, 없으면 새로 생성)
async function saveLunchToFirebase(lunchData) {
  if (!db) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }
  
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  
  const date = getTodayDate();
  const recordData = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    userName: currentUser.displayName || '익명',
    date: date,
    type: 'lunch',
    records: lunchData.records,
    totalCalories: lunchData.totalCalories,
    menuItems: lunchData.menuItems,
    updatedAt: serverTimestamp()
  };
  
  // 기존 기록 확인
  const recordsRef = collection(db, 'foodRecords');
  const q = query(
    recordsRef,
    where('userId', '==', currentUser.uid),
    where('date', '==', date),
    where('type', '==', 'lunch')
  );
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    // 기존 기록 업데이트
    const existingDoc = querySnapshot.docs[0];
    await updateDoc(doc(db, 'foodRecords', existingDoc.id), recordData);
    console.log('점심 기록 업데이트 완료:', existingDoc.id);
    return existingDoc.id;
  } else {
    // 새 기록 생성
    recordData.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, 'foodRecords'), recordData);
    console.log('점심 기록 저장 완료:', docRef.id);
    return docRef.id;
  }
}

// Firebase에 간식 기록 저장 (기존 기록이 있으면 업데이트, 없으면 새로 생성)
async function saveSnackToFirebase(snackData) {
  if (!db) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }
  
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  
  const date = getTodayDate();
  const recordData = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    userName: currentUser.displayName || '익명',
    date: date,
    type: 'snack',
    snacks: snackData.snacks,
    count: snackData.count,
    updatedAt: serverTimestamp()
  };
  
  // 기존 기록 확인
  const recordsRef = collection(db, 'foodRecords');
  const q = query(
    recordsRef,
    where('userId', '==', currentUser.uid),
    where('date', '==', date),
    where('type', '==', 'snack')
  );
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    // 기존 기록 업데이트
    const existingDoc = querySnapshot.docs[0];
    await updateDoc(doc(db, 'foodRecords', existingDoc.id), recordData);
    console.log('간식 기록 업데이트 완료:', existingDoc.id);
    return existingDoc.id;
  } else {
    // 새 기록 생성
    recordData.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, 'foodRecords'), recordData);
    console.log('간식 기록 저장 완료:', docRef.id);
    return docRef.id;
  }
}

// 사용자 인증 상태 확인
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log('✅ 사용자 로그인:', user.email);
      // BMR 정보 불러오기
      await loadUserBMR();
    } else {
      currentUser = null;
      userBMR = null;
      userBMI = null;
      console.warn('⚠️ 사용자가 로그인하지 않았습니다.');
      
      // 학생 페이지에서 로그인하지 않은 경우 메인 페이지로 리다이렉트
      if (window.location.pathname.includes('student.html')) {
        alert('⚠️ 로그인이 필요합니다.\n메인 페이지에서 Google 로그인을 먼저 해주세요.');
        window.location.href = '/index.html';
      }
    }
  });
} else {
  console.warn('⚠️ Firebase 인증이 설정되지 않았습니다.');
  
  // Firebase가 설정되지 않은 경우 경고 표시
  if (window.location.pathname.includes('student.html')) {
    console.error('❌ Firebase 설정이 필요합니다. .env 파일을 확인해주세요.');
  }
}

// 페이지 로드 시 챗봇 시작
startChatbot();

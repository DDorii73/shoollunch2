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

// 섭취량 막대그래프
let consumptionChart = null;

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

// Netlify Functions URL 헬퍼 함수
// 항상 Netlify Functions를 통해 API 호출 (브라우저에서 직접 호출하지 않음)
function getNetlifyFunctionUrl(functionName) {
  // 개발 환경과 프로덕션 환경 모두 Netlify Functions 사용
  // 개발 환경에서는 로컬 Netlify Dev 서버 사용 (netlify dev 실행 시)
  return `/.netlify/functions/${functionName}`;
}

// 오늘의 급식 메뉴 가져오기
async function fetchTodayMenu() {
  const today = new Date();
  
  try {
    // 오늘 날짜를 YYYYMMDD 형식으로 변환
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    console.log('📅 조회할 날짜:', `${year}-${month}-${day}`, `(${dateStr})`);
    
    // 항상 Netlify Function을 통해 호출
    const functionUrl = getNetlifyFunctionUrl('neis-api');
    const apiUrl = `${functionUrl}?date=${dateStr}`;
    console.log('🌐 NEIS API 호출 (Netlify Function):', apiUrl);
    console.log('🔍 현재 URL:', window.location.href);
    console.log('🔍 Function URL:', functionUrl);
    
    const response = await fetch(apiUrl).catch(error => {
      console.error('❌ Fetch 오류:', error);
      throw new Error(`네트워크 오류: ${error.message}`);
    });
    
    console.log('📡 API 응답 상태:', response.status, response.statusText);
    console.log('📡 응답 URL:', response.url);
    
    if (!response.ok) {
      // 에러 응답 파싱 시도
      let errorMessage = `HTTP 오류: ${response.status} ${response.statusText}`;
      let errorDetails = '';
      try {
        const errorData = await response.json();
        console.error('❌ API 에러 응답:', errorData);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
        if (errorData.details) {
          errorDetails = errorData.details;
        }
        if (errorData.missingVariables) {
          errorDetails = `누락된 환경 변수: ${errorData.missingVariables.join(', ')}`;
        }
      } catch (e) {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = errorText;
        }
      }
      console.error('❌ API 호출 실패:', errorMessage);
      if (errorDetails) {
        console.error('❌ 상세 오류:', errorDetails);
      }
      
      // Function에서 환경 변수 오류인 경우 기본 메뉴로 폴백
      if (response.status === 500 && (errorMessage.includes('configuration missing') || errorMessage.includes('환경 변수'))) {
        console.warn('⚠️ Netlify Function에 환경 변수가 설정되지 않았습니다. 기본 메뉴를 사용합니다.');
        console.warn('💡 Netlify 대시보드에서 다음 환경 변수를 설정해주세요:');
        console.warn('   - NEIS_API_KEY');
        console.warn('   - NEIS_ATPT_OFCDC_SC_CODE');
        console.warn('   - NEIS_SD_SCHUL_CODE');
        todayMenu = getDefaultMenu();
        return;
      }
      
      throw new Error(errorMessage + (errorDetails ? `\n${errorDetails}` : ''));
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

// 비율을 적용한 칼로리 계산 함수 (API 총 칼로리와 맞추기 위해)
function getAdjustedCalories(menuName) {
  // 먼저 추정 칼로리 계산
  const estimatedCal = estimateCalories(menuName);
  
  // API에서 가져온 총 칼로리가 없거나 todayMenu가 없으면 추정값 그대로 반환
  if (!totalCalories || totalCalories <= 0 || !todayMenu || todayMenu.length === 0) {
    return estimatedCal;
  }
  
  // 모든 메뉴의 추정 칼로리 합 계산
  let estimatedSum = 0;
  todayMenu.forEach(menu => {
    estimatedSum += estimateCalories(menu.name);
  });
  
  // 추정 합이 0이면 추정값 그대로 반환
  if (estimatedSum === 0) {
    return estimatedCal;
  }
  
  // 비율 계산: API 총 칼로리 / 추정 칼로리 합
  const ratio = totalCalories / estimatedSum;
  
  // 비율을 적용한 칼로리 반환 (소수점 둘째 자리까지)
  return Math.round(estimatedCal * ratio * 100) / 100;
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
const calorieDetail = document.getElementById('calorie-detail');
const snackFoods = document.getElementById('snack-foods');
const snackInput = document.getElementById('snack-input');
const addSnackBtn = document.getElementById('add-snack-btn');
const cameraSnackBtn = document.getElementById('camera-snack-btn');
const snackImageInput = document.getElementById('snack-image-input');
const snackImagePreview = document.getElementById('snack-image-preview');
const snackPreviewImg = document.getElementById('snack-preview-img');
const analyzeSnackBtn = document.getElementById('analyze-snack-btn');
const cancelSnackImageBtn = document.getElementById('cancel-snack-image-btn');
const snackAnalysisResult = document.getElementById('snack-analysis-result');
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
  // 대화 히스토리에 사용자 메시지 추가
  chatHistory.push({
    role: 'user',
    content: userMessage
  });

  // 알레르기 위험 메뉴 확인 (컨디션 질문 후에만 별도로 안내하므로 여기서는 시스템 프롬프트에 포함하지 않음)
  const dangerousMenus = userAllergies && userAllergies.length > 0 ? checkAllergyInMenu() : [];

  try {
    const messages = [
          {
            role: 'system',
            content: `당신은 학교 급식 관리 챗봇입니다. 학생들과 친근하고 따뜻하게 대화하며 오늘의 급식에 대해 이야기합니다.

**매우 중요: 말투 및 어휘 사용 규칙**
- 반드시 반말을 사용하세요. ("~해", "~야", "~지" 등)
- 친절하고 따뜻한 톤을 유지하세요.
- 쉬운 어휘를 사용하세요. 어려운 단어나 전문 용어는 피하고, 초등학생도 이해할 수 있는 쉬운 말로 설명하세요.
- 예시: "오늘 급식 맛있어 보이지?" "너 컨디션은 어때?" "이 음식은 단백질이 많아서 몸에 좋아!"
- 절대로 존댓말("~하세요", "~하시다" 등)을 사용하지 마세요.

**매우 중요: 알레르기 정보 일관성 유지**
이 웹앱의 기록 관리 탭에 입력된 알레르기 정보를 반드시 확인하고, 한 대화 안에서 절대로 번복하지 마세요.

**절대 금지: 알레르기 정보 모순 금지**
- 한 번 알레르기가 있다고 안내한 음식 (has_allergy=true)은 같은 대화 안에서 계속 "주의해야 하는 음식"으로 일관되게 설명하세요.
- 알레르기 정보와 모순되는 답변을 절대 하지 마세요.
- 이전 대화 히스토리에서 이미 언급한 알레르기 정보를 확인하고, 계속 일관되게 유지하세요.

중요: 이전 대화 히스토리를 반드시 확인하고, 기록 관리 탭에 입력한 학생 정보를 반영하여 일관되게 답변하세요. 
- 이전 대화 히스토리에서 언급한 내용 (알레르기 정보, 건강 상태, 메뉴 추천 등)을 기억하고 일관되게 유지하세요.
- 기록 관리 탭에 입력한 정보 (알레르기, BMR, BMI 등)를 반드시 참고하여 답변하세요.
- 만약 이전 대화에서 알레르기 메뉴를 언급했다면 (예: "어묵매운탕을 조심하세요"), 나중에 "알레르기를 유발하는 음식이 없다"고 말하지 마세요.
- 대화 히스토리와 아래 제공된 기록 관리 정보를 일관되게 유지하세요.
- **절대로 한 대화 안에서 알레르기가 있다고 했다가 없다고 하지 마세요.**

오늘의 급식 메뉴 정보:
${todayMenu.map((m, i) => {
  const allergyText = m.allergyNames ? ` (알레르기: ${m.allergyNames})` : '';
  return `${i + 1}. ${m.name}${allergyText}`;
}).join('\n')}
총 칼로리: ${totalCalories > 0 ? totalCalories.toFixed(1) : 0}kcal


${userAllergies.length > 0 ? `[기록 관리 탭에 입력한 학생 정보 - 참고용]
학생 이름: ${currentUser?.displayName || '학생'}
학생의 알레르기 정보: ${userAllergies.join(', ')}

**중요: 알레르기 정보 제공 규칙**
- 알레르기 정보는 컨디션 질문에 대한 학생의 답변 후 자동으로 별도로 안내됩니다.
- 컨디션 질문에 대한 학생의 답변에 대해서는 컨디션 피드백만 제공하고, 알레르기 정보는 언급하지 마세요.
- 알레르기 정보는 자동으로 별도로 안내되므로, 여기서는 언급하지 마세요.` : ''}

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
4. 위에 제공된 상세 영양 정보(탄수화물, 단백질, 지방, 비타민 등)를 활용하여 정확하게 답변해주세요.
5. 대화는 3~7회 정도로 자연스럽게 진행되도록 하세요.
6. 학생의 질문에 대해 긍정적이고 격려하는 톤으로 답변하세요.
7. 절대로 메뉴를 지어내거나 추가하지 마세요. 위에 제공된 메뉴 정보만 사용하세요.
8. **급식 챗봇의 주요 역할:**
   - 컨디션 묻기: 건강 상태에 대한 질문
   - 음식 영양정보 안내하기: 상세 영양 정보를 활용한 설명
   - 알레르기 정보는 컨디션 질문 후 자동으로 별도로 안내되므로, 여기서는 언급하지 마세요.
9. 건강 상태에 대한 질문에 학생이 답변하면, 컨디션에 대한 피드백만 제공하세요. 알레르기 정보는 자동으로 별도로 안내되므로, 여기서는 언급하지 마세요.
10. 알레르기 정보는 컨디션 질문 후 자동으로 별도로 안내되므로, 여기서는 언급하지 마세요.
13. **기초대사량(BMR), BMI, 목표 몸무게, 식사 비율 등은 언급하지 마세요. 기록 관리 탭에서만 다루는 내용입니다.**
14. "오늘의 급식 칼로리가 맞는지 확인해볼까?" 같은 칼로리 확인 질문은 하지 마세요. 대신 "00에게 적합한 메뉴를 알아볼까?" 또는 "00에게 추천하는 메뉴를 알려줄까?" 같은 방식으로 학생에게 적합한 메뉴를 제안하는 방향으로 대화를 이끌어주세요.`
          },
          ...chatHistory
    ];

    // 항상 Netlify Function을 통해 호출
    const functionUrl = getNetlifyFunctionUrl('openai-chat');
    console.log('🤖 OpenAI API 호출 (Netlify Function):', functionUrl);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'gpt-3.5-turbo',
        max_tokens: 500,
        temperature: 0.8
      }),
    }).catch(error => {
      console.error('❌ OpenAI API Fetch 오류:', error);
      throw new Error(`네트워크 오류: ${error.message}`);
    });
    
    console.log('📡 OpenAI API 응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API 호출 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
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
  
  // 봇 메시지인 경우 캐릭터 아바타 추가
  if (sender === 'bot') {
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = '/밥체크.png';
    avatarImg.alt = '밥체크';
    avatarImg.className = 'bot-avatar';
    avatarDiv.appendChild(avatarImg);
    messageDiv.appendChild(avatarDiv);
  }
  
  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';
  
  // 메시지에 줄바꿈이 있으면 <br> 태그로 변환하여 표시
  const formattedMessage = message.replace(/\n/g, '<br>');
  messageContent.innerHTML = formattedMessage;
  
  messageDiv.appendChild(messageContent);
  
  // 사용자 메시지인 경우 아바타 추가 (선택사항)
  if (sender === 'user') {
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar user-avatar';
    avatarDiv.textContent = '👤';
    messageDiv.appendChild(avatarDiv);
  }
  
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
  // 먼저 오늘의 급식 메뉴를 가져옴 (API에서 실제 메뉴 가져오기)
  await fetchTodayMenu();
  
  // 챗봇 상태 초기화 (항상 새로 시작)
  chatTurn = 0;
  chatHistory = [];
  
  // 메뉴가 없으면 안내 메시지
  if (todayMenu.length === 0) {
    addChatMessage('bot', '오늘은 급식 메뉴 정보를 가져올 수 없어. (주말이거나 공휴일일 수 있어)');
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
      const healthQuestion = '오늘 건강은 어때? 컨디션이 어떤지 궁금해!';
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
  
  // 컨디션 관련 답변인지 확인 (1턴 또는 2턴에서 컨디션 질문에 대한 답변)
  const isHealthResponse = chatTurn === 1 || chatTurn === 2;
  const lowerMessage = userMessage.toLowerCase();
  const isHealthRelated = lowerMessage.includes('좋') || lowerMessage.includes('괜찮') || 
                          lowerMessage.includes('안좋') || lowerMessage.includes('나쁘') ||
                          lowerMessage.includes('피곤') || lowerMessage.includes('아픈') ||
                          lowerMessage.includes('컨디션') || lowerMessage.includes('건강');
  
  // ChatGPT API 호출 (시스템 프롬프트에 이미 알레르기 정보와 위험 메뉴 목록이 포함되어 있음)
  const botResponse = await callChatGPTAPI(userMessage);
  addChatMessage('bot', botResponse);
  
  // 컨디션 질문에 대한 답변 후 알레르기 정보 자동 안내
  if (isHealthResponse && isHealthRelated && userAllergies && userAllergies.length > 0) {
    setTimeout(async () => {
      const dangerousMenus = checkAllergyInMenu();
      
      if (dangerousMenus.length > 0) {
        // 알레르기 위험 메뉴가 있는 경우
        const allergyMessage = `참! ${currentUser?.displayName || '너'}는 ${userAllergies.join(', ')} 알레르기가 있네. 아래와 같은 음식을 조심해야 해:\n\n${dangerousMenus.map((menu, index) => `${index + 1}. ${menu.name} (${menu.allergies.join(', ')})`).join('\n')}`;
        addChatMessage('bot', allergyMessage);
        
        // 대화 히스토리에 추가
        chatHistory.push({
          role: 'assistant',
          content: allergyMessage
        });
      } else {
        // 알레르기 위험 메뉴가 없는 경우
        const safeMessage = `${currentUser?.displayName || '너'}는 ${userAllergies.join(', ')} 알레르기가 있지만, 오늘 급식에는 해당 알레르기 성분이 포함된 메뉴가 없어서 안전하게 먹을 수 있어!`;
        addChatMessage('bot', safeMessage);
        
        // 대화 히스토리에 추가
        chatHistory.push({
          role: 'assistant',
          content: safeMessage
        });
      }
    }, 1500);
  }
  
  // 3턴 이상이면 대화 끝내기 버튼 표시
  if (chatTurn >= 3) {
    endChatBtn.classList.remove('hidden');
  }
  
  // 최대 7턴 체크
  if (chatTurn >= 7) {
    chatInput.disabled = true;
    sendBtn.disabled = true;
    endChatBtn.classList.remove('hidden');
    addChatMessage('bot', '대화가 충분히 진행됐어. 이제 음식 기록으로 넘어가자!');
  }
}

// 대화 끝내기
async function endChatbot() {
  chatbotSection.classList.add('hidden');
  recordSection.classList.remove('hidden');
  initializeRecordSection();
}

// 기록 섹션 초기화
async function initializeRecordSection() {
  // todayMenu가 없으면 먼저 로드
  if (!todayMenu || todayMenu.length === 0) {
    await fetchTodayMenu();
  }
  
  // 기존 점심 기록 불러오기
  await loadExistingLunchRecord();
  
  // 기존 간식 기록 불러오기
  await loadExistingSnackRecord();
  
  // 점심 메뉴 리스트 생성
  renderLunchMenuList();
  
  // 버튼 이벤트 리스너
  setupMenuControls();
  updateTotalCalories();
  
  // 그래프 초기화 (todayMenu가 있을 때만)
  if (todayMenu && todayMenu.length > 0) {
    initConsumptionChart();
  }
}

// 점심 메뉴 리스트 렌더링
function renderLunchMenuList() {
  lunchMenuList.innerHTML = '';
  
  // todayMenu가 없거나 비어있으면 메시지 표시
  if (!todayMenu || todayMenu.length === 0) {
    lunchMenuList.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 20px;">오늘의 급식 메뉴를 불러올 수 없습니다.</p>';
    return;
  }
  
  todayMenu.forEach(menu => {
    const count = lunchRecords[menu.name] || 0;
    const menuCalories = getAdjustedCalories(menu.name);
    const onePortionCalories = Math.round(menuCalories);
    
    // 1인분 칼로리 항상 표시
    const caloriesDisplay = `<span class="menu-calories">(1인분: ${onePortionCalories}kcal)</span>`;
    
    const menuItem = document.createElement('div');
    menuItem.className = 'menu-item';
    menuItem.style.cursor = 'pointer';
    menuItem.innerHTML = `
      <div class="menu-info" data-menu="${menu.name}">
        <span class="menu-name">${menu.name}</span>
        ${caloriesDisplay}
    </div>
      <div class="menu-controls">
        <button class="count-btn minus" data-menu="${menu.name}">-</button>
        <input type="number" class="count-input" id="count-${menu.name}" 
               value="${count}" min="0" max="10" 
               data-menu="${menu.name}" />
        <button class="count-btn plus" data-menu="${menu.name}">+</button>
  </div>
    `;
    lunchMenuList.appendChild(menuItem);
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
  updateConsumptionChart();
}

// 총 칼로리 업데이트 (먹은 양에 따라 실제 섭취 칼로리 계산)
function updateTotalCalories() {
  // 각 메뉴의 칼로리 × 인분 수를 합산하여 실제 섭취 칼로리 계산
  let actualCalories = 0;
  let detailItems = [];
  
  todayMenu.forEach(menu => {
    const count = lunchRecords[menu.name] || 0;
    if (count > 0) {
      const menuCalories = getAdjustedCalories(menu.name);
      const menuTotalCalories = menuCalories * count;
      actualCalories += menuTotalCalories;
      
      // 상세 정보에 추가
      const onePortionCal = Math.round(menuCalories);
      const totalCal = Math.round(menuTotalCalories);
      detailItems.push(`${menu.name}: ${onePortionCal}kcal × ${count}인분 = ${totalCal}kcal`);
    }
  });
  
  const actualCaloriesRounded = Math.round(actualCalories);
  
  // 총 칼로리 표시 (먹은 인분만큼 계산된 칼로리)
  lunchTotalCalories.textContent = actualCaloriesRounded > 0 ? actualCaloriesRounded : 0;
  
  // 상세 정보 표시 (먹은 음식별 칼로리 계산 내역)
  if (calorieDetail) {
    if (detailItems.length > 0) {
      calorieDetail.innerHTML = `<strong>섭취 칼로리 계산:</strong><br>${detailItems.join('<br>')}<br><strong>총 섭취 칼로리: ${actualCaloriesRounded}kcal</strong>`;
    } else {
      calorieDetail.innerHTML = '<em>먹은 음식을 선택하면 칼로리가 계산됩니다.</em>';
    }
    calorieDetail.style.display = 'block';
  }
}

// 섭취량 막대그래프 초기화
function initConsumptionChart() {
  const ctx = document.getElementById('consumption-chart');
  if (!ctx) return;
  
  // todayMenu가 없거나 비어있으면 그래프를 생성하지 않음
  if (!todayMenu || todayMenu.length === 0) {
    console.log('⚠️ 그래프 초기화: 메뉴가 없어서 그래프를 생성하지 않습니다.');
    return;
  }
  
  // 기존 차트가 있으면 제거
  if (consumptionChart) {
    consumptionChart.destroy();
  }
  
  // 먹은 음식만 필터링 (count > 0인 음식만)
  const eatenMenus = todayMenu.filter(menu => {
    const count = lunchRecords[menu.name] || 0;
    return count > 0;
  });
  
  // 먹은 음식이 없으면 그래프를 생성하지 않음
  if (eatenMenus.length === 0) {
    console.log('⚠️ 그래프 초기화: 먹은 음식이 없어서 그래프를 생성하지 않습니다.');
    return;
  }
  
  const labels = eatenMenus.map(menu => menu.name);
  const data = eatenMenus.map(menu => lunchRecords[menu.name] || 0);
  
  consumptionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '섭취량 (인분)',
          data: data,
          backgroundColor: data.map(count => {
            if (count === 1) return 'rgba(76, 175, 80, 0.7)'; // 1인분 (권장)
            if (count >= 3) return 'rgba(244, 67, 54, 0.7)'; // 3인분 이상 (과다)
            return 'rgba(255, 152, 0, 0.7)'; // 2인분 (주의)
          }),
          borderColor: data.map(count => {
            if (count === 1) return 'rgba(76, 175, 80, 1)';
            if (count >= 3) return 'rgba(244, 67, 54, 1)';
            return 'rgba(255, 152, 0, 1)';
          }),
          borderWidth: 2
        },
        {
          label: '권장 섭취량 (1인분)',
          data: labels.map(() => 1),
          type: 'line',
          borderColor: '#4CAF50',
          borderWidth: 3,
          borderDash: [8, 4],
          fill: false,
          pointRadius: 0,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.datasetIndex === 0) {
                const count = context.parsed.y;
                let status = '';
                if (count === 0) status = ' (미섭취)';
                else if (count === 1) status = ' (권장)';
                else if (count >= 3) status = ' (과다 섭취)';
                else status = ' (주의)';
                return `섭취량: ${count}인분${status}`;
              } else {
                return '권장 섭취량: 1인분';
              }
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          ticks: {
            stepSize: 1,
            callback: function(value) {
              return value + '인분';
            }
          },
          title: {
            display: true,
            text: '섭취량 (인분)',
            font: {
              size: 12
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: {
              size: 11
            }
          }
        }
      }
    }
  });
}

// 섭취량 막대그래프 업데이트
function updateConsumptionChart() {
  // todayMenu가 없으면 업데이트하지 않음
  if (!todayMenu || todayMenu.length === 0) {
    return;
  }
  
  // 먹은 음식만 필터링 (count > 0인 음식만)
  const eatenMenus = todayMenu.filter(menu => {
    const count = lunchRecords[menu.name] || 0;
    return count > 0;
  });
  
  // 먹은 음식이 없으면 그래프 제거
  if (eatenMenus.length === 0) {
    if (consumptionChart) {
      consumptionChart.destroy();
      consumptionChart = null;
    }
    return;
  }
  
  // 그래프가 없거나 레이블이 변경되었으면 재초기화
  if (!consumptionChart) {
    initConsumptionChart();
    return;
  }
  
  const labels = eatenMenus.map(menu => menu.name);
  const data = eatenMenus.map(menu => lunchRecords[menu.name] || 0);
  
  // 레이블이 변경되었으면 그래프 재생성
  const currentLabels = consumptionChart.data.labels || [];
  if (labels.length !== currentLabels.length || 
      labels.some((label, idx) => label !== currentLabels[idx])) {
    consumptionChart.destroy();
    initConsumptionChart();
    return;
  }
  
  // 데이터만 업데이트
  consumptionChart.data.datasets[0].data = data;
  consumptionChart.data.datasets[0].backgroundColor = data.map(count => {
    if (count === 1) return 'rgba(76, 175, 80, 0.7)';
    if (count >= 3) return 'rgba(244, 67, 54, 0.7)';
    return 'rgba(255, 152, 0, 0.7)';
  });
  consumptionChart.data.datasets[0].borderColor = data.map(count => {
    if (count === 1) return 'rgba(76, 175, 80, 1)';
    if (count >= 3) return 'rgba(244, 67, 54, 1)';
    return 'rgba(255, 152, 0, 1)';
  });
  
  consumptionChart.update();
}

// 간식 추가
function addSnack() {
  const snackName = snackInput.value.trim();
  if (!snackName) return;
  
  snackList.push(snackName);
  snackInput.value = '';
  updateSnackList();
}

// 이미지를 Base64로 변환
function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// OpenAI Vision API로 간식 이미지 분석
async function analyzeSnackImage(imageFile) {
  try {
    // 이미지를 Base64로 변환
    const base64Image = await imageToBase64(imageFile);
    
    const prompt = '이 사진에 있는 간식(음식)을 분석해주세요. 간식의 이름을 정확하게 알려주세요. 만약 여러 개의 간식이 있다면 쉼표로 구분하여 모두 나열해주세요. 한국어로 간단하게 답변해주세요. 예: "초콜릿 쿠키, 사과, 우유" 또는 "빵 2개, 과자" 등. 간식 이름만 나열하고 다른 설명은 하지 마세요.';
    
    // 항상 Netlify Function을 통해 호출
    const functionUrl = getNetlifyFunctionUrl('openai-vision');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Image,
        prompt,
        model: 'gpt-4o-mini',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API 호출 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('간식 이미지 분석 오류:', error);
    return `이미지 분석 중 오류가 발생했습니다: ${error.message}`;
  }
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
    
    // 먹은 메뉴 중 알레르기 유발 음식 찾기
    const allergyDangerousMenus = [];
    if (userAllergies && userAllergies.length > 0) {
      // 알레르기 번호 매핑
      const allergyNumberMap = {
        '난류': '1', '우유': '2', '메밀': '3', '땅콩': '4', '대두': '5',
        '밀': '6', '고등어': '7', '게': '8', '새우': '9', '돼지고기': '10',
        '복숭아': '11', '토마토': '12', '아황산류': '13', '호두': '14',
        '닭고기': '15', '쇠고기': '16', '오징어': '17', '조개류': '18', '잣': '19'
      };
      
      const userAllergyNumbers = userAllergies
        .map(allergy => allergyNumberMap[allergy])
        .filter(num => num !== undefined);
      
      eatenMenus.forEach(item => {
        // todayMenu에서 해당 메뉴의 알레르기 정보 찾기
        const menuItem = todayMenu.find(m => m.name === item.name);
        if (menuItem && menuItem.allergyInfo && menuItem.allergyInfo.trim() !== '') {
          const menuAllergyNumbers = menuItem.allergyInfo.split('.').map(num => num.trim()).filter(num => num);
          const hasAllergy = menuAllergyNumbers.some(num => userAllergyNumbers.includes(num));
          
          if (hasAllergy) {
            const matchedAllergies = menuAllergyNumbers
              .filter(num => userAllergyNumbers.includes(num))
              .map(num => {
                const allergyName = Object.keys(allergyNumberMap).find(
                  key => allergyNumberMap[key] === num
                );
                return allergyName || num;
              });
            
            allergyDangerousMenus.push({
              name: item.name,
              allergies: matchedAllergies
            });
          }
        }
      });
    }
    
    // 지나치게 많이 섭취된 음식 찾기 (3인분 이상)
    const excessiveFoods = eatenMenus.filter(item => item.count >= 3);
    
    // 탄수화물이 많은 음식 식별 (밥, 빵, 면류, 국수, 떡, 과자 등)
    // 2인분 이상 섭취한 경우를 과다 섭취로 판단
    const carbRichFoods = eatenMenus.filter(item => {
      const name = item.name.toLowerCase();
      const carbKeywords = ['밥', '쌀밥', '볶음밥', '비빔밥', '빵', '식빵', '토스트', '샌드위치', 
                           '면', '국수', '라면', '우동', '파스타', '스파게티', '떡', '떡볶이', 
                           '과자', '쿠키', '비스킷', '크래커', '도넛', '케이크', '만두',
                           '수제비', '칼국수', '냉면', '짜장면', '짬뽕', '라멘', '당면', '쫄면'];
      const isCarbRich = carbKeywords.some(keyword => name.includes(keyword));
      // 탄수화물 음식이면서 2인분 이상 섭취한 경우
      return isCarbRich && item.count >= 2;
    });
    
    const messages = [
          {
            role: 'system',
            content: `당신은 영양사이자 건강 관리 전문가입니다. 학생들이 먹은 점심 식사의 영양을 분석하고 건강한 식습관을 위한 조언을 제공합니다.

오늘 학생이 먹은 점심 식사:
${menuSummary}
총 칼로리: ${lunchData.totalCalories}kcal

${userAllergies && userAllergies.length > 0 ? `알레르기 정보: ${userAllergies.join(', ')}` : ''}

${allergyDangerousMenus.length > 0 ? `[알레르기 주의 사항 - 매우 중요]
학생이 먹은 음식 중 알레르기 반응을 유발할 수 있는 음식이 있습니다:
${allergyDangerousMenus.map(menu => `- ${menu.name} (알레르기: ${menu.allergies.join(', ')})`).join('\n')}

**절대 금지: 알레르기 정보 일관성 유지**
- 위에 나열된 음식들은 이 대화 전체에서 계속 "주의해야 하는 음식"으로 일관되게 설명하세요.
- 한 번 알레르기가 있다고 안내한 음식은 같은 대화 안에서 절대로 "알레르기가 없다"고 말하지 마세요.
- 이전 대화 히스토리에서 이미 언급한 알레르기 정보를 확인하고, 계속 일관되게 유지하세요.
- 알레르기 정보와 모순되는 답변을 절대 하지 마세요.

중요: 알레르기 유발 음식을 먹었을 경우, 반드시 다음을 수행하세요:
1. 먼저 "점심에 알레르기가 유발될 수 있는 음식을 드셨군요. 컨디션이 괜찮으신가요?"라고 물어보세요.
2. 학생의 컨디션에 대한 답변을 받은 후, 해당 알레르기 유발 음식에 대해 언급하고 줄이는 것이 좋다고 조언하세요.
3. 예시: "${allergyDangerousMenus[0].name}은(는) ${allergyDangerousMenus[0].allergies.join(', ')} 알레르기가 있으니 좀 줄이는 게 좋을 것 같아요."와 같은 형식으로 조언하세요.
4. **이 음식들은 이 대화 전체에서 계속 "주의해야 하는 음식"으로 언급하세요. 나중에 "알레르기가 없다"고 말하지 마세요.**` : ''}

${excessiveFoods.length > 0 ? `[과다 섭취 음식]
지나치게 많이 섭취된 음식이 있습니다:
${excessiveFoods.map(food => `- ${food.name}: ${food.count}인분`).join('\n')}

중요: 지나치게 많이 섭취된 음식에 대해 언급하고, 적절한 섭취량에 대한 조언을 제공하세요.` : ''}

${carbRichFoods.length > 0 ? `[탄수화물이 많은 음식]
탄수화물로 추정되는 음식을 많이 섭취했습니다:
${carbRichFoods.map(food => `- ${food.name}: ${food.count}인분`).join('\n')}

중요: 탄수화물이 많은 음식을 많이 섭취한 경우, 반드시 운동 처방을 함께 제공하세요.
- 탄수화물 과다 섭취에 대한 설명과 함께
- 구체적인 운동 종류와 시간을 제안하세요 (예: 걷기 30분, 줄넘기 10분, 계단 오르기 15분 등)
- 학생의 키, 몸무게, 목표 몸무게를 고려하여 적절한 운동 강도를 제안하세요.` : ''}

${nutritionInfo ? `오늘 급식의 전체 영양 정보:
${Object.entries(nutritionInfo).map(([key, value]) => `${key}: ${value}`).join('\n')}` : ''}

중요 지침:
1. 모든 답변은 짧은 문장으로 3문장 이내로 작성해주세요. 간결하고 명확하게 답변하세요.
2. **기본 양(1인분) 대비 무엇을 얼마나 더 먹었는지, 덜 먹었는지만 안내하세요.**
3. **기초대사량(BMR), BMI, 목표 몸무게, 식사 비율 등은 언급하지 마세요. 기록 관리 탭에서만 다루는 내용입니다.**
4. 건강한 식습관을 위한 구체적이고 실용적인 조언을 제공해주세요.
5. 긍정적이고 격려하는 톤으로 답변하세요.
6. 학생의 건강을 위한 따뜻한 조언을 해주세요.
${userAllergies && userAllergies.length > 0 ? `7. **간식 추천 시 알레르기 정보 반영 (매우 중요):**
   - 학생의 알레르기 정보: ${userAllergies.join(', ')}
   - 간식을 추천할 때는 반드시 학생의 알레르기 정보를 확인하세요.
   - ${userAllergies.join(', ')} 알레르기가 있는 음식은 절대 추천하지 마세요.
   - 알레르기 유발 성분이 포함된 간식(예: 난류 알레르기 시 아이스크림, 쿠키, 케이크 등)을 추천한 후 "피하세요"라고 말하는 모순된 답변을 절대 하지 마세요.
   - 알레르기가 있는 음식을 추천했다가 나중에 피하라고 말하는 일이 없도록 주의하세요.
   - 알레르기 정보를 먼저 확인하고, 알레르기가 없는 안전한 간식만 추천하세요.
   - 예시: "난류, 우유 알레르기가 있으시니 아이스크림은 피하시고, 과일이나 견과류를 드시는 게 좋을 것 같아요."` : ''}
${carbRichFoods.length > 0 ? `${userAllergies && userAllergies.length > 0 ? '8' : '7'}. **탄수화물 과다 섭취 시 운동 처방 (매우 중요):**
   - 위의 "[탄수화물이 많은 음식]"에 나열된 음식들을 많이 섭취한 경우, 반드시 운동 처방을 함께 제공하세요.
   - 탄수화물 과다 섭취에 대한 설명과 함께 구체적인 운동 종류와 시간을 제안하세요.
   - 예시: "탄수화물을 많이 드셨네요. 걷기 30분이나 줄넘기 10분을 하시면 좋을 것 같아요."` : ''}
${allergyDangerousMenus.length > 0 ? `${userAllergies && userAllergies.length > 0 && carbRichFoods.length > 0 ? '9' : userAllergies && userAllergies.length > 0 || carbRichFoods.length > 0 ? '8' : '7'}. **알레르기 정보 일관성 (매우 중요):**
   - 위의 "[알레르기 주의 사항]"에 나열된 음식들은 이 대화 전체에서 계속 "주의해야 하는 음식"으로 일관되게 설명하세요.
   - 한 번 알레르기가 있다고 안내한 음식은 같은 대화 안에서 절대로 "알레르기가 없다"고 말하지 마세요.
   - 이전 대화 히스토리를 확인하고, 이미 언급한 알레르기 정보를 계속 유지하세요.
   - 알레르기 정보와 모순되는 답변을 절대 하지 마세요.
   - 알레르기 유발 음식에 대해서는 반드시 컨디션 확인 후 조언을 제공하세요.` : ''}
${excessiveFoods.length > 0 ? `${userAllergies && userAllergies.length > 0 && carbRichFoods.length > 0 && allergyDangerousMenus.length > 0 ? '10' : userAllergies && userAllergies.length > 0 && (carbRichFoods.length > 0 || allergyDangerousMenus.length > 0) ? '9' : userAllergies && userAllergies.length > 0 || carbRichFoods.length > 0 || allergyDangerousMenus.length > 0 ? '8' : '7'}. 지나치게 많이 섭취된 음식에 대해서는 반드시 언급하고 조언을 제공하세요.` : ''}

**절대 금지 사항:**
- 모순된 표현 사용 금지 (예: "따뜻한 찬음식", "차가운 따뜻한 음식" 등)
- 알레르기 유발 음식을 추천한 후 피하라고 말하는 일관성 없는 답변 금지
- 알레르기 정보를 확인하지 않고 간식을 추천하는 행위 금지
- 이전 대화에서 언급한 알레르기 정보와 모순되는 답변 금지`
          },
          ...nutritionChatHistory
    ];

    // 항상 Netlify Function을 통해 호출
    const functionUrl = getNetlifyFunctionUrl('openai-chat');
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: 'gpt-3.5-turbo',
        max_tokens: 500,
        temperature: 0.8
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API 호출 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
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
  
  // 대화 히스토리 초기화 (항상 새로 시작)
  nutritionChatHistory = [];
  nutritionChatMessages.innerHTML = '';
  
  // 먹은 메뉴 정보 정리
  const eatenMenus = lunchData.menuItems.filter(item => item.count > 0);
  const menuSummary = eatenMenus.map(item => 
    `${item.name} ${item.count}인분`
  ).join(', ');
  
  // 기본 양(1인분)과 실제 먹은 양 비교
  const moreEaten = eatenMenus.filter(item => item.count > 1);
  const lessEaten = todayMenu.filter(menu => {
    const count = lunchRecords[menu.name] || 0;
    return count === 0;
  });
  
  let comparisonMessage = '';
  if (moreEaten.length > 0) {
    comparisonMessage += `\n\n기본 양보다 더 드신 음식:\n${moreEaten.map(item => `- ${item.name}: 기본 1인분 → 실제 ${item.count}인분 (+${item.count - 1}인분)`).join('\n')}`;
  }
  if (lessEaten.length > 0) {
    comparisonMessage += `\n\n기본 양보다 덜 드신 음식:\n${lessEaten.map(menu => `- ${menu.name}: 기본 1인분 → 실제 0인분`).join('\n')}`;
  }
  
  // 초기 브리핑 메시지
  const greetingMessage = `안녕! 오늘 점심에 ${menuSummary}를 드셨군요!${comparisonMessage}`;
  addNutritionMessage('bot', greetingMessage);
  
  // 자동으로 영양 분석 시작
  setTimeout(async () => {
    addNutritionMessage('bot', '영양 분석 중...');
    
    // 먹은 메뉴 목록과 기본 양 대비 비교 정보 포함
    const eatenMenuList = eatenMenus.map(item => `- ${item.name}: ${item.count}인분`).join('\n');
    const comparisonInfo = comparisonMessage;
    
    // 알레르기 정보 추가
    let allergyInfo = '';
    if (userAllergies && userAllergies.length > 0) {
      allergyInfo = `\n\n[알레르기 정보 - 간식 추천 시 필수 확인]
학생의 알레르기: ${userAllergies.join(', ')}
- 간식을 추천할 때는 반드시 위 알레르기 정보를 확인하고, ${userAllergies.join(', ')} 알레르기 유발 성분이 포함된 간식은 절대 추천하지 마세요.
- 알레르기 유발 성분이 포함된 간식을 추천한 후 "피하세요"라고 말하는 모순된 답변을 절대 하지 마세요.
- 알레르기 정보를 먼저 확인하고, 알레르기가 없는 안전한 간식만 추천하세요.`;
    }
    
    const analysisPrompt = `오늘 점심에 먹은 음식들:\n${eatenMenuList}\n\n${comparisonInfo}${allergyInfo}\n\n위 정보를 바탕으로 먹은 것들을 언급하고, 기본 양(1인분) 대비 무엇을 얼마나 더 먹었는지, 덜 먹었는지 안내해주세요. 그리고 마지막에 "오늘 간식을 추천해드릴까요?"라고 질문해주세요.`;
    const analysis = await callNutritionChatGPTAPI(analysisPrompt, lunchData);
    
    // "영양 분석 중..." 메시지 제거하고 실제 분석 결과 표시
      if (nutritionChatMessages.lastChild) {
    nutritionChatMessages.removeChild(nutritionChatMessages.lastChild);
      }
    addNutritionMessage('bot', analysis);
    
    // 간식 추천 질문이 포함되어 있는지 확인하고, 없으면 추가
    if (!analysis.includes('간식을 추천') && !analysis.includes('간식 추천')) {
      setTimeout(() => {
        addNutritionMessage('bot', '오늘 간식을 추천해드릴까요?');
      }, 500);
    }
  }, 1000);
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
  
  // 실제 섭취 칼로리 계산 (먹은 양에 따라)
  let actualCalories = 0;
  todayMenu.forEach(menu => {
    const count = lunchRecords[menu.name] || 0;
    if (count > 0) {
      const menuCalories = getAdjustedCalories(menu.name);
      actualCalories += menuCalories * count;
    }
  });
  
  const lunchData = {
    records: lunchRecords,
    totalCalories: actualCalories > 0 ? Math.round(actualCalories) : totalCalories, // 실제 섭취 칼로리
    baseCalories: totalCalories, // 기본 칼로리 (1인분 기준, API에서 가져온 값)
    menuItems: todayMenu.map(menu => ({
      name: menu.name,
      count: lunchRecords[menu.name] || 0,
      calories: getAdjustedCalories(menu.name) * (lunchRecords[menu.name] || 0), // 각 메뉴의 실제 칼로리 (비율 조정됨)
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
    
    // 저장 완료 표시
    submitBtn.textContent = '✅ 저장완료';
    submitBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    
    // 새로입력하기 버튼 표시
    if (newLunchBtn) {
      newLunchBtn.classList.remove('hidden');
    }
  
    // 영양 브리핑 챗봇 시작 (화면 전환)
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
    
    // 저장 완료 표시
    submitBtn.textContent = '✅ 저장완료';
    submitBtn.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    
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

// 카메라 버튼 클릭 시 파일 입력 트리거
if (cameraSnackBtn) {
  cameraSnackBtn.addEventListener('click', () => {
    snackImageInput.click();
  });
}

// 이미지 선택 시 미리보기 표시
if (snackImageInput) {
  snackImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 이미지 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      snackPreviewImg.src = e.target.result;
      snackImagePreview.style.display = 'block';
      snackAnalysisResult.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}

// AI 분석 버튼 클릭
if (analyzeSnackBtn) {
  analyzeSnackBtn.addEventListener('click', async () => {
    const file = snackImageInput.files[0];
    if (!file) {
      alert('이미지를 선택해주세요.');
      return;
    }
    
    // 분석 중 표시
    analyzeSnackBtn.disabled = true;
    analyzeSnackBtn.textContent = '분석 중...';
    snackAnalysisResult.style.display = 'block';
    snackAnalysisResult.innerHTML = '<p>AI가 이미지를 분석하고 있습니다...</p>';
    
    try {
      const analysisResult = await analyzeSnackImage(file);
      snackAnalysisResult.innerHTML = `<p><strong>분석 결과:</strong> ${analysisResult}</p>`;
      
      // 분석 결과에서 간식 이름 추출하여 자동 추가
      // 쉼표, 줄바꿈, 또는 "와" 같은 구분자로 분리
      let snackNames = analysisResult
        .replace(/[와과,]/g, ',') // "와", "과", 쉼표를 모두 쉼표로 변환
        .split(/[,，\n]/) // 쉼표(한글/영문), 줄바꿈으로 분리
        .map(name => name.trim())
        .filter(name => {
          // 유효한 간식 이름인지 확인
          return name.length > 0 && 
                 !name.includes('오류') && 
                 !name.includes('분석') &&
                 !name.includes('사진') &&
                 !name.match(/^\d+$/); // 숫자만 있는 경우 제외
        });
      
      // 중복 제거 및 추가
      if (snackNames.length > 0) {
        let addedCount = 0;
        snackNames.forEach(name => {
          if (!snackList.includes(name) && name.length > 0) {
            snackList.push(name);
            addedCount++;
          }
        });
        
        if (addedCount > 0) {
          updateSnackList();
          snackAnalysisResult.innerHTML += `<p style="color: green; margin-top: 10px;">✅ ${addedCount}개의 간식이 목록에 추가되었습니다!</p>`;
        } else {
          snackAnalysisResult.innerHTML += `<p style="color: orange; margin-top: 10px;">ℹ️ 이미 목록에 있는 간식입니다.</p>`;
        }
      } else {
        snackAnalysisResult.innerHTML += `<p style="color: orange; margin-top: 10px;">ℹ️ 분석 결과에서 간식 이름을 찾을 수 없습니다. 수동으로 입력해주세요.</p>`;
      }
    } catch (error) {
      snackAnalysisResult.innerHTML = `<p style="color: red;">분석 중 오류가 발생했습니다: ${error.message}</p>`;
    } finally {
      analyzeSnackBtn.disabled = false;
      analyzeSnackBtn.textContent = 'AI 분석하기';
    }
  });
}

// 취소 버튼 클릭
if (cancelSnackImageBtn) {
  cancelSnackImageBtn.addEventListener('click', () => {
    snackImageInput.value = '';
    snackImagePreview.style.display = 'none';
    snackAnalysisResult.style.display = 'none';
    snackPreviewImg.src = '';
  });
}

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
      initConsumptionChart();
      newLunchBtn.classList.add('hidden');
      
      // 제출 버튼 원래 상태로 복원
      const submitBtn = document.getElementById('submit-lunch-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '점심 제출하기';
        submitBtn.style.background = ''; // 원래 스타일로 복원
      }
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
      
      // 제출 버튼 원래 상태로 복원
      const submitBtn = document.getElementById('submit-snack-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '간식 제출하기';
        submitBtn.style.background = ''; // 원래 스타일로 복원
      }
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
  
  // 실제 섭취 칼로리 계산
  let actualCalories = 0;
  todayMenu.forEach(menu => {
    const count = lunchRecords[menu.name] || 0;
    if (count > 0) {
      const menuCalories = getAdjustedCalories(menu.name);
      actualCalories += menuCalories * count;
    }
  });
  
  const lunchData = {
    records: lunchRecords,
    totalCalories: actualCalories > 0 ? Math.round(actualCalories) : totalCalories,
    baseCalories: totalCalories,
    menuItems: todayMenu.map(menu => ({
      name: menu.name,
      count: lunchRecords[menu.name] || 0,
      calories: getAdjustedCalories(menu.name) * (lunchRecords[menu.name] || 0),
      allergyNames: menu.allergyNames || ''
    }))
  };
  
  // 간식 추천 요청인지 확인
  const lowerMessage = message.toLowerCase();
  const isSnackRecommendationRequest = lowerMessage.includes('네') || lowerMessage.includes('좋아') || lowerMessage.includes('추천') || lowerMessage.includes('해줘') || lowerMessage.includes('해주세요') || lowerMessage.includes('간식');
  
  // 간식 추천 요청인 경우 알레르기 정보를 명확히 포함한 프롬프트 사용
  let finalMessage = message;
  if (isSnackRecommendationRequest && userAllergies && userAllergies.length > 0) {
    finalMessage = `${message}\n\n[중요: 간식 추천 시 알레르기 정보 반영 필수]
학생의 알레르기 정보: ${userAllergies.join(', ')}
- ${userAllergies.join(', ')} 알레르기가 있으므로, 해당 알레르기 유발 성분이 포함된 간식은 절대 추천하지 마세요.
- 알레르기 유발 성분이 포함된 간식을 추천한 후 "피하세요"라고 말하는 모순된 답변을 절대 하지 마세요.
- 알레르기 정보를 먼저 확인하고, 알레르기가 없는 안전한 간식만 추천하세요.
- 예시: "난류, 우유 알레르기가 있으시니 아이스크림, 쿠키, 케이크 등은 피하시고, 과일이나 견과류를 드시는 게 좋을 것 같아요."`;
  }
  
  const botResponse = await callNutritionChatGPTAPI(finalMessage, lunchData);
  addNutritionMessage('bot', botResponse);
  
  // 간식 추천 질문에 긍정적으로 답한 경우, 간식 추천 후 자동으로 운동 추천 메시지 추가
  const lowerResponse = botResponse.toLowerCase();
  
  // 간식 추천 관련 대화가 끝났는지 확인
  const isSnackRecommendationResponse = lowerResponse.includes('간식') || lowerResponse.includes('추천') || lowerResponse.includes('드릴게요') || lowerResponse.includes('드리겠습니다');
  
  if (isSnackRecommendationRequest && isSnackRecommendationResponse) {
    // 간식 추천 대화가 끝나면 운동 추천 메시지 추가
    setTimeout(async () => {
      // 이전 메시지가 운동 추천이 아닌 경우에만 추가
      const lastMessages = Array.from(nutritionChatMessages.children).slice(-5);
      const hasExerciseRecommendation = lastMessages.some(msg => {
        const content = msg.textContent || '';
        return content.includes('운동') && (content.includes('추천') || content.includes('안내'));
      });
      
      if (!hasExerciseRecommendation) {
        addNutritionMessage('bot', '오늘의 운동을 추천드리겠습니다.');
        const exercisePrompt = '점심에 먹은 음식의 양과 영양소를 고려하여 적절한 운동을 안내해주세요. 구체적인 운동 종류와 시간을 제안해주세요.';
        const exerciseResponse = await callNutritionChatGPTAPI(exercisePrompt, lunchData);
        addNutritionMessage('bot', exerciseResponse);
      }
    }, 2000);
  }
});

// 영양 브리핑 챗봇 Enter 키
nutritionChatInput.addEventListener('keypress', async (e) => {
  if (e.key === 'Enter') {
    nutritionSendBtn.click();
  }
});

// 영양 브리핑 챗봇 닫기
closeNutritionBtn.addEventListener('click', async () => {
  nutritionChatbotSection.classList.add('hidden');
  recordSection.classList.remove('hidden');
  // 기록 섹션 초기화 (메뉴가 없을 경우를 대비)
  await initializeRecordSection();
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

// Firebase에서 급식 챗봇 대화 불러오기 (현재 사용 안 함 - 대화는 저장만 하고 불러오지 않음)
// async function loadMealChatHistory() {
//   if (!db || !currentUser) {
//     return null;
//   }
//   
//   try {
//     const date = getTodayDate();
//     const chatHistoryRef = collection(db, 'chatHistory');
//     const q = query(
//       chatHistoryRef,
//       where('userId', '==', currentUser.uid),
//       where('date', '==', date),
//       where('type', '==', 'mealChat')
//     );
//     const querySnapshot = await getDocs(q);
//     
//     if (!querySnapshot.empty) {
//       const docData = querySnapshot.docs[0].data();
//       if (docData.messages && Array.isArray(docData.messages) && docData.messages.length > 0) {
//         console.log('✅ 저장된 급식 챗봇 대화 불러오기 완료:', docData.messages.length, '개 메시지');
//         return docData.messages;
//       }
//     }
//     return null;
//   } catch (error) {
//     console.error('급식 챗봇 대화 불러오기 오류:', error);
//     
//     // 권한 오류인 경우 안내 메시지 표시
//     if (error.code === 'permission-denied') {
//       console.warn('⚠️ Firebase 권한 오류: chatHistory 컬렉션에 대한 읽기 권한이 없습니다.');
//       console.warn('💡 Firebase Console에서 Firestore 규칙을 확인하고 배포해주세요.');
//       console.warn('   firestore.rules 파일을 Firebase Console에 배포해야 합니다.');
//     }
//     
//     // 권한 오류가 있어도 앱은 계속 작동하도록 null 반환
//     return null;
//   }
// }

// Firebase에 급식 챗봇 대화 저장
async function saveMealChatHistory() {
  if (!db) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }
  
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  
  if (!chatHistory || chatHistory.length === 0) {
    return; // 저장할 대화가 없으면 반환
  }
  
  const date = getTodayDate();
  const chatData = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    userName: currentUser.displayName || '익명',
    date: date,
    type: 'mealChat',
    messages: chatHistory,
    updatedAt: serverTimestamp()
  };
  
  // 기존 기록 확인
  const chatHistoryRef = collection(db, 'chatHistory');
  const q = query(
    chatHistoryRef,
    where('userId', '==', currentUser.uid),
    where('date', '==', date),
    where('type', '==', 'mealChat')
  );
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    // 기존 기록 업데이트
    const existingDoc = querySnapshot.docs[0];
    await updateDoc(doc(db, 'chatHistory', existingDoc.id), chatData);
    console.log('급식 챗봇 대화 업데이트 완료:', existingDoc.id);
    return existingDoc.id;
  } else {
    // 새 기록 생성
    chatData.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, 'chatHistory'), chatData);
    console.log('급식 챗봇 대화 저장 완료:', docRef.id);
    return docRef.id;
  }
}

// Firebase에서 영양 브리핑 챗봇 대화 불러오기 (현재 사용 안 함 - 대화는 저장만 하고 불러오지 않음)
// async function loadNutritionChatHistory() {
//   if (!db || !currentUser) {
//     return null;
//   }
//   
//   try {
//     const date = getTodayDate();
//     const chatHistoryRef = collection(db, 'chatHistory');
//     const q = query(
//       chatHistoryRef,
//       where('userId', '==', currentUser.uid),
//       where('date', '==', date),
//       where('type', '==', 'nutritionChat')
//     );
//     const querySnapshot = await getDocs(q);
//     
//     if (!querySnapshot.empty) {
//       const docData = querySnapshot.docs[0].data();
//       if (docData.messages && Array.isArray(docData.messages) && docData.messages.length > 0) {
//         console.log('✅ 저장된 영양 브리핑 챗봇 대화 불러오기 완료:', docData.messages.length, '개 메시지');
//         return docData.messages;
//       }
//     }
//     return null;
//   } catch (error) {
//     console.error('영양 브리핑 챗봇 대화 불러오기 오류:', error);
//     
//     // 권한 오류인 경우 안내 메시지 표시
//     if (error.code === 'permission-denied') {
//       console.warn('⚠️ Firebase 권한 오류: chatHistory 컬렉션에 대한 읽기 권한이 없습니다.');
//       console.warn('💡 Firebase Console에서 Firestore 규칙을 확인하고 배포해주세요.');
//     }
//     
//     // 권한 오류가 있어도 앱은 계속 작동하도록 null 반환
//     return null;
//   }
// }

// Firebase에 영양 브리핑 챗봇 대화 저장
async function saveNutritionChatHistory() {
  if (!db) {
    throw new Error('Firebase가 초기화되지 않았습니다.');
  }
  
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  
  if (!nutritionChatHistory || nutritionChatHistory.length === 0) {
    return; // 저장할 대화가 없으면 반환
  }
  
  const date = getTodayDate();
  const chatData = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    userName: currentUser.displayName || '익명',
    date: date,
    type: 'nutritionChat',
    messages: nutritionChatHistory,
    updatedAt: serverTimestamp()
  };
  
  // 기존 기록 확인
  const chatHistoryRef = collection(db, 'chatHistory');
  const q = query(
    chatHistoryRef,
    where('userId', '==', currentUser.uid),
    where('date', '==', date),
    where('type', '==', 'nutritionChat')
  );
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    // 기존 기록 업데이트
    const existingDoc = querySnapshot.docs[0];
    await updateDoc(doc(db, 'chatHistory', existingDoc.id), chatData);
    console.log('영양 브리핑 챗봇 대화 업데이트 완료:', existingDoc.id);
    return existingDoc.id;
  } else {
    // 새 기록 생성
    chatData.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, 'chatHistory'), chatData);
    console.log('영양 브리핑 챗봇 대화 저장 완료:', docRef.id);
    return docRef.id;
  }
}

// 페이지를 떠날 때 대화 저장하지 않음 (대화 기록 기능 제거)

// 사용자 인증 상태 확인
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log('✅ 사용자 로그인:', user.email);
      // BMR 정보 불러오기
      await loadUserBMR();
      
      // 음식 기록 탭 열기 플래그 확인
      const openFoodRecordTab = localStorage.getItem('openFoodRecordTab');
      if (openFoodRecordTab === 'true' && window.location.pathname.includes('student.html')) {
        // 음식 기록 탭 열기
        localStorage.removeItem('openFoodRecordTab'); // 플래그 제거
        chatbotSection.classList.add('hidden');
        recordSection.classList.remove('hidden');
        // 음식 기록 섹션 초기화 (메뉴 로드 포함)
        await initializeRecordSection();
        return;
      }
      
      // 일반적으로는 챗봇 시작
      if (window.location.pathname.includes('student.html')) {
startChatbot();
      }
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
  
  // Firebase가 없어도 페이지 로드 시 챗봇 시작 시도
  if (window.location.pathname.includes('student.html')) {
    startChatbot();
  }
}

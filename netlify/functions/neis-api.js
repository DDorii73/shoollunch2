// Netlify Function for NEIS API (급식 정보)
exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // GET 요청만 허용
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { date } = event.queryStringParameters || {};
    const apiKey = process.env.NEIS_API_KEY;
    const atptOfcdcScCode = process.env.NEIS_ATPT_OFCDC_SC_CODE;
    const sdSchulCode = process.env.NEIS_SD_SCHUL_CODE;

    if (!apiKey || !atptOfcdcScCode || !sdSchulCode) {
      console.error('NEIS API 환경 변수 누락:', {
        hasApiKey: !!apiKey,
        hasAtptOfcdcScCode: !!atptOfcdcScCode,
        hasSdSchulCode: !!sdSchulCode
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'NEIS API configuration missing',
          details: '환경 변수가 설정되지 않았습니다. Netlify 대시보드에서 NEIS_API_KEY, NEIS_ATPT_OFCDC_SC_CODE, NEIS_SD_SCHUL_CODE를 설정해주세요.'
        }),
      };
    }

    // 날짜가 없으면 오늘 날짜 사용
    const targetDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    const apiUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${apiKey}&Type=json&ATPT_OFCDC_SC_CODE=${atptOfcdcScCode}&SD_SCHUL_CODE=${sdSchulCode}&MLSV_YMD=${targetDate}`;
    
    const response = await fetch(apiUrl);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `HTTP error: ${response.status}` }),
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('NEIS API 호출 오류:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};


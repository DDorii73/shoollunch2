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

    console.log('🔍 NEIS API 환경 변수 확인:', {
      hasApiKey: !!apiKey,
      hasAtptOfcdcScCode: !!atptOfcdcScCode,
      hasSdSchulCode: !!sdSchulCode,
      apiKeyLength: apiKey ? apiKey.length : 0,
      atptOfcdcScCodeValue: atptOfcdcScCode || '없음',
      sdSchulCodeLength: sdSchulCode ? sdSchulCode.length : 0
    });

    if (!apiKey || !atptOfcdcScCode || !sdSchulCode) {
      const missingVars = [];
      if (!apiKey) missingVars.push('NEIS_API_KEY');
      if (!atptOfcdcScCode) missingVars.push('NEIS_ATPT_OFCDC_SC_CODE');
      if (!sdSchulCode) missingVars.push('NEIS_SD_SCHUL_CODE');
      
      console.error('❌ NEIS API 환경 변수 누락:', missingVars.join(', '));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'NEIS API configuration missing',
          details: `환경 변수가 설정되지 않았습니다: ${missingVars.join(', ')}. Netlify 대시보드에서 환경 변수를 설정해주세요.`,
          missingVariables: missingVars
        }),
      };
    }

    // 날짜가 없으면 오늘 날짜 사용
    const targetDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    const apiUrl = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${apiKey}&Type=json&ATPT_OFCDC_SC_CODE=${atptOfcdcScCode}&SD_SCHUL_CODE=${sdSchulCode}&MLSV_YMD=${targetDate}`;
    
    console.log('🌐 NEIS API 호출 URL:', apiUrl.replace(apiKey, 'KEY=***'));
    
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ NEIS API 호출 실패:', response.status, errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `NEIS API HTTP error: ${response.status}`,
          details: errorText || 'NEIS API 호출에 실패했습니다.'
        }),
      };
    }

    const data = await response.json();
    console.log('✅ NEIS API 호출 성공');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('❌ NEIS API 호출 오류:', error);
    console.error('에러 스택:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Unknown error',
        details: error.stack || '알 수 없는 오류가 발생했습니다.'
      }),
    };
  }
};


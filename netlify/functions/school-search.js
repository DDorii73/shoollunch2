// Netlify Function for NEIS API (학교 정보 검색)
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
    const { schoolName } = event.queryStringParameters || {};
    const apiKey = process.env.NEIS_API_KEY;

    if (!apiKey) {
      console.error('❌ NEIS API KEY 누락');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'NEIS API KEY configuration missing',
          details: 'NEIS_API_KEY 환경 변수가 설정되지 않았습니다. Netlify 대시보드에서 환경 변수를 설정해주세요.'
        }),
      };
    }

    if (!schoolName || schoolName.trim() === '') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'School name is required',
          details: '학교 이름을 입력해주세요.'
        }),
      };
    }

    // NEIS API 학교 정보 검색
    const apiUrl = `https://open.neis.go.kr/hub/schoolInfo?KEY=${apiKey}&Type=json&SCHUL_NM=${encodeURIComponent(schoolName.trim())}`;
    
    console.log('🌐 NEIS 학교 정보 검색 API 호출:', apiUrl.replace(apiKey, 'KEY=***'));
    
    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ NEIS API 호출 실패:', response.status, errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `NEIS API HTTP error: ${response.status}`,
          details: errorText || '학교 정보 검색에 실패했습니다.'
        }),
      };
    }

    const data = await response.json();
    console.log('✅ NEIS 학교 정보 검색 성공');
    
    // 검색 결과 파싱
    if (data.RESULT && data.RESULT.CODE !== 'INFO-000') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          error: data.RESULT.MESSAGE || '검색 결과가 없습니다.',
          code: data.RESULT.CODE,
          schools: []
        }),
      };
    }

    // 학교 정보 추출
    const schools = [];
    if (data.schoolInfo && Array.isArray(data.schoolInfo) && data.schoolInfo.length > 0) {
      const schoolList = data.schoolInfo[1]?.row || [];
      schools.push(...schoolList.map(school => ({
        schoolName: school.SCHUL_NM,
        educationOfficeCode: school.ATPT_OFCDC_SC_CODE,
        schoolCode: school.SD_SCHUL_CODE,
        schoolType: school.SCHUL_KND_SC_NM,
        address: school.ORG_RDNMA
      })));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        schools: schools,
        count: schools.length
      }),
    };
  } catch (error) {
    console.error('❌ 학교 정보 검색 오류:', error);
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



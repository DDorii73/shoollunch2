// Netlify Function for OpenAI Chat API
exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // POST 요청만 허용
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { messages, model = 'gpt-3.5-turbo', max_tokens, temperature } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    console.log('🔍 OpenAI API 환경 변수 확인:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 7) : '없음'
    });

    if (!apiKey) {
      console.error('❌ OpenAI API 키가 설정되지 않았습니다.');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'OpenAI API key not configured',
          details: 'OPENAI_API_KEY 환경 변수가 설정되지 않았습니다. Netlify 대시보드에서 설정해주세요.'
        }),
      };
    }

    const requestBody = {
      model,
      messages,
    };

    // 선택적 파라미터 추가
    if (max_tokens !== undefined) {
      requestBody.max_tokens = max_tokens;
    }
    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }

    console.log('🌐 OpenAI API 호출 시작');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ OpenAI API 호출 실패:', response.status, errorData);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: errorData.error?.message || 'OpenAI API error',
          details: errorData.error || 'OpenAI API 호출에 실패했습니다.'
        }),
      };
    }

    const data = await response.json();
    console.log('✅ OpenAI API 호출 성공');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('❌ OpenAI API 호출 오류:', error);
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


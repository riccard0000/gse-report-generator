#!/usr/bin/env node
/**
 * Local test harness for GSE Report Generator Azure Function
 * Simula il contesto Azure Function per testing locale
 */

const handler = require('./proxy/index.js');

// Simula il contesto Azure Function
async function testFunction() {
  console.log('🧪 Test Azure Function in locale\n');
  
  // Context mockato
  const context = {
    log: console.log,
    res: null,
    done: () => {}
  };
  
  // Helper per creare request con Origin header
  const createRequest = (method, path, body = null) => ({
    method,
    url: `http://localhost:7071/api/proxy${path}`,
    headers: {
      'Origin': 'http://localhost:5173',  // 🔑 CORS origin
      'Content-Type': 'application/json'
    },
    query: {},
    body,
  });
  
  // Test 1: GET / (root path)
  console.log('📝 Test 1: GET /');
  let req = createRequest('GET', '');
  
  try {
    await handler(context, req);
    console.log('Response:', context.res?.status, context.res?.body?.substring?.(0, 100) || context.res?.body);
    console.log('✅ Test 1 passed\n');
  } catch (e) {
    console.error('❌ Test 1 failed:', e.message, '\n');
  }
  
  // Test 2: OPTIONS (CORS preflight)
  console.log('📝 Test 2: OPTIONS (CORS preflight)');
  context.res = null;
  req = createRequest('OPTIONS', '');
  
  try {
    await handler(context, req);
    console.log('Response status:', context.res?.status);
    console.log('CORS Headers present:', !!context.res?.headers);
    console.log('✅ Test 2 passed\n');
  } catch (e) {
    console.error('❌ Test 2 failed:', e.message, '\n');
  }
  
  // Test 3: GET /config (requires AZURE_STORAGE_CONNECTION_STRING)
  console.log('📝 Test 3: GET /config');
  context.res = null;
  req = createRequest('GET', '/config');
  
  try {
    await handler(context, req);
    console.log('Response status:', context.res?.status);
    console.log('Response body:', context.res?.body?.substring?.(0, 200) || context.res?.body);
    console.log('');
  } catch (e) {
    console.error('❌ Test 3 error:', e.message, '\n');
  }
  
  // Test 4: POST / (requires OPENROUTER_API_KEY and valid JSON body)
  console.log('📝 Test 4: POST / (chat proxy)');
  context.res = null;
  const chatBody = JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'test' }]
  });
  req = createRequest('POST', '/', chatBody);
  req.getRawBody = async () => chatBody;
  
  try {
    await handler(context, req);
    console.log('Response status:', context.res?.status);
    if (context.res?.status === 500 && context.res?.body?.includes?.('Chiave API')) {
      console.log('✅ Test 4: Correctly reports missing API key\n');
    } else if (context.res?.status >= 200 && context.res?.status < 300) {
      console.log('✅ Test 4: Request forwarded to OpenRouter\n');
    } else {
      console.log('Response:', context.res?.body?.substring?.(0, 200));
      console.log('');
    }
  } catch (e) {
    console.error('❌ Test 4 error:', e.message, '\n');
  }
  
  console.log('✅ Local test harness completed');
}

testFunction().catch(console.error);

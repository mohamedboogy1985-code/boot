#!/usr/bin/env node
/**
 * Critical-path production smoke tests.
 *
 * Starts the built production server on an isolated port and verifies:
 * UI delivery, security boundaries, adapter readiness metadata, invoice
 * extraction validation/fallback, and Egyptian transcript analysis fallback.
 * No Gemini key is used: simulated outputs must stay explicitly simulated.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = String(process.env.SMOKE_PORT || '3199');
const baseUrl = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let server;
let serverOutput = '';
let serverExited = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

async function fetchJson(pathname, options = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} did not return JSON (HTTP ${response.status}): ${text.slice(0, 240)}`);
  }
  return { response, data };
}

function ensureProductionBuild() {
  if (existsSync(path.join(root, 'dist', 'index.html'))) return;
  console.log('dist/index.html not found — running npm run build first…');
  const build = spawnSync(npmCommand, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (build.status !== 0) throw new Error(`Production build failed with exit code ${build.status}`);
}

function startServer() {
  server = spawn(npmCommand, ['start'], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: port,
      GEMINI_API_KEY: '',
      ENABLE_DESKTOP_ADAPTERS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-12000);
  };
  server.stdout?.on('data', collect);
  server.stderr?.on('data', collect);
  server.on('exit', (code, signal) => {
    serverExited = true;
    if (code !== null && code !== 0) {
      serverOutput += `\n[smoke] Server exited early with code ${code}${signal ? ` / signal ${signal}` : ''}`;
    }
  });
}

async function waitForServer() {
  const deadline = Date.now() + 45000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverExited) break;
    try {
      const { response, data } = await fetchJson('/api/status');
      if (response.ok && data.status === 'ok') return data;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Production server did not become ready on ${baseUrl}: ${lastError?.message || 'unknown error'}`);
}

async function stopServer() {
  if (!server || serverExited) return;
  try {
    if (process.platform !== 'win32' && server.pid) process.kill(-server.pid, 'SIGTERM');
    else server.kill('SIGTERM');
  } catch {
    try {
      server.kill('SIGKILL');
    } catch {
      /* already stopped */
    }
  }
  await sleep(600);
}

async function postJson(pathname, body) {
  return fetchJson(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function run() {
  ensureProductionBuild();
  startServer();

  const status = await waitForServer();
  assert(status.status === 'ok', 'Production /api/status responds OK');
  assert(status.hasGeminiKey === false, 'Smoke run is isolated from any live Gemini key');
  assert(status.features?.shellExecution === false, 'Shell execution remains disabled by design');
  assert(status.features?.adapterApprovalRequired === true, 'Every adapter action still requires user approval');

  const rootResponse = await fetchWithTimeout(`${baseUrl}/`);
  const rootHtml = await rootResponse.text();
  assert(rootResponse.ok, 'Production UI is served');
  assert(rootHtml.includes('<div id="root"></div>'), 'Production HTML contains the React root');
  assert(rootHtml.includes('/assets/'), 'Production HTML references built assets');

  const shellProbe = await fetchWithTimeout(`${baseUrl}/api/system/execute-command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'whoami' }),
  });
  assert(shellProbe.status === 404, 'No shell-command execution endpoint exists');

  const { response: adaptersResponse, data: adapters } = await fetchJson('/api/adapters/state');
  assert(adaptersResponse.ok, 'Adapters state endpoint responds');
  assert(adapters.shellExecutionEnabled === false, 'Adapters report shell execution disabled');
  assert(typeof adapters.nutJsInstalled === 'boolean', 'Adapters report local nut.js installation state');
  assert(typeof adapters.requestIsLoopback === 'boolean', 'Adapters report whether the request is loopback');
  assert(typeof adapters.serverPlatform === 'string' && adapters.serverPlatform.length > 0, 'Adapters report server platform');
  assert(adapters.adapters?.some((adapter) => adapter.id === 'mouse' && adapter.mode === 'dry-run'), 'Mouse adapter defaults to dry-run');

  const unapproved = await postJson('/api/adapters/execute', {
    action: { adapter: 'mouse', action: 'move', params: { x: 1, y: 1 } },
    approvedByUser: false,
  });
  assert(unapproved.response.status === 403, 'Unapproved desktop action is blocked with HTTP 403');

  const invalidInvoice = await postJson('/api/extract-invoice', {
    fileBase64: Buffer.from('not an invoice document').toString('base64'),
    mimeType: 'text/plain',
    fileName: 'invoice.txt',
    currency: 'EGP',
  });
  assert(invalidInvoice.response.status === 415, 'Invoice extraction rejects unsupported MIME types');

  const tinyPdf = Buffer.from('%PDF-1.4 smoke-test invoice document 1234567890', 'utf8').toString('base64');
  const extracted = await postJson('/api/extract-invoice', {
    fileBase64: tinyPdf,
    mimeType: 'application/pdf',
    fileName: 'INV-2026-501-client-12500.pdf',
    currency: 'EGP',
  });
  assert(extracted.response.ok, 'Invoice extraction accepts a PDF payload');
  assert(extracted.data.simulated === true, 'No-key invoice extraction is explicitly marked simulated');
  assert(Boolean(extracted.data.invoice?.invoiceNumber), 'Simulated invoice draft includes an invoice number');
  assert(Number(extracted.data.invoice?.amount) > 0, 'Simulated invoice draft includes a positive editable amount');
  assert(String(extracted.data.notes || '').includes('محاكاة'), 'Simulated invoice notes warn the user in Arabic');

  const analysisResult = await postJson('/api/analyze-transcript', {
    currency: 'EGP',
    userProfile: { name: 'مستخدم اختبار الدخان' },
    session: {
      id: 'smoke-session',
      title: 'جلسة اختبار الدخان',
      botName: 'وكيل الاختبار',
      createdAt: Date.now(),
      messages: [
        {
          sender: 'user',
          text: 'دفعنا 12000 جنيه لتراخيص برمجيات الحسابات واستلمنا 50000 جنيه من عميل مقابل خدمات استشارية.',
        },
        { sender: 'bot', text: 'سأستخرج المصروفات والإيرادات وأراجع ضريبة القيمة المضافة.' },
      ],
    },
  });
  assert(analysisResult.response.ok, 'Transcript financial analysis endpoint responds');
  assert(analysisResult.data.analysis?.isSimulated === true, 'No-key transcript analysis is explicitly marked simulated');
  assert(Array.isArray(analysisResult.data.analysis?.transactions) && analysisResult.data.analysis.transactions.length > 0, 'Transcript analysis returns itemized transactions');
  assert(JSON.stringify(analysisResult.data.analysis).includes('67'), 'Egyptian analysis references VAT Law 67/2016');

  console.log('\nAll critical-path smoke tests passed.');
}

try {
  await run();
} catch (error) {
  console.error(`\nSmoke test failed: ${error?.message || error}`);
  if (serverOutput.trim()) {
    console.error('\n--- production server output (tail) ---');
    console.error(serverOutput.slice(-5000));
  }
  process.exitCode = 1;
} finally {
  await stopServer();
}

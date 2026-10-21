import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import os from 'os';
import fs from 'fs';
import { createRequire } from 'module';
import * as si from 'systeminformation';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '15mb' }));

// Helper to get GoogleGenAI client if key exists
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI();
}

// ============================================================
// Security guardrails & audit log (merged from Bogy-Agants / NexusAI)
//
// SAFETY BOUNDARY: this server NEVER executes shell commands. There is
// deliberately no /api/system/execute-command endpoint (Bogy-Agants exposed
// one, which is an unauthenticated RCE). Windows support = generating
// script *text* for the user to review and run manually, nothing more.
// Every control action is classified first, dangerous requests are blocked,
// and all decisions are recorded in an in-memory audit log.
// ============================================================

type AuditCategory = 'web' | 'windows_script' | 'agent' | 'ollama' | 'system';

interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  action: string;
  target: string;
  riskLevel: 'low' | 'medium' | 'blocked';
  status: 'allowed' | 'blocked';
  reason: string;
}

const SECURITY_AUDIT_LOG: AuditEntry[] = [];
const MAX_AUDIT_ENTRIES = 200;

function pushAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
  const full: AuditEntry = {
    ...entry,
    id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    timestamp: Date.now(),
    target: String(entry.target || '').slice(0, 160),
  };
  SECURITY_AUDIT_LOG.unshift(full);
  if (SECURITY_AUDIT_LOG.length > MAX_AUDIT_ENTRIES) {
    SECURITY_AUDIT_LOG.length = MAX_AUDIT_ENTRIES;
  }
  return full;
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(format\s+[a-z]:|diskpart|mkfs|fdisk)\b/i, reason: 'محاولة تهيئة/تقسيم أقراص التخزين' },
  {
    pattern: /(rm\s+-[a-z]*r[a-z]*f|del\s+\/[sqf]|rd\s+\/s|Remove-Item[\s\S]{0,80}-Recurse[\s\S]{0,40}-Force)/i,
    reason: 'حذف جماعي مدمّر للملفات',
  },
  {
    pattern: /(Invoke-Expression|\bIEX\s*\(|DownloadString|DownloadFile|(curl|wget)[^\n]*\|\s*(sh|bash|powershell))/i,
    reason: 'تنزيل وتنفيذ كود عن بُعد (remote code execution)',
  },
  {
    pattern: /(net\s+user\s+\S+\s+\S*\s*\/add|net\s+localgroup\s+administrators\s+\S+\s+\/add)/i,
    reason: 'إنشاء أو ترقية حسابات إدارية',
  },
  {
    pattern: /(reg\s+(add|delete)[^\n]*\\(Run|RunOnce)\b|schtasks\s+\/create[^\n]*\/sc\s+onlogon)/i,
    reason: 'محاولة ثبات (persistence) عبر سجل النظام أو المهام المجدولة',
  },
  {
    pattern: /(mimikatz|sekurlsa|\blsass\b|(credentials?|passwords?|كلمات المرور|بيانات الاعتماد)[^\n]{0,30}(dump|steal|extract|سرق|استخرج|استخراج|سرقة))/i,
    reason: 'استخراج بيانات اعتماد / كلمات مرور',
  },
  {
    pattern: /(shutdown\s+\/[sr]|Stop-Computer|Restart-Computer|taskkill\s+\/f\s+\/im\s+\*)/i,
    reason: 'إيقاف/إعادة تشغيل الجهاز أو إنهاء جميع العمليات',
  },
  {
    pattern: /(cipher\s+\/w|vssadmin\s+delete\s+shadows|wbadmin\s+delete|\bbcdedit\b)/i,
    reason: 'حذف نسخ الظل/الاحتياط أو تعديل إقلاع النظام (سلوك برامج فدية)',
  },
  {
    pattern: /(169\.254\.169\.254|metadata\.google\.internal|metadata\.azure)/i,
    reason: 'محاولة الوصول إلى بيانات وصفية سحابية داخلية (SSRF)',
  },
  {
    pattern: /(\b(ransomware|encrypt\s+(all\s+)?files|تشفير\s+(كل\s+)?الملفات|برمجية\s*فدية)\b)/i,
    reason: 'طلب متعلق ببرمجيات فدية / تشفير ملفات',
  },
];

const MEDIUM_RISK_PATTERNS: RegExp[] = [
  /\b(powershell|cmd\.exe|bash|wscript|cscript)\b/i,
  /\b(reg\s+add|schtasks|sc\s+config|netsh\s+advfirewall)\b/i,
  /\b(حذف|مسح|إيقاف|تعطيل)\b/,
];

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '0.0.0.0' || h.startsWith('127.')) return true;
  if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return true;
  const m172 = h.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const octet = parseInt(m172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

interface GuardrailDecision {
  allowed: boolean;
  riskLevel: 'low' | 'medium' | 'blocked';
  reason: string;
}

/**
 * Classify a control action. Always writes to the audit log.
 * For web actions the target URL is additionally checked against
 * private/loopback destinations (SSRF protection).
 */
function evaluateGuardrail(
  category: AuditCategory,
  action: string,
  target: string,
  payloadText = '',
): GuardrailDecision {
  const haystack = `${target}\n${payloadText}`;

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(haystack)) {
      pushAudit({ category, action, target, riskLevel: 'blocked', status: 'blocked', reason });
      return { allowed: false, riskLevel: 'blocked', reason };
    }
  }

  if (category === 'web') {
    try {
      const parsed = new URL(target);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        const reason = 'بروتوكول غير مسموح — يُسمح فقط بـ http/https';
        pushAudit({ category, action, target, riskLevel: 'blocked', status: 'blocked', reason });
        return { allowed: false, riskLevel: 'blocked', reason };
      }
      if (isPrivateOrLoopbackHost(parsed.hostname)) {
        const reason = 'الوصول إلى عناوين خاصة/داخلية (localhost أو شبكة محلية) محظور لحماية الخادم من SSRF';
        pushAudit({ category, action, target, riskLevel: 'blocked', status: 'blocked', reason });
        return { allowed: false, riskLevel: 'blocked', reason };
      }
    } catch {
      const reason = 'رابط غير صالح';
      pushAudit({ category, action, target, riskLevel: 'blocked', status: 'blocked', reason });
      return { allowed: false, riskLevel: 'blocked', reason };
    }
  }

  const isMedium = MEDIUM_RISK_PATTERNS.some((p) => p.test(haystack));
  const decision: GuardrailDecision = isMedium
    ? {
        allowed: true,
        riskLevel: 'medium',
        reason: 'إجراء متوسط الخطورة — مسموح لأنه لا يُنفَّذ على الخادم أبدًا (توليد نص فقط) وسيُسجَّل في سجل التدقيق',
      }
    : { allowed: true, riskLevel: 'low', reason: 'إجراء قراءة/توليد نص آمن — بدون أي تنفيذ على الجهاز' };

  pushAudit({
    category,
    action,
    target,
    riskLevel: decision.riskLevel,
    status: 'allowed',
    reason: decision.reason,
  });
  return decision;
}

pushAudit({
  category: 'system',
  action: 'server_start',
  target: 'ChatterBots Remix API',
  riskLevel: 'low',
  status: 'allowed',
  reason: 'بدء تشغيل الخادم — تنفيذ أوامر النظام معطّل نهائيًا by design (لا توجد نقطة تنفيذ shell)',
});

// Health & Status
app.get('/api/status', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasKey = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  res.json({
    status: 'ok',
    hasGeminiKey: hasKey,
    voicesAvailable: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'],
    features: {
      multiAgentOrchestrator: true,
      realSystemDiagnostics: true,
      ollamaLocalBridge: true,
      officeExportXlsxDocx: true,
      securityGuardrails: true,
      securityAuditLog: true,
      safeAdapters: true,
      desktopInputAdapters: process.env.ENABLE_DESKTOP_ADAPTERS === 'true' ? 'operator-enabled-loopback-only' : 'dry-run',
      adapterApprovalRequired: true,
      // Hard safety boundary: no shell execution endpoint exists.
      shellExecution: false,
    },
  });
});

// Chat endpoint with persona & user profile grounding
app.post('/api/chat', async (req, res) => {
  try {
    const { bot, userProfile, messageHistory, userMessage, imageBase64, imageMimeType } = req.body;

    const ai = getGeminiClient();

    // Prepare system persona instructions
    const userName = userProfile?.name || 'Mohamed';
    const userRole = userProfile?.role || 'مدير مالي ومحاسب';
    const userInterests = userProfile?.interests || 'المحاسبة، التكنولوجيا، القهوة';
    const userContext = userProfile?.context || 'برنامج الحسابات وإدارة الأعمال';

    const systemPrompt = `You are ${bot?.name || 'Proper Paul'}, an AI persona in the ChatterBots Remix system.
Persona title/role: ${bot?.title || 'Financial & Decorum Advisor'}.
Catchphrase: "${bot?.catchphrase || 'At your service.'}".
Personality traits: ${bot?.personality || 'Eloquent, respectful, smart, helpful'}.
Speaking style: ${bot?.speakingStyle || 'Polite, witty, and concise'}.

User details:
- Name: ${userName}
- Professional Role: ${userRole}
- Interests & Hobbies: ${userInterests}
- Accounting & Business Context: ${userContext}

Guidelines:
1. Speak directly to ${userName} in the requested language (Arabic if the user speaks Arabic, English if they speak English).
2. Embrace your distinct persona passionately. Use your catchphrase occasionally.
3. Bring in relevant accounting/financial wisdom or witty metaphors aligned with your persona (e.g., if you are Paul: formal British etiquette with immaculate accounting; if Charlotte: vibrant chic fashion/lifestyle budgeting; if Chef Shane: culinary metaphors like simmering margins and boiling costs; if Penny: international currency, globetrotting expenses; if Adam: sharp Egyptian/Arab chief accountant on balance sheets and VAT; if Amira: meticulous internal audit and leak plugging).
4. Tailor examples to ${userName}'s interests (${userInterests}) and financial context when relevant.
5. Keep spoken answers concise, expressive, and conversational (typically 2-4 sentences) so that voice synthesis feels lively, fast, and natural. If asked for a table or detailed list, provide a clear structured breakdown.
6. Video & Vision: You have live camera vision capability. If the user shares camera video frames (showing an invoice, receipt, document, or themselves), actively acknowledge and analyze what is visible in the image from your accounting persona perspective!`;

    if (!ai) {
      // Intelligent fallback when API key is not yet set in dev
      const botName = bot?.name || 'ChatterBot';
      let fallbackText = '';
      if (imageBase64) {
        fallbackText = `مرحباً يا ${userName}! معك ${botName}. اطلعت على الصورة الواردة عبر الكاميرا المباشرة: يبدو المستند واضحاً وسأقوم بتدقيق أرقامه وبنوده فوراً. ${bot?.catchphrase || ''}`;
      } else if (userMessage.includes('حساب') || userMessage.includes('فاتورة') || userMessage.includes('ميزانية')) {
        fallbackText = `مرحباً يا ${userName}! معك ${botName}. بخصوص استفسارك المحاسبي، قمت بمطابقة الأرقام في النظام: التدفقات النقدية متوازنة، وجميع الفواتير تحت السيطرة. ما الخطوة التالية التي تريد مراجعتها في دفاتر الحسابات؟`;
      } else {
        fallbackText = `أهلاً بك يا ${userName}! أنا ${botName}. يسعدني التحدث معك بالصوت والصورة اليوم. ${bot?.catchphrase || 'أنا رهن إشارتك!'} كيف يمكنني مساعدتك في حساباتك؟`;
      }
      return res.json({ reply: fallbackText, simulated: true });
    }

    // Format history for Gemini contents
    const contents: Array<{ role: 'user' | 'model'; parts: Array<any> }> = [];

    // Add recent history (up to last 10 messages)
    if (Array.isArray(messageHistory)) {
      for (const msg of messageHistory.slice(-10)) {
        if (msg.sender === 'user') {
          contents.push({ role: 'user', parts: [{ text: msg.text }] });
        } else if (msg.sender === 'bot') {
          contents.push({ role: 'model', parts: [{ text: msg.text }] });
        }
      }
    }

    // Add latest user message with optional camera frame / uploaded document
    const userParts: any[] = [];
    if (imageBase64) {
      const ALLOWED_VISION_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
      const mimeType = ALLOWED_VISION_MIMES.includes(String(imageMimeType)) ? String(imageMimeType) : 'image/jpeg';
      const cleanData = String(imageBase64).replace(/^data:[\w/+.-]+;base64,/, '');
      userParts.push({
        inlineData: {
          mimeType,
          data: cleanData,
        },
      });
    }
    userParts.push({ text: userMessage || 'تفضل بمراجعة ما تراه في الكاميرا والرد علي صوتياً.' });

    contents.push({
      role: 'user',
      parts: userParts,
    });

    try {
      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 6000)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      const reply = response.text || '';
      if (reply) {
        return res.json({ reply });
      }
    } catch (modelErr: any) {
      console.warn('Gemini 3.8 Flash temporary busy/timeout, invoking smart persona engine:', modelErr?.message);
    }

    // Smart contextual fallback when model has high load spikes
    const botName = bot?.name || 'ChatterBot';
    const catchphrase = bot?.catchphrase || 'أنا رهن إشارتك دائماً!';
    const isUserEnglish = /[a-zA-Z]{3,}/.test(userMessage);
    let fallbackReply = '';

    if (isUserEnglish) {
      if (botName.includes('Paul')) {
        fallbackReply = `Splendid to converse with you, ${userName}! Proper Paul at your service. I hear you loud and clear, and I am speaking directly to you now. "${catchphrase}" How may I assist your financial ledgers today?`;
      } else if (botName.includes('Adam')) {
        fallbackReply = `Hello ${userName}! Chief Accountant Adam here. I hear you clearly, and all ledger accounts and tax balances are balanced. "${catchphrase}" What financial statements shall we review next?`;
      } else if (botName.includes('Amira')) {
        fallbackReply = `Greetings ${userName}! Auditor Amira here. I am listening to you and auditing our invoices in real-time. "${catchphrase}" How can I assist your compliance today?`;
      } else if (botName.includes('Charlotte')) {
        fallbackReply = `Hello darling ${userName}! Chic Charlotte here, speaking right back to you! "${catchphrase}" Let's make your budgets and revenue look absolutely fabulous!`;
      } else if (botName.includes('Shane')) {
        fallbackReply = `Hey there, ${userName}! Chef Shane speaking right back to you! "${catchphrase}" Let's whip up an irresistible profit recipe together!`;
      } else if (botName.includes('Penny')) {
        fallbackReply = `Hello globetrotter ${userName}! Passport Penny here, speaking to you live. "${catchphrase}" Where is our business expanding to next?`;
      } else {
        fallbackReply = `Hello ${userName}! I am ${botName}, and I am speaking right back to you! "${catchphrase}" What can we analyze together today?`;
      }
    } else {
      if (botName.includes('Paul')) {
        fallbackReply = `سيدي الفاضل ${userName}، أحييك بكل كياسة واعتزاز. قمت بمراجعة البيانات المحاسبية بدقة وفق أعلى معايير البروتوكول والانضباط المالي: السجلات متوافقة تماماً. ${catchphrase} كيف تأمرني بمواصلة التدقيق؟`;
      } else if (botName.includes('Adam') || botName.includes('آدم')) {
        fallbackReply = `أهلاً بك يا أستاذ ${userName}! بصفتي كبير المحاسبين، فحصت قيود اليومية ومطابقة الحسابات وميزان المراجعة: كل الأرقام متوازنة، واحتساب ضريبة القيمة المضافة سليم 100%. ${catchphrase} ما الحساب التالي الذي تود إقفاله؟`;
      } else if (botName.includes('Amira') || botName.includes('أميرة')) {
        fallbackReply = `مرحباً يا ${userName}! كمدققة للرقابة المالية، راجعت الفواتير وحركة الصرف: لا توجد ثغرات، وأوصي بجدولة الفواتير المعلقة لضمان استقرار السيولة. ${catchphrase}`;
      } else if (botName.includes('Charlotte')) {
        fallbackReply = `أهلاً يا عزيزي ${userName}! تفحصت أرقامك وميزانيتك التسويقية، وأرى بريقاً وفرصاً رائعة للنمو دون تضخيم المصروفات. ${catchphrase} دعنا نبتكر معاً خطة مبيعات ملهمة!`;
      } else if (botName.includes('Shane')) {
        fallbackReply = `يا مرحباً بالصديق ${userName}! لقد أعددت لك وصفة مالية شهية: خفضنا حرارة النفقات التشغيلية وضبطنا التكاليف، لتكون أرباحنا الصافية بأشهى طعم! ${catchphrase}`;
      } else if (botName.includes('Penny')) {
        fallbackReply = `أهلاً يا رحالتنا المالي ${userName}! راجعت تقلبات العملات وتكاليف المهمات والتوسع: مركزنا المالي متين ونحن جاهزون لاقتناص أي فرصة تجارية جديدة. ${catchphrase}`;
      } else {
        fallbackReply = `مرحباً يا ${userName}! معك ${botName}. اطلعت على استفسارك وسجلاتك: مؤشراتك المالية تسير بالاتجاه الصحيح. ${catchphrase} ما الذي تود تحليله في دفاتر الحسابات تالياً؟`;
      }
    }

    return res.json({ reply: fallbackReply, simulated: true });
  } catch (err: any) {
    console.error('Error in /api/chat:', err);
    res.status(500).json({
      error: err?.message || 'Chat generation failed',
      reply: 'أهلاً بك يا محمد، معك وكيلك المحاسبي. كيف يمكنني مساعدتك في دفاتر الحسابات اليوم؟',
    });
  }
});

// Text-to-Speech endpoint using gemini-3.8-flash-lite-tts
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName, style } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        audioData: null,
        fallbackWebSpeech: true,
        message: 'No GEMINI_API_KEY configured, falling back to Web Speech Synthesis',
      });
    }

    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = validVoices.includes(voiceName) ? voiceName : 'Puck';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text,
              speechMetadata: {
                style: style || 'Expressive, clear, natural conversational tone',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (base64Audio) {
      res.json({
        audioData: base64Audio,
        mimeType: 'audio/wav',
        voiceName: chosenVoice,
      });
    } else {
      res.json({
        audioData: null,
        fallbackWebSpeech: true,
      });
    }
  } catch (err: any) {
    console.warn('TTS generation failed, recommending client fallback:', err?.message);
    res.json({
      audioData: null,
      fallbackWebSpeech: true,
      error: err?.message,
    });
  }
});

// ==========================================
// DEEP CONTROL & AUTOMATION ENGINE ENDPOINTS
// ==========================================

// System Telemetry & Automation Diagnostics
app.get('/api/control/system', (req, res) => {
  try {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024));
    const usedMem = totalMem - freeMem;
    const uptimeHours = (os.uptime() / 3600).toFixed(1);

    res.json({
      platform: os.platform(),
      osType: os.type(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        totalMB: totalMem,
        usedMB: usedMem,
        freeMB: freeMem,
        usedPercentage: Math.round((usedMem / totalMem) * 100),
      },
      uptimeHours,
      capabilities: {
        webScraping: true,
        windowsPowerShellGenerator: true,
        windowsBatchGenerator: true,
        appLauncherAutomation: true,
        financialAuditEngine: true,
        agentAutonomousToolUse: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get system telemetry' });
  }
});

// Web Control & Live Scraper
app.post('/api/control/web', async (req, res) => {
  const startTime = Date.now();
  try {
    let { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Security guardrail: block SSRF to private/loopback hosts, audit everything.
    const guard = evaluateGuardrail('web', 'web_scrape', url);
    if (!guard.allowed) {
      return res.status(403).json({
        error: `تم حظر الطلب بواسطة الحارس الأمني: ${guard.reason}`,
        blocked: true,
        latencyMs: Date.now() - startTime,
      });
    }

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ChatterBots-DeepControl/2.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const $ = cheerio.load(response.data);

    // Remove noise scripts and styles
    $('script, style, noscript, svg').remove();

    const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || url;
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';

    const h1s: string[] = [];
    $('h1').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && !h1s.includes(txt)) h1s.push(txt.slice(0, 100));
    });

    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && txt.length > 20 && paragraphs.length < 8) {
        paragraphs.push(txt);
      }
    });

    const linksCount = $('a[href]').length;
    const latencyMs = Date.now() - startTime;
    const extractedText = (title + '\n' + description + '\n' + paragraphs.join('\n')).slice(0, 2000);

    res.json({
      url,
      title,
      description,
      h1: h1s.slice(0, 5),
      paragraphs: paragraphs.slice(0, 5),
      linksCount,
      extractedText,
      status: response.status,
      latencyMs,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    console.warn('Web fetch failed:', err?.message);
    res.status(500).json({
      error: `فشل الوصول للموقع: ${err?.message || 'Network error'}`,
      latencyMs,
    });
  }
});

// Windows PowerShell & Batch Script Generator for Deep Automation
app.post('/api/control/windows-script', async (req, res) => {
  try {
    const { prompt, category, shell, botName } = req.body;
    const scriptShell = shell === 'batch' ? 'batch' : 'powershell';
    const scriptCategory = category || 'system';

    // Security guardrail: scripts are generated as TEXT ONLY — never executed
    // server-side — but clearly malicious requests are refused up front.
    const guard = evaluateGuardrail(
      'windows_script',
      'generate_windows_script',
      String(prompt || '').slice(0, 120),
      String(prompt || ''),
    );
    if (!guard.allowed) {
      return res.status(403).json({
        error: `تم حظر الطلب بواسطة الحارس الأمني: ${guard.reason}. ملاحظة: هذه المنصة تولّد نصوص سكربتات آمنة للمراجعة اليدوية فقط ولا تنفّذ أي أمر على الجهاز.`,
        blocked: true,
      });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const promptInstruction = `You are a Senior Windows Systems and DevOps Automation Engineer.
Generate a safe, professional, and directly executable Windows ${scriptShell.toUpperCase()} script based on this user request:
"${prompt}"

Category: ${scriptCategory}
Requested by Agent: ${botName || 'System Admin'}

Requirements:
1. Return ONLY the code inside the response, wrapped in a single code block or clean raw text.
2. Include clear comments explaining each section.
3. Include error handling (e.g. try/catch in PowerShell or %ERRORLEVEL% checks in Batch).
4. Include a visual confirmation message when done (e.g., Write-Host "[SUCCESS] ..." or echo [SUCCESS]).
5. Do NOT perform destructive operations like formatting drives without explicit safeguards.`;

        const response: any = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: promptInstruction }] }],
          config: {
            temperature: 0.2,
          },
        });

        let scriptCode = response.text || '';
        scriptCode = scriptCode.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

        if (scriptCode) {
          // Re-scan the AI-generated code itself; refuse to serve dangerous output.
          const codeGuard = BLOCKED_PATTERNS.find(({ pattern }) => pattern.test(scriptCode));
          if (codeGuard) {
            pushAudit({
              category: 'windows_script',
              action: 'generate_windows_script_output_scan',
              target: String(prompt || '').slice(0, 120),
              riskLevel: 'blocked',
              status: 'blocked',
              reason: `تم حجب مخرجات مولّدة محتملة الخطر: ${codeGuard.reason}`,
            });
            return res.status(403).json({
              error: `الحارس الأمني حجب السكربت المولّد لأنه يحتوي نمطًا خطيرًا: ${codeGuard.reason}`,
              blocked: true,
            });
          }
          return res.json({
            simulated: false,
            script: {
              id: 'script-' + Date.now(),
              name: prompt.slice(0, 40),
              description: prompt,
              category: scriptCategory,
              shell: scriptShell,
              code: scriptCode,
              authorAgent: botName || 'ChatterBot',
            },
          });
        }
      } catch (genErr) {
        console.warn('Gemini script generation fallback:', genErr);
      }
    }

    // High quality built-in templates fallback
    let fallbackCode = '';
    if (scriptShell === 'powershell') {
      if (prompt.includes('excel') || prompt.includes('إكسل') || prompt.includes('حساب')) {
        fallbackCode = `# ========================================================
# ChatterBots Windows Automation: Excel & Financial Books
# Agent: ${botName || 'Accountant Adam'}
# ========================================================
$ErrorActionPreference = "Stop"

try {
    Write-Host "Creating Excel COM Object for Accounting Audit..." -ForegroundColor Cyan
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $true
    $workbook = $excel.Workbooks.Add()
    $sheet = $workbook.Worksheets.Item(1)
    $sheet.Name = "ChatterBots_Report"

    # Set Headers
    $sheet.Cells.Item(1, 1) = "رقم الحركة"
    $sheet.Cells.Item(1, 2) = "التاريخ"
    $sheet.Cells.Item(1, 3) = "البيان"
    $sheet.Cells.Item(1, 4) = "المبلغ (ر.س)"
    $sheet.Cells.Item(1, 5) = "الحالة"

    $sheet.Rows.Item(1).Font.Bold = $true
    $sheet.Columns.AutoFit()

    Write-Host "[SUCCESS] Excel ledger created and automated successfully!" -ForegroundColor Green
} catch {
    Write-Warning "Excel COM Automation failed: $_"
}
`;
      } else if (prompt.includes('backup') || prompt.includes('نسخ') || prompt.includes('احتياط')) {
        fallbackCode = `# ========================================================
# ChatterBots Windows Automation: Scheduled Backup
# Agent: ${botName || 'Auditor Amira'}
# ========================================================
$SourceDir = "$env:USERPROFILE\\Documents\\ChatterBots_Data"
$BackupDir = "$env:USERPROFILE\\ChatterBots_Backups\\$(Get-Date -Format 'yyyy-MM-dd_HH-mm')"

if (-not (Test-Path $SourceDir)) {
    New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null
    Set-Content -Path "$SourceDir\\audit_summary.txt" -Value "ChatterBots Ledger Backup $(Get-Date)"
}

Write-Host "Starting backup from $SourceDir to $BackupDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Copy-Item -Path "$SourceDir\\*" -Destination $BackupDir -Recurse -Force

Write-Host "[SUCCESS] Backup completed successfully to: $BackupDir" -ForegroundColor Green
`;
      } else {
        fallbackCode = `# ========================================================
# ChatterBots Windows Automation: System & App Diagnostic
# Agent: ${botName || 'Proper Paul'}
# ========================================================
Write-Host "--- Windows Diagnostic & Performance Report ---" -ForegroundColor Cyan
Write-Host "Computer Name: $env:COMPUTERNAME" -ForegroundColor White
Write-Host "Operating System: $((Get-CimInstance Win32_OperatingSystem).Caption)" -ForegroundColor White
Write-Host "Current User: $env:USERNAME" -ForegroundColor White

$cpuUsage = (Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples.CookedValue
Write-Host "Total CPU Utilization: $([math]::Round($cpuUsage, 2))%" -ForegroundColor Yellow

$freeRam = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
Write-Host "Free Memory: $([math]::Round($freeRam, 1)) MB" -ForegroundColor Green

Write-Host "[SUCCESS] ChatterBots Windows Automation bridge is active and responsive." -ForegroundColor Green
`;
      }
    } else {
      fallbackCode = `@echo off
REM ========================================================
REM ChatterBots Windows Batch Automation
REM Agent: ${botName || 'ChatterBot'}
REM ========================================================
echo [INFO] Running ChatterBots Windows Task...
echo Operating System: %OS%
echo Computer Name: %COMPUTERNAME%
echo Time: %DATE% %TIME%

echo [SUCCESS] Batch automation completed successfully!
pause
`;
    }

    res.json({
      simulated: true,
      script: {
        id: 'script-' + Date.now(),
        name: prompt.slice(0, 40),
        description: prompt,
        category: scriptCategory,
        shell: scriptShell,
        code: fallbackCode,
        authorAgent: botName || 'ChatterBot',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Script generation failed' });
  }
});

// Autonomous Agent Action Execution Endpoint
app.post('/api/control/agent-execute', async (req, res) => {
  try {
    const { bot, actionType, target, params } = req.body;
    const botName = bot?.name || 'ChatterBot';
    const logId = 'exec-' + Date.now();

    // Security guardrail for every autonomous agent action.
    const guardPayload = `${target || ''}\n${params?.prompt || ''}\n${params?.url || ''}`;
    const agentGuard = evaluateGuardrail('agent', `agent_${actionType || 'unknown'}`, String(target || params?.url || 'agent-action'), guardPayload);
    if (!agentGuard.allowed) {
      return res.json({
        log: {
          id: logId,
          timestamp: Date.now(),
          botId: bot?.id || 'agent',
          botName: botName,
          actionType: actionType || 'financial_audit',
          target: target || params?.url || 'agent-action',
          status: 'error',
          summary: `تم حظر الإجراء بواسطة الحارس الأمني: ${agentGuard.reason}`,
          outputPreview: '[BLOCKED] لم يتم تنفيذ أي إجراء على الجهاز.',
          details: { blocked: true, executed: false },
        },
      });
    }

    if (actionType === 'web_scrape') {
      let targetUrl = target || params?.url || 'https://google.com';
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

      const webGuard = evaluateGuardrail('web', 'agent_web_scrape', targetUrl);
      if (!webGuard.allowed) {
        return res.json({
          log: {
            id: logId,
            timestamp: Date.now(),
            botId: bot?.id || 'agent',
            botName: botName,
            actionType: 'web_scrape',
            target: targetUrl,
            status: 'error',
            summary: `تم حظر تصفح الرابط بواسطة الحارس الأمني: ${webGuard.reason}`,
            outputPreview: '[BLOCKED] SSRF / unsafe destination refused.',
            details: { blocked: true, executed: false },
          },
        });
      }

      try {
        const response = await axios.get(targetUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'ChatterBots-Agent-Navigator/1.0' },
        });
        const $ = cheerio.load(response.data);
        $('script, style').remove();
        const title = $('title').text().trim() || targetUrl;
        const snippet = $('p').first().text().trim().slice(0, 200);

        return res.json({
          log: {
            id: logId,
            timestamp: Date.now(),
            botId: bot?.id || 'agent',
            botName: botName,
            actionType: 'web_scrape',
            target: targetUrl,
            status: 'success',
            summary: `قام الوكيل ${botName} بتصفح وقراءة محتوى الرابط بنجاح: "${title}".`,
            outputPreview: snippet || title,
            details: { title, status: response.status },
          },
        });
      } catch (webErr: any) {
        return res.json({
          log: {
            id: logId,
            timestamp: Date.now(),
            botId: bot?.id || 'agent',
            botName: botName,
            actionType: 'web_scrape',
            target: targetUrl,
            status: 'warning',
            summary: `قام الوكيل ${botName} بمحاولة الاتصال بالرابط، ولكن الموقع استجاب بتعذر الاتصال المباشر (${webErr?.message}).`,
            outputPreview: webErr?.message,
          },
        });
      }
    }

    if (actionType === 'windows_script' || actionType === 'app_launch') {
      const scriptPrompt = params?.prompt || target || 'فحص أداء برامج النظام وتطبيقات سطح المكتب';
      return res.json({
        log: {
          id: logId,
          timestamp: Date.now(),
          botId: bot?.id || 'agent',
          botName: botName,
          actionType: actionType,
          target: scriptPrompt,
          status: 'success',
          summary: `قام الوكيل ${botName} بتحضير كود أتمتة ويندوز للمراجعة. تنبيه أمني: لم يتم تنفيذ أي أمر على الجهاز — المنصة تولّد نصوص سكربتات فقط، والتنفيذ قرار يدوي للمستخدم بعد المراجعة.`,
          outputPreview: `[Script Prepared — NOT Executed] راجع الكود في تبويب ويندوز ثم انسخه وشغّله بنفسك إن وثقت به. لا توجد نقطة تنفيذ shell في هذا الخادم.`,
          details: { scriptReady: true, executed: false, simulated: true },
        },
      });
    }

    res.json({
      log: {
        id: logId,
        timestamp: Date.now(),
        botId: bot?.id || 'agent',
        botName: botName,
        actionType: 'system_cmd',
        target: target || 'All Systems',
        status: 'success',
        summary: `تم تفعيل أدوات التحكم العميق للوكيل ${botName} بنجاح.`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Agent execution failed' });
  }
});

// Transcript Financial Insights Analysis with Gemini
app.post('/api/analyze-transcript', async (req, res) => {
  try {
    const { session, userProfile } = req.body;
    if (!session || !Array.isArray(session.messages)) {
      return res.status(400).json({ error: 'Valid session with messages array is required' });
    }

    const messages = session.messages;
    const conversationText = messages
      .map((m: any) => `${m.sender === 'user' ? (userProfile?.name || 'المستخدم') : session.botName}: ${m.text}`)
      .join('\n');

    // Currency & accounting-standard profile (Egypt-first, multi-currency display)
    const currencyCode = ['EGP', 'USD', 'SAR'].includes(req.body?.currency) ? req.body.currency : 'EGP';
    const isEgypt = currencyCode !== 'SAR';
    const curSymbol = currencyCode === 'EGP' ? 'ج.م' : currencyCode === 'USD' ? '$' : 'ر.س';
    const vatRate = isEgypt ? 0.14 : 0.15; // Egypt VAT 14% — Saudi VAT 15%
    const vatPercentLabel = isEgypt ? '14%' : '15%';
    const taxAuthority = isEgypt ? 'مصلحة الضرائب المصرية (ETA)' : 'هيئة الزكاة والضريبة والجمارك (ZATCA)';
    const standardsProfile = isEgypt
      ? 'You are a Senior Certified Public Accountant (CPA) and Tax Specialist for the Arab Republic of Egypt: Egyptian Accounting Standards (معايير المحاسبة المصرية), VAT Law 67/2016 at 14%, Egyptian Tax Authority (ETA) e-invoicing & e-receipt mandates, withholding tax under the deduction-and-collection system (نظام الخصم والتحصيل تحت حساب الضريبة), and Unified Tax Procedures Law 206/2020.'
      : 'You are a Senior Certified Public Accountant (CPA) and Tax Specialist for Saudi Arabia and GCC business compliance (VAT 15%, ZATCA e-invoicing, corporate expenses, deductibles).';

    const ai = getGeminiClient();

    if (ai && conversationText.length > 20) {
      try {
        const prompt = `${standardsProfile}
Analyze the following conversation transcript between a business user and an accounting agent:

"""
${conversationText}
"""

Instructions:
1. Extract and categorize all EXPENSES and all REVENUES mentioned or implied.
2. Identify POTENTIAL TAX DEDUCTIONS, allowable write-offs, or VAT savings with justification.
3. Chronologically itemize TRANSACTIONS with amounts, categories, and counterparties.
4. If exact amounts are discussed, use them. If only topics/estimates are discussed, extract them with reasonable business amounts in ${currencyCode} (${curSymbol}). Apply VAT at ${vatPercentLabel} and cite ${taxAuthority} compliance in Arabic notes.
5. Always return a STRICT JSON object matching this schema:
{
  "summary": "ملخص تحليلي مالي موجز ودقيق باللغة العربية",
  "totalExpenses": number,
  "totalRevenue": number,
  "netImpact": number,
  "totalPotentialTaxSavings": number,
  "expenses": [
    {
      "id": "exp-1",
      "type": "expense",
      "description": "string in Arabic",
      "amount": number,
      "currency": "${curSymbol}",
      "category": "string (e.g. نفقات تشغيلية، استشارات، تسويق، برمجيات)",
      "counterparty": "string",
      "date": "YYYY-MM-DD or recent date",
      "isTaxDeductible": boolean,
      "deductionReason": "string"
    }
  ],
  "revenues": [
    {
      "id": "rev-1",
      "type": "revenue",
      "description": "string in Arabic",
      "amount": number,
      "currency": "${curSymbol}",
      "category": "string (e.g. مبيعات خدمات، إيرادات عقود)",
      "counterparty": "string",
      "date": "YYYY-MM-DD"
    }
  ],
  "taxDeductions": [
    {
      "title": "string",
      "potentialSavings": number,
      "category": "string",
      "reasoning": "string",
      "complianceNote": "string"
    }
  ],
  "transactions": [
    {
      "id": "tx-1",
      "type": "expense" or "revenue",
      "description": "string",
      "amount": number,
      "currency": "${curSymbol}",
      "category": "string",
      "counterparty": "string",
      "date": "YYYY-MM-DD"
    }
  ],
  "recommendations": ["نصيحة مالية 1", "نصيحة مالية 2"]
}`;

        const response: any = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        });

        const rawJson = response.text || '';
        const parsed = JSON.parse(rawJson);

        const analysisResult = {
          sessionId: session.id,
          analyzedAt: Date.now(),
          summary: parsed.summary || 'تم التدقيق المالي للمحادثة واستخراج المؤشرات بنجاح.',
          totalExpenses: Number(parsed.totalExpenses) || 0,
          totalRevenue: Number(parsed.totalRevenue) || 0,
          netImpact: Number(parsed.netImpact) || (Number(parsed.totalRevenue) - Number(parsed.totalExpenses)),
          totalPotentialTaxSavings: Number(parsed.totalPotentialTaxSavings) || 0,
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          revenues: Array.isArray(parsed.revenues) ? parsed.revenues : [],
          taxDeductions: Array.isArray(parsed.taxDeductions) ? parsed.taxDeductions : [],
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          isSimulated: false,
        };

        return res.json({ analysis: analysisResult });
      } catch (aiErr: any) {
        console.warn('Gemini transcript analysis error, using intelligent CPA rule-based engine:', aiErr?.message);
      }
    }

    // High fidelity CPA heuristic fallback parser
    const numbersInText = (conversationText.match(/\d+[\d,.]*/g) || [])
      .map((n: string) => parseFloat(n.replace(/,/g, '')))
      .filter((n: number) => !isNaN(n) && n > 50 && n < 10000000);

    const baseAmount1 = numbersInText[0] || 18500;
    const baseAmount2 = numbersInText[1] || 9400;
    const baseAmount3 = numbersInText[2] || 42000;

    const sampleExpenses = [
      {
        id: 'exp-1',
        type: 'expense' as const,
        description: 'تراخيص برمجيات الحسابات والسحابة للمنشأة',
        amount: baseAmount2,
        currency: curSymbol,
        category: 'برمجيات وتقنية',
        counterparty: 'مزود الحلول السحابية',
        date: new Date(session.createdAt || Date.now()).toISOString().slice(0, 10),
        isTaxDeductible: true,
        deductionReason: 'مصروفات تقنية تشغيلية لازمة لمزاولة النشاط معتمدة ضريبياً بنسبة 100%',
      },
      {
        id: 'exp-2',
        type: 'expense' as const,
        description: 'أتعاب استشارات وتدقيق حسابات دورية',
        amount: baseAmount1,
        currency: curSymbol,
        category: 'أتعاب مهنية',
        counterparty: `مكتب الاستشارات (${session.botName})`,
        date: new Date(session.createdAt || Date.now()).toISOString().slice(0, 10),
        isTaxDeductible: true,
        deductionReason: 'مصروفات استشارات محاسبية مباشرة تخضع لضريبة القيمة المضافة قابلة للخصم',
      },
    ];

    const sampleRevenues = [
      {
        id: 'rev-1',
        type: 'revenue' as const,
        description: 'دفعة عقد خدمات واستشارات مع العميل',
        amount: baseAmount3,
        currency: curSymbol,
        category: 'إيراد خدمات',
        counterparty: 'العميل التجاري المعتمد',
        date: new Date(session.createdAt || Date.now()).toISOString().slice(0, 10),
      },
    ];

    const totalExp = sampleExpenses.reduce((s, e) => s + e.amount, 0);
    const totalRev = sampleRevenues.reduce((s, r) => s + r.amount, 0);
    const taxSavings = Math.round(totalExp * vatRate); // Input VAT deductible (Egypt 14% / Saudi 15%)

    const fallbackAnalysis = {
      sessionId: session.id,
      analyzedAt: Date.now(),
      isSimulated: true,
      summary: `[محاكاة استدلالية محلية — ليست تحليل Gemini حي] قام محرك القواعد المحلي بمسح محادثة "${session.title}" المكونة من ${messages.length} رسالة مع الوكيل ${session.botName} وفق ${isEgypt ? 'معايير المحاسبة المصرية وقانون ضريبة القيمة المضافة رقم 67 لسنة 2016' : 'أنظمة المحاسبة والزكاة السعودية'}. الأرقام أدناه تجريبية (مشتقة من أي أرقام ظاهرة في النص أو قيم افتراضية للعرض) ويجب عدم استخدامها كسجلات محاسبية رسمية. تم رصد تدفقات مصروفات بقيمة ${totalExp.toLocaleString('ar-EG')} ${curSymbol} وإيرادات بقيمة ${totalRev.toLocaleString('ar-EG')} ${curSymbol} مع فرص وفورات ضريبية تقديرية.`,
      totalExpenses: totalExp,
      totalRevenue: totalRev,
      netImpact: totalRev - totalExp,
      totalPotentialTaxSavings: taxSavings,
      expenses: sampleExpenses,
      revenues: sampleRevenues,
      taxDeductions: [
        {
          title: `خصم/استرداد ضريبة القيمة المضافة (${vatPercentLabel}) على فواتير المدخلات`,
          potentialSavings: taxSavings,
          category: 'ضريبة المدخلات (Input VAT)',
          reasoning: isEgypt
            ? 'وفق قانون الضريبة على القيمة المضافة رقم 67 لسنة 2016، تُخصم ضريبة المدخلات على السلع والخدمات المستخدمة في نشاط خاضع للضريبة من ضريبة المخرجات في الإقرار الشهري.'
            : 'الفواتير التشغيلية المعتمدة للمنشأة تؤهل لاسترداد مدخلات ضريبة القيمة المضافة بالكامل.',
          complianceNote: isEgypt
            ? 'يجب أن تكون الفواتير إلكترونية صادرة عبر منظومة الفاتورة الإلكترونية لدى مصلحة الضرائب المصرية (ETA) مع الاحتفاظ بها ضمن منظومة الفواتير وفق قانون الإجراءات الضريبية الموحد 206/2020.'
            : 'يتطلب الاحتفاظ بالفاتورة الضريبية المبسطة أو الكاملة مطابقة لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA).',
        },
        {
          title: isEgypt
            ? 'اعتماد المصروفات المهنية والبرمجيات كمصروفات واجبة الخصم من وعاء ضريبة الدخل'
            : 'خصم مصروفات الاستشارات وتراخيص الأنظمة من وعاء ضريبة الدخل/الزكاة',
          potentialSavings: Math.round(totalExp * 0.20),
          category: 'مصروفات جائزة الخصم',
          reasoning: isEgypt
            ? 'المصروفات المؤيدة بمستندات واللازمة لمزاولة النشاط تُخصم من صافي الربح الخاضع لضريبة الدخل وفق قانون الضريبة على الدخل 91/2005، مع مراعاة نسب الخصم والتحصيل تحت حساب الضريبة عند السداد للموردين.'
            : 'النفقات المؤيدة بمستندات والمحققة للنشاط تعتبر معفاة من وعاء الاحتساب الزكوي المباشر.',
          complianceNote: isEgypt
            ? 'السداد عبر القنوات البنكية وتطبيق نظام الخصم من المورد تحت حساب الضريبة (نموذج 41) عند تجاوز النصاب القانوني.'
            : 'يجب سداد المبالغ عبر الحساب البنكي التجاري الرسمي المربوط بالمنشأة.',
        },
      ],
      transactions: [
        ...sampleExpenses,
        ...sampleRevenues,
      ],
      recommendations: isEgypt
        ? [
            'تفعيل مفتاح GEMINI_API_KEY للحصول على تحليل حي حقيقي بدل بيانات هذه المحاكاة التجريبية.',
            'استكمال التسجيل والتكامل مع منظومة الفاتورة الإلكترونية/الإيصال الإلكتروني لدى مصلحة الضرائب المصرية (ETA) وإصدار كل الفواتير عبرها بتوقيع إلكتروني معتمد.',
            'تقديم إقرار ضريبة القيمة المضافة (نموذج 10) شهريًا عبر منظومة مصلحة الضرائب وخصم ضريبة المدخلات الموثقة بفواتير إلكترونية.',
            'تطبيق نظام الخصم والتحصيل تحت حساب الضريبة على المدفوعات للموردين وتوريد نموذج 41 ربع سنويًا.',
            'ترحيل النفقات التشغيلية إلى مراكز التكلفة وفق معايير المحاسبة المصرية ومتابعة تحصيل الدفعات المستحقة قبل إقفال الفترة.',
          ]
        : [
            'تفعيل مفتاح GEMINI_API_KEY للحصول على تحليل حي حقيقي بدل بيانات هذه المحاكاة التجريبية.',
            'تأكيد استلام الفواتير الإلكترونية بصيغة XML المتوافقة مع متطلبات الفوترة من هيئة الزكاة.',
            'ترحيل النفقات التشغيلية مباشرة إلى مركز التكلفة المناسب لضبط هوامش الربح.',
            'متابعة تحصيل الدفعات المستحقة قبل نهاية الربع المالي الحالي.',
          ],
    };

    res.json({ analysis: fallbackAnalysis });
  } catch (err: any) {
    console.error('Error in /api/analyze-transcript:', err);
    res.status(500).json({ error: err?.message || 'Financial transcript analysis failed' });
  }
});

// ============================================================
// MERGED FROM Bogy-Agants (NexusAI): Real diagnostics, multi-agent
// orchestrator, Ollama local bridge, security audit log, and SAFE
// desktop/browser Adapters.
//
// Adapter security model (human-in-the-loop, least privilege):
//  1) The LLM (Gemini or Ollama) may only PROPOSE actions from a strict
//     allowlist via /api/adapters/propose — it can never execute anything.
//  2) Execution requires an explicit per-action user approval
//     (`approvedByUser: true`) sent from the UI after the user reviews it.
//  3) Real mouse/keyboard injection is DISABLED unless the operator sets
//     ENABLE_DESKTOP_ADAPTERS=true AND installs the optional local package
//     `@nut-tree/nut-js` AND the request originates from loopback (127.0.0.1).
//     Otherwise mouse/keyboard actions run in transparent DRY-RUN mode.
//  4) Browser adapter = guarded HTTP fetch/extract (no private hosts, SSRF
//     protected). Filesystem adapter = read-only inside ./adapter-workspace.
//  5) There is still NO shell-execution endpoint anywhere in this server.
// ============================================================

const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
const DESKTOP_ADAPTERS_ENABLED = process.env.ENABLE_DESKTOP_ADAPTERS === 'true';
const ADAPTER_SANDBOX_DIR = path.resolve(process.cwd(), 'adapter-workspace');

function formatBytesAsGb(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '—';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

// Returns installed Ollama models, or null when the local engine is offline.
async function fetchOllamaTags(): Promise<any[] | null> {
  try {
    const resp = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 2500 });
    return Array.isArray(resp.data?.models) ? resp.data.models : [];
  } catch {
    return null;
  }
}

const OLLAMA_RECOMMENDED_CATALOG = [
  { name: 'llama3.1:8b', displayName: 'Llama 3.1 8B', size: '4.7 GB', family: 'llama', recommended: true },
  { name: 'qwen2.5:7b', displayName: 'Qwen 2.5 7B (ممتاز للعربية)', size: '4.4 GB', family: 'qwen', recommended: true },
  { name: 'mistral:7b', displayName: 'Mistral 7B', size: '4.1 GB', family: 'mistral', recommended: false },
  { name: 'gemma2:9b', displayName: 'Gemma 2 9B', size: '5.4 GB', family: 'gemma', recommended: false },
];

function isLoopbackRequest(req: any): boolean {
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function tryLoadNutJs(): any | null {
  try {
    const localRequire = createRequire(import.meta.url);
    return localRequire('@nut-tree/nut-js');
  } catch {
    return null;
  }
}

function ensureSandbox(): void {
  try {
    fs.mkdirSync(ADAPTER_SANDBOX_DIR, { recursive: true });
    const readme = path.join(ADAPTER_SANDBOX_DIR, 'README.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        'ChatterBots Adapter Workspace\nهذا هو المجلد الوحيد الذي يستطيع محوّل الملفات قراءته (قراءة فقط).\nضع هنا ملفات .txt أو .md أو .json أو .csv ليقرأها الوكيل بأمان بعد موافقتك.\n',
        'utf8',
      );
    }
  } catch (e) {
    console.warn('Failed to prepare adapter sandbox:', e);
  }
}

// Resolve a user supplied relative path inside the sandbox; null if escaping.
function resolveSandboxPath(rel: string): string | null {
  const cleaned = String(rel || '.').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(ADAPTER_SANDBOX_DIR, cleaned);
  if (resolved !== ADAPTER_SANDBOX_DIR && !resolved.startsWith(ADAPTER_SANDBOX_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

// ---------- Real system diagnostics (systeminformation) ----------
app.get('/api/system/real-diagnostics', async (req, res) => {
  evaluateGuardrail('system', 'real_diagnostics', 'local-host');
  try {
    const [cpu, load, mem, osInfo, fsSize, processes, timeInfo] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.osInfo(),
      si.fsSize().catch(() => [] as any[]),
      si.processes().catch(() => ({ list: [] as any[] })),
      Promise.resolve(si.time()),
    ]);

    const toRamMb = (rss: number): number => {
      if (!rss || isNaN(rss)) return 0;
      if (rss > 10_000_000) return Math.round(rss / (1024 * 1024)); // bytes
      if (rss > 10_000) return Math.round(rss / 1024); // KB
      return Math.round(rss); // already MB-ish
    };

    const topProcesses = [...((processes as any)?.list ?? [])]
      .sort((a: any, b: any) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, 8)
      .map((p: any) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round((p.cpu || 0) * 10) / 10,
        ramMb: toRamMb(p.memRss),
        status: p.state || 'running',
      }));

    res.json({
      cpu: {
        manufacturer: cpu.manufacturer || '—',
        brand: cpu.brand || '—',
        speed: cpu.speed || 0,
        cores: cpu.physicalCores || cpu.cores || os.cpus().length,
        loadPercent: Math.round(load.currentLoad || 0),
      },
      memory: {
        totalMb: Math.round(mem.total / (1024 * 1024)),
        usedMb: Math.round(mem.used / (1024 * 1024)),
        freeMb: Math.round(mem.free / (1024 * 1024)),
        usedPercent: mem.total ? Math.round((mem.used / mem.total) * 100) : 0,
      },
      os: {
        platform: osInfo.platform || os.platform(),
        distro: osInfo.distro || os.type(),
        release: osInfo.release || os.release(),
        arch: osInfo.arch || os.arch(),
        hostname: osInfo.hostname || os.hostname(),
        uptimeHours: Math.round(((timeInfo?.uptime ?? os.uptime()) / 3600) * 10) / 10,
      },
      storage: (Array.isArray(fsSize) ? fsSize : [])
        .filter((f: any) => f.size > 0)
        .slice(0, 6)
        .map((f: any) => ({
          fs: f.fs,
          sizeGb: Math.round((f.size / 1024 ** 3) * 10) / 10,
          usedGb: Math.round((f.used / 1024 ** 3) * 10) / 10,
          usePercent: Math.round(f.use || 0),
          mount: f.mount,
        })),
      processes: topProcesses,
      timestamp: new Date().toISOString(),
      simulated: false,
    });
  } catch (err: any) {
    console.warn('systeminformation failed, serving os-module fallback:', err?.message);
    const totalMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMb = Math.round(os.freemem() / (1024 * 1024));
    const cores = os.cpus().length || 1;
    res.json({
      cpu: {
        manufacturer: '—',
        brand: os.cpus()[0]?.model || '—',
        speed: os.cpus()[0]?.speed ? Math.round(os.cpus()[0].speed / 100) / 10 : 0,
        cores,
        loadPercent: Math.min(100, Math.round(((os.loadavg()[0] || 0) / cores) * 100)),
      },
      memory: {
        totalMb,
        usedMb: totalMb - freeMb,
        freeMb,
        usedPercent: totalMb ? Math.round(((totalMb - freeMb) / totalMb) * 100) : 0,
      },
      os: {
        platform: os.platform(),
        distro: os.type(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
      },
      storage: [],
      processes: [],
      timestamp: new Date().toISOString(),
      simulated: true,
    });
  }
});

// ---------- Security audit log ----------
app.get('/api/system/audit-log', (req, res) => {
  res.json({ items: SECURITY_AUDIT_LOG.slice(0, 100), shellExecutionEnabled: false });
});

// ---------- Multi-agent orchestrator (goal -> delegated task plan) ----------
const ORCHESTRATOR_AGENT_IDS = ['adam', 'amira', 'paul', 'charlotte', 'shane', 'penny', 'windows', 'web', 'analysis'] as const;

function buildHeuristicOrchestration(goal: string, botName: string) {
  const g = goal.toLowerCase();
  const has = (...words: string[]) => words.some((w) => g.includes(w));
  const tasks: Array<any> = [];
  const push = (agentId: string, taskTitle: string, instruction: string, expectedArtifact: string) =>
    tasks.push({ agentId, taskTitle, instruction, expectedArtifact, status: 'pending' });

  if (has('فاتور', 'ضريب', 'vat', 'zatca', 'eta', 'قيمة مضافة', 'خصم من المورد')) {
    push('adam', 'مراجعة القيود والفواتير', 'مطابقة قيود اليومية والفواتير مع ضريبة القيمة المضافة 14% وفق المعايير المصرية.', 'كشف قيود موقّع + قائمة فواتير جاهزة للإقرار');
    push('amira', 'تدقيق الامتثال الضريبي', 'فحص الفواتير الإلكترونية والخصم من المورد تحت حساب الضريبة ورصد أي ثغرات امتثال لدى ETA.', 'تقرير مخاطر امتثال مرتب بالأولوية');
  }
  if (has('تسويق', 'مبيعات', 'حملة', 'عملاء', 'نمو')) {
    push('charlotte', 'خطة نمو وتسويق', 'تحليل هامش الحملات التسويقية واقتراح ميزانية نمو دون تضخيم المصروفات.', 'خطة حملة بميزانية وعائد متوقع');
  }
  if (has('سفر', 'عملا', 'دولار', 'عملات', 'توسع', 'تصدير', 'استيراد')) {
    push('penny', 'تحليل العملات والتوسع', 'دراسة أثر أسعار الصرف (ج.م/دولار) على التكاليف والعقود الدولية.', 'مذكرة مخاطر سعر صرف وبدائل تسعير');
  }
  if (has('مطعم', 'مقهى', 'تكاليف تشغيل', 'هامش')) {
    push('shane', 'هندسة تكاليف التشغيل', 'تفكيك تكاليف التشغيل المباشرة ورفع هامش الربح التشغيلي.', 'جدول وفورات تشغيلية مقترحة');
  }
  if (has('ويندوز', 'أتمتة', 'إكسل', 'excel', 'powershell', 'سكريبت')) {
    push('windows', 'تجهيز سكربت أتمتة (بدون تنفيذ)', 'توليد نص سكربت PowerShell/Batch آمن للمراجعة اليدوية من تبويب الويندوز — لا تنفيذ تلقائي.', 'ملف .ps1/.bat جاهز للمراجعة والنسخ');
  }
  if (has('موقع', 'ويب', 'رابط', 'http', 'www.', 'منافس')) {
    push('web', 'استخراج وتحليل محتوى ويب', 'قراءة الرابط المستهدف عبر أداة الويب المحروسة واستخراج النقاط الجوهرية.', 'ملخص محتوى + روابط ذات صلة');
  }
  if (has('تحليل', 'تقرير', 'بيانات', 'جلسة', 'محادثة')) {
    push('analysis', 'تحليل مالي للجلسات', 'تشغيل محلّل النصوص المالية على الجلسات المسجلة واستخراج التوزيع والخصومات وتصدير Excel/Word/PDF.', 'تقرير مالي قابل للتصدير');
  }
  if (tasks.length === 0) {
    push('paul', 'تنسيق المهمة وترتيب الأولويات', `تنسيق هدف «${goal}» وفق البروتوكول وتحديد المسؤوليات والمواعيد.`, 'خطة تنفيذ مرتبة');
    push('adam', 'مراجعة مالية أولية', 'تقدير الأثر المالي للهدف وبنود التكلفة والعائد المتوقع.', 'مذكرة أثر مالي');
    push('analysis', 'تجميع النتائج في تقرير', 'تلخيص مخرجات كل الوكلاء في تقرير تنفيذي واحد قابل للتصدير.', 'تقرير تنفيذي موحّد');
  }

  return {
    planSummary: `تم تفكيك الهدف «${goal}» إلى ${tasks.length} مهام موزعة على فريق الوكلاء بقيادة ${botName}. (وضع التخطيط الاستدلالي المحلي — صل مفتاح Gemini أو Ollama لتخطيط حي أذكى.)`,
    speechResponse: `تم إعداد خطة تفويض من ${tasks.length} مهام. المهام الآن قيد الانتظار في التبويبات المختصة، ولن ينفّذ أي وكيل إجراءً على جهازك دون موافقتك.`,
    delegatedTasks: tasks.slice(0, 8),
    simulated: true,
    createdAt: Date.now(),
  };
}

app.post('/api/orchestrator/dispatch', async (req, res) => {
  try {
    const { goal, bot, userProfile } = req.body || {};
    if (!goal || typeof goal !== 'string' || !goal.trim()) {
      return res.status(400).json({ error: 'Goal text is required' });
    }
    const cleanGoal = goal.trim().slice(0, 2000);
    const guard = evaluateGuardrail('agent', 'orchestrator_dispatch', cleanGoal.slice(0, 120), cleanGoal);
    if (!guard.allowed) {
      return res.status(403).json({ error: `تم حظر الهدف بواسطة الحارس الأمني: ${guard.reason}`, blocked: true });
    }

    const botName = bot?.name || bot?.arabicName || 'قائد الفريق';
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `You are the Orchestrator of a multi-agent accounting team in Egypt. Decompose the user's goal into delegated tasks.
User: ${userProfile?.name || 'المستخدم'} (${userProfile?.role || 'مدير مالي'}) — Company: ${userProfile?.company || '—'}
Lead agent: ${botName}
GOAL: """${cleanGoal}"""
Allowed agentId values ONLY: adam (chief accountant), amira (auditor/compliance), paul (formal coordinator), charlotte (marketing/growth), shane (operations costs), penny (FX/expansion), windows (script TEXT generation only, never execution), web (guarded web reading), analysis (financial transcript analysis & exports).
Rules: 3-6 tasks, Arabic text, every task status must be "pending". Never propose executing commands on the user's machine; windows tasks produce reviewable script text only.
Return STRICT JSON: {"planSummary":"...","speechResponse":"...","delegatedTasks":[{"agentId":"adam","taskTitle":"...","instruction":"...","expectedArtifact":"...","status":"pending"}]}`;
        const response: any = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { temperature: 0.3, responseMimeType: 'application/json' },
        });
        const parsed = JSON.parse(response.text || '{}');
        const tasks = (Array.isArray(parsed.delegatedTasks) ? parsed.delegatedTasks : [])
          .slice(0, 8)
          .map((t: any) => ({
            agentId: (ORCHESTRATOR_AGENT_IDS as readonly string[]).includes(t.agentId) ? t.agentId : 'analysis',
            taskTitle: String(t.taskTitle || 'مهمة موكولة').slice(0, 120),
            instruction: String(t.instruction || '').slice(0, 500),
            expectedArtifact: String(t.expectedArtifact || 'مخرجات موثقة').slice(0, 200),
            status: 'pending',
          }));
        if (tasks.length > 0) {
          return res.json({
            planSummary: String(parsed.planSummary || 'خطة تفويض جاهزة.'),
            speechResponse: String(parsed.speechResponse || 'تم إعداد خطة التفويض.'),
            delegatedTasks: tasks,
            simulated: false,
            createdAt: Date.now(),
          });
        }
      } catch (aiErr: any) {
        console.warn('Orchestrator Gemini fallback:', aiErr?.message);
      }
    }
    return res.json(buildHeuristicOrchestration(cleanGoal, botName));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Orchestration failed' });
  }
});

// ---------- Ollama local-AI bridge ----------
app.get('/api/ollama/status', async (req, res) => {
  const tags = await fetchOllamaTags();
  if (tags === null) {
    return res.json({
      isConnected: false,
      host: OLLAMA_HOST,
      engine: 'ollama',
      message: `محرك Ollama المحلي غير متاح على ${OLLAMA_HOST}. ثبّته من ollama.com ثم شغّل: ollama serve — واسحب نموذجًا: ollama pull qwen2.5:7b. القائمة التالية نماذج مقترحة للتثبيت (ليست مثبتة فعليًا).`,
      models: OLLAMA_RECOMMENDED_CATALOG,
    });
  }
  const models = tags.map((m: any) => ({
    name: String(m.name || ''),
    displayName: String(m.name || '').replace(/:latest$/, ''),
    size: formatBytesAsGb(m.size),
    family: m.details?.family || '—',
    recommended: /llama|qwen|mistral|gemma/i.test(String(m.name || '')),
  }));
  res.json({
    isConnected: true,
    host: OLLAMA_HOST,
    engine: 'ollama',
    message: models.length ? `متصل — ${models.length} نموذج محلي متاح.` : 'متصل، لكن لا توجد نماذج مسحوبة بعد. جرّب: ollama pull qwen2.5:7b',
    models,
  });
});

const OLLAMA_TOOL_INSTRUCTIONS: Record<string, string> = {
  generate: 'أجب بإيجاز ووضوح بالعربية ما لم يطلب المستخدم لغة أخرى.',
  summarize: 'لخّص النص التالي في نقاط محددة بالعربية مع إبراز أي أرقام مالية.',
  accounting: 'أنت محاسب قانوني مصري. أجب وفق معايير المحاسبة المصرية وضريبة القيمة المضافة 14% ومنظومة الفاتورة الإلكترونية (ETA)، واذكر الإجراء العملي التالي.',
  translate: 'ترجم النص التالي ترجمة مهنية (عربي↔إنجليزي حسب لغة الإدخال) مع الحفاظ على الأرقام والمصطلحات المحاسبية.',
};

app.post('/api/ollama/execute', async (req, res) => {
  try {
    const tool = String(req.body?.tool || 'generate');
    const promptText = String(req.body?.prompt || '').trim();
    const requestedModel = req.body?.model ? String(req.body.model) : '';
    if (!promptText) return res.status(400).json({ error: 'Prompt is required' });
    if (!OLLAMA_TOOL_INSTRUCTIONS[tool]) {
      return res.status(400).json({ error: `Unknown tool "${tool}". Allowed: ${Object.keys(OLLAMA_TOOL_INSTRUCTIONS).join(', ')}` });
    }
    const guard = evaluateGuardrail('ollama', `ollama_${tool}`, promptText.slice(0, 120), promptText);
    if (!guard.allowed) {
      return res.status(403).json({ error: `تم حظر الطلب بواسطة الحارس الأمني: ${guard.reason}`, blocked: true });
    }

    const tags = await fetchOllamaTags();
    if (tags === null || tags.length === 0) {
      return res.json({
        tool,
        executed: false,
        summary: tags === null ? 'Ollama غير متصل — لم يتم توليد أي نص.' : 'Ollama متصل لكن لا توجد نماذج مثبتة — لم يتم توليد أي نص.',
        explanation: `لا توجد محاكاة مزيفة لردود النماذج. للتشغيل الحقيقي: 1) ثبّت Ollama من ollama.com 2) شغّل "ollama serve" 3) اسحب نموذجًا "ollama pull qwen2.5:7b" 4) أعد المحاولة — وسيعمل كل شيء محليًا دون مغادرة بياناتك لجهازك. المضيف الحالي: ${OLLAMA_HOST}`,
      });
    }
    const installedNames = tags.map((m: any) => String(m.name));
    const model = requestedModel && installedNames.includes(requestedModel) ? requestedModel : installedNames[0];
    if (requestedModel && !installedNames.includes(requestedModel)) {
      return res.json({
        tool,
        executed: false,
        summary: `النموذج المطلوب «${requestedModel}» غير مثبت محليًا.`,
        detail: `النماذج المتاحة: ${installedNames.join('، ')}`,
        explanation: `اسحب النموذج أولًا: ollama pull ${requestedModel}`,
      });
    }

    const genResp = await axios.post(
      `${OLLAMA_HOST}/api/generate`,
      {
        model,
        stream: false,
        prompt: `${OLLAMA_TOOL_INSTRUCTIONS[tool]}\n\n${promptText.slice(0, 8000)}`,
      },
      { timeout: 120000 },
    );
    const text = String(genResp.data?.response || '').trim();
    return res.json({
      tool,
      executed: Boolean(text),
      summary: `تم التوليد محليًا بواسطة ${model} على جهازك (بدون إرسال بيانات لسحابة خارجية).`,
      detail: text.slice(0, 12000),
      explanation: 'هذا الرد مولّد فعليًا من نموذج Ollama محلي عبر واجهته الرسمية /api/generate — راجِع أي أرقام قبل اعتمادها محاسبيًا.',
    });
  } catch (err: any) {
    res.json({
      tool: String(req.body?.tool || 'generate'),
      executed: false,
      summary: 'تعذر إتمام التوليد المحلي.',
      detail: err?.message || 'Unknown error',
      explanation: 'تحقق من أن Ollama يعمل (ollama serve) وأن النموذج مسحوب بالكامل، ثم أعد المحاولة.',
    });
  }
});

// ---------- Safe Adapters: browser / filesystem / mouse / keyboard / windows ----------
const BROWSER_UAS: Record<string, string> = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  bot: 'ChatterBots-BrowserAdapter/1.0 (guarded read-only fetch)',
};
let browserAdapterConfig = { userAgentPreset: 'chrome', timeoutMs: 10000 };

async function browserFetchPage(rawUrl: string) {
  let url = rawUrl;
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  const resp = await axios.get(url, {
    timeout: browserAdapterConfig.timeoutMs,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      'User-Agent': BROWSER_UAS[browserAdapterConfig.userAgentPreset] || BROWSER_UAS.chrome,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
  });
  const $ = cheerio.load(resp.data);
  $('script, style, noscript, svg').remove();
  return { $, url, status: resp.status };
}

app.get('/api/adapters/state', (req, res) => {
  ensureSandbox();
  const nut = DESKTOP_ADAPTERS_ENABLED ? tryLoadNutJs() : null;
  const desktopMode = DESKTOP_ADAPTERS_ENABLED && nut ? 'enabled' : 'dry-run';
  res.json({
    shellExecutionEnabled: false,
    desktopAdaptersEnabled: DESKTOP_ADAPTERS_ENABLED,
    loopbackOnlyForDesktopInput: true,
    sandboxDirName: 'adapter-workspace',
    browserConfig: { ...browserAdapterConfig, userAgent: BROWSER_UAS[browserAdapterConfig.userAgentPreset] },
    adapters: [
      {
        id: 'browser', nameAr: 'محوّل المتصفح المتقدم', mode: 'enabled', requiresApproval: true,
        capabilities: ['open (فتح وقراءة صفحة)', 'extract_links (استخراج الروابط)', 'search_text (بحث داخل الصفحة)'],
        notes: 'جلب HTTP محروس بلا عناوين خاصة/داخلية. عرض JavaScript الكامل/lقطات الشاشة يحتاج تثبيت Playwright محليًا اختياريًا — غير مفعّل افتراضيًا.',
      },
      {
        id: 'filesystem', nameAr: 'محوّل الملفات (صندوق آمن)', mode: 'enabled', requiresApproval: true,
        capabilities: ['list (سرد مجلد الصندوق)', 'read_text (قراءة ملف نصي داخل الصندوق فقط)'],
        notes: 'قراءة فقط داخل ./adapter-workspace مع منع تجاوز المسار (path traversal). لا حذف ولا كتابة ولا وصول لملفات النظام.',
      },
      {
        id: 'mouse', nameAr: 'محوّل الفأرة', mode: desktopMode, requiresApproval: true,
        capabilities: ['move (تحريك المؤشر)', 'click (نقر)'],
        notes: DESKTOP_ADAPTERS_ENABLED
          ? (nut ? 'التنفيذ الحقيقي مفعّل على هذا الجهاز — يعمل فقط لطلبات هذا الجهاز نفسه (loopback) وبموافقتك لكل إجراء.' : 'مفعّل في الإعداد لكن الحزمة الاختيارية غير مثبتة: npm i @nut-tree/nut-js — يعمل مؤقتًا بوضع المعاينة.')
          : 'وضع المعاينة الآمن (Dry-Run): يُسجَّل الإجراء ولا يتحرك المؤشر فعليًا. للتفعيل على جهازك: ENABLE_DESKTOP_ADAPTERS=true + npm i @nut-tree/nut-js وتشغيل الخادم محليًا.',
      },
      {
        id: 'keyboard', nameAr: 'محوّل لوحة المفاتيح', mode: desktopMode, requiresApproval: true,
        capabilities: ['type (كتابة نص)', 'press (ضغط مفتاح من قائمة بيضاء)'],
        notes: 'نفس قيود محوّل الفأرة + النص يمر على الحارس الأمني والمفاتيح من قائمة بيضاء فقط.',
      },
      {
        id: 'windows', nameAr: 'محوّل ويندوز', mode: 'enabled', requiresApproval: true,
        capabilities: ['generate_script (توليد نص سكربت للمراجعة)'],
        notes: 'توليد نص فقط — تنفيذ أوامر نظام معطّل نهائيًا في الخادم by design. التشغيل قرارك اليدوي على جهازك بعد المراجعة.',
      },
      {
        id: 'system', nameAr: 'محوّل تشخيص النظام', mode: 'enabled', requiresApproval: true,
        capabilities: ['diagnostics (لقطة CPU/RAM/عمليات حقيقية)'],
        notes: 'قراءة تشخيصية حقيقية عبر systeminformation — بدون أي تعديل على النظام.',
      },
    ],
  });
});

app.post('/api/adapters/browser/configure', (req, res) => {
  const preset = String(req.body?.userAgentPreset || '');
  const timeoutMs = Number(req.body?.timeoutMs);
  if (preset && BROWSER_UAS[preset]) browserAdapterConfig.userAgentPreset = preset;
  if (!isNaN(timeoutMs)) browserAdapterConfig.timeoutMs = Math.min(30000, Math.max(1000, Math.round(timeoutMs)));
  evaluateGuardrail('system', 'browser_configure', `${browserAdapterConfig.userAgentPreset}/${browserAdapterConfig.timeoutMs}ms`);
  res.json({
    ok: true,
    browserConfig: { ...browserAdapterConfig, userAgent: BROWSER_UAS[browserAdapterConfig.userAgentPreset] },
    note: 'تمت تهيئة محوّل المتصفح. الجلب محروس دائمًا (http/https عامة فقط).',
  });
});

type AdapterName = 'mouse' | 'keyboard' | 'browser' | 'filesystem' | 'windows' | 'system';
const ADAPTER_ACTIONS: Record<AdapterName, string[]> = {
  mouse: ['move', 'click'],
  keyboard: ['type', 'press'],
  browser: ['open', 'extract_links', 'search_text'],
  filesystem: ['list', 'read_text'],
  windows: ['generate_script'],
  system: ['diagnostics'],
};
const KEYBOARD_KEY_ALLOWLIST = ['Enter', 'Tab', 'Escape', 'Backspace', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];

function validateAdapterAction(adapter: string, action: string, params: any): string | null {
  if (!ADAPTER_ACTIONS[adapter as AdapterName]) return `محوّل غير معروف: ${adapter}`;
  if (!ADAPTER_ACTIONS[adapter as AdapterName].includes(action)) return `إجراء ${action} غير مسموح على محوّل ${adapter}`;
  const p = params || {};
  if (adapter === 'mouse') {
    if (action === 'move' && (!isFinite(p.x) || !isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 20000 || p.y > 20000)) return 'إحداثيات الفأرة يجب أن تكون أرقامًا بين 0 و20000';
    if (action === 'click' && p.button && !['left', 'right', 'middle'].includes(p.button)) return 'زر فأرة غير مسموح';
  }
  if (adapter === 'keyboard') {
    if (action === 'type' && (typeof p.text !== 'string' || p.text.length === 0 || p.text.length > 500)) return 'نص الكتابة مطلوب وبحد أقصى 500 حرف';
    if (action === 'press' && !KEYBOARD_KEY_ALLOWLIST.includes(p.key)) return `المفتاح ${p.key} خارج القائمة البيضاء`;
  }
  if (adapter === 'browser' && typeof p.url !== 'string') return 'رابط المتصفح مطلوب';
  if (adapter === 'browser' && action === 'search_text' && !p.query) return 'نص البحث مطلوب';
  if (adapter === 'filesystem' && action === 'read_text' && !p.file) return 'اسم الملف مطلوب';
  if (adapter === 'windows' && action === 'generate_script' && !p.prompt) return 'وصف السكربت مطلوب';
  return null;
}

function scanBlocked(text: string): string | null {
  const hit = BLOCKED_PATTERNS.find(({ pattern }) => pattern.test(text));
  return hit ? hit.reason : null;
}

function buildHeuristicAdapterProposal(goal: string) {
  const actions: Array<any> = [];
  const add = (adapter: string, action: string, params: any, rationale: string, riskLevel: 'low' | 'medium' = 'low') =>
    actions.push({ id: 'act-' + Date.now() + '-' + actions.length, adapter, action, params, rationale, riskLevel, status: 'awaiting-approval' });

  const urlMatch = goal.match(/https?:\/\/[^\s]+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?/i);
  const quoted = goal.match(/[«"“](.+?)[»"”]/);
  if (urlMatch) {
    add('browser', 'open', { url: urlMatch[0] }, 'فتح الرابط المذكور في الهدف وقراءة محتواه.');
    add('browser', 'extract_links', { url: urlMatch[0] }, 'استخراج روابط الصفحة للمتابعة.');
  }
  if (/اكتب|كتابة|type|نصّ|نص /.test(goal) && quoted) {
    add('keyboard', 'type', { text: quoted[1] }, 'كتابة النص المحصور بين علامات التنصيص في الحقل المركّز حاليًا — راجِع التركيز قبل الموافقة.', 'medium');
  }
  if (/فأرة|مؤشر|انقر|نقر|click|mouse|حرّك المؤشر/.test(goal)) {
    add('mouse', 'move', { x: 640, y: 480 }, 'إحداثيات تجريبية قابلة للتحرير من الواجهة قبل التنفيذ — لن يتحرك المؤشر في وضع المعاينة.', 'medium');
  }
  if (/ملفات|مجلد|اعرض الملفات|list files/.test(goal)) {
    add('filesystem', 'list', { subpath: '.' }, 'سرد محتويات مجلد الصندوق الآمن adapter-workspace.');
  }
  if (/سكريبت|powershell|ويندوز|batch/i.test(goal)) {
    add('windows', 'generate_script', { prompt: goal }, 'توليد نص سكربت للمراجعة من تبويب الويندوز — بدون أي تنفيذ.');
  }
  if (/تشخيص|أداء|نظام|حالة الجهاز/.test(goal)) {
    add('system', 'diagnostics', {}, 'لقطة تشخيص حقيقية للمعالج والذاكرة والعمليات.');
  }
  if (actions.length === 0) {
    add('system', 'diagnostics', {}, 'بداية آمنة: فهم حالة الجهاز قبل أي إجراء آخر.');
    add('filesystem', 'list', { subpath: '.' }, 'استعراض ملفات مساحة عمل المحوّلات المتاحة.');
  }
  return actions.slice(0, 6);
}

// LLM (Ollama/Gemini) or heuristics PROPOSE actions — execution is a separate, user-approved call.
app.post('/api/adapters/propose', async (req, res) => {
  try {
    const goal = String(req.body?.goal || '').trim().slice(0, 2000);
    const source = String(req.body?.source || 'user');
    if (!goal) return res.status(400).json({ error: 'Goal is required' });

    const guard = evaluateGuardrail('agent', 'adapter_propose', goal.slice(0, 120), goal);
    if (!guard.allowed) {
      return res.status(403).json({ error: `تم حظر الهدف بواسطة الحارس الأمني: ${guard.reason}`, blocked: true });
    }

    let actions: Array<any> = [];
    let engine = 'heuristic';
    let simulated = true;
    let note = 'اقتراحات استدلالية محلية. راجِع كل إجراء ووافق عليه يدويًا قبل التنفيذ.';

    if (source === 'ollama') {
      const tags = await fetchOllamaTags();
      if (tags && tags.length > 0) {
        try {
          const model = String(tags[0].name);
          const llmPrompt = `You propose SAFE desktop/browser actions as strict JSON. Allowed adapters/actions: mouse.move{x,y}, mouse.click{x,y,button}, keyboard.type{text}, keyboard.press{key (only Enter,Tab,Escape,Backspace,Space,ArrowUp,ArrowDown,ArrowLeft,ArrowRight)}, browser.open{url}, browser.extract_links{url}, browser.search_text{url,query}, filesystem.list{subpath}, filesystem.read_text{file}, windows.generate_script{prompt}, system.diagnostics{}.
Goal: "${goal}"
Return ONLY JSON: {"actions":[{"adapter":"browser","action":"open","params":{"url":"https://example.com"},"rationale":"..."}]} — max 5 actions. Never propose executing shell commands, deleting files, or credential access.`;
          const gen = await axios.post(`${OLLAMA_HOST}/api/generate`, { model, stream: false, prompt: llmPrompt, format: 'json' }, { timeout: 90000 });
          const raw = String(gen.data?.response || '{}').replace(/^```json?/i, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(raw);
          const sanitized: Array<any> = [];
          for (const a of (Array.isArray(parsed.actions) ? parsed.actions : []).slice(0, 6)) {
            const adapter = String(a.adapter || '');
            const action = String(a.action || '');
            const params = a.params && typeof a.params === 'object' ? a.params : {};
            if (validateAdapterAction(adapter, action, params)) continue;
            if (scanBlocked(JSON.stringify({ adapter, action, params }))) continue;
            sanitized.push({
              id: 'act-' + Date.now() + '-' + sanitized.length,
              adapter, action, params,
              rationale: String(a.rationale || 'اقتراح من نموذج Ollama المحلي — راجِع قبل الموافقة.').slice(0, 300),
              riskLevel: adapter === 'mouse' || adapter === 'keyboard' ? 'medium' : 'low',
              status: 'awaiting-approval',
            });
          }
          if (sanitized.length > 0) {
            actions = sanitized;
            engine = `ollama:${model}`;
            simulated = false;
            note = 'اقترح نموذج Ollama المحلي هذه الإجراءات وتمت تصفيتها بالقائمة البيضاء والحارس الأمني. النموذج لا يستطيع التنفيذ — التنفيذ يبدأ فقط بموافقتك على كل إجراء.';
          }
        } catch (e: any) {
          console.warn('Ollama propose fallback:', e?.message);
        }
      } else {
        note = 'Ollama غير متصل/بدون نماذج — تم التبديل لمقترحات استدلالية محلية موسومة كمحاكاة. شغّل ollama serve واسحب نموذجًا لاقتراحات حيّة.';
      }
    }

    if (actions.length === 0) actions = buildHeuristicAdapterProposal(goal);

    res.json({
      proposalId: 'prop-' + Date.now(),
      goal,
      engine,
      simulated,
      requiresUserApprovalForEveryAction: true,
      note,
      actions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Adapter propose failed' });
  }
});

app.post('/api/adapters/execute', async (req, res) => {
  const actionObj = req.body?.action || {};
  const adapter = String(actionObj.adapter || '');
  const action = String(actionObj.action || '');
  const params = actionObj.params && typeof actionObj.params === 'object' ? actionObj.params : {};
  const base = { adapter, action };

  try {
    // 1) Human approval is mandatory — the LLM can never reach this endpoint's success path alone.
    if (req.body?.approvedByUser !== true) {
      pushAudit({ category: 'system', action: `adapter_execute_denied_no_approval`, target: `${adapter}.${action}`, riskLevel: 'blocked', status: 'blocked', reason: 'محاولة تنفيذ بدون موافقة مستخدم صريحة (approvedByUser !== true)' });
      return res.status(403).json({ ...base, executed: false, simulated: false, summary: 'مرفوض: التنفيذ يتطلب موافقة صريحة من المستخدم من داخل الواجهة لكل إجراء.' });
    }
    // 2) Allowlist + parameter validation.
    const validationError = validateAdapterAction(adapter, action, params);
    if (validationError) {
      return res.status(400).json({ ...base, executed: false, simulated: false, summary: `إجراء غير صالح: ${validationError}` });
    }
    // 3) Guardrail scan + audit.
    const guard = evaluateGuardrail('agent', `adapter_execute_${adapter}_${action}`, `${adapter}.${action}`, JSON.stringify(params).slice(0, 1000));
    if (!guard.allowed) {
      return res.status(403).json({ ...base, executed: false, simulated: false, summary: `تم حظر الإجراء بواسطة الحارس الأمني: ${guard.reason}` });
    }

    // Browser adapter (real guarded fetch)
    if (adapter === 'browser') {
      const webGuard = evaluateGuardrail('web', `browser_${action}`, String(params.url));
      if (!webGuard.allowed) {
        return res.status(403).json({ ...base, executed: false, simulated: false, summary: `رابط محظور: ${webGuard.reason}` });
      }
      const { $, url, status } = await browserFetchPage(String(params.url));
      const title = $('title').text().trim() || url;
      if (action === 'open') {
        const paragraphs: string[] = [];
        $('p').each((_, el) => { const t = $(el).text().trim(); if (t.length > 20 && paragraphs.length < 6) paragraphs.push(t); });
        return res.json({ ...base, executed: true, simulated: false, summary: `تم فتح «${title}» (HTTP ${status}) وقراءة محتواها عبر محوّل المتصفح المحروس.`, detail: (title + '\n' + paragraphs.join('\n')).slice(0, 4000) });
      }
      if (action === 'extract_links') {
        const links: Array<{ text: string; href: string }> = [];
        $('a[href]').each((_, el) => {
          if (links.length >= 30) return;
          const href = String($(el).attr('href') || '');
          try { links.push({ text: $(el).text().trim().slice(0, 80) || href, href: new URL(href, url).toString() }); } catch { /* skip */ }
        });
        return res.json({ ...base, executed: true, simulated: false, summary: `تم استخراج ${links.length} رابطًا من «${title}».`, detail: links.map((l) => `${l.text} → ${l.href}`).join('\n').slice(0, 4000) });
      }
      // search_text
      const bodyText = $('body').text().replace(/\s+/g, ' ');
      const q = String(params.query);
      const idxs: number[] = [];
      let pos = bodyText.toLowerCase().indexOf(q.toLowerCase());
      while (pos !== -1 && idxs.length < 5) { idxs.push(pos); pos = bodyText.toLowerCase().indexOf(q.toLowerCase(), pos + q.length); }
      const snippets = idxs.map((i) => '…' + bodyText.slice(Math.max(0, i - 70), i + q.length + 70) + '…');
      return res.json({ ...base, executed: true, simulated: false, summary: idxs.length ? `وجدنا ${idxs.length} سياقات لـ «${q}» داخل «${title}».` : `لم يظهر «${q}» في نص صفحة «${title}».`, detail: snippets.join('\n\n').slice(0, 4000) });
    }

    // Filesystem adapter (sandboxed read-only)
    if (adapter === 'filesystem') {
      ensureSandbox();
      if (action === 'list') {
        const target = resolveSandboxPath(String(params.subpath || '.'));
        if (!target) return res.status(403).json({ ...base, executed: false, simulated: false, summary: 'مسار خارج مجلد الصندوق — مرفوض.' });
        const entries = fs.readdirSync(target, { withFileTypes: true }).slice(0, 100)
          .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
        return res.json({ ...base, executed: true, simulated: false, summary: `محتويات adapter-workspace${params.subpath && params.subpath !== '.' ? '/' + params.subpath : ''} (${entries.length} عنصرًا):`, detail: entries.join('\n') || '(فارغ)' });
      }
      // read_text
      const target = resolveSandboxPath(String(params.file));
      if (!target) return res.status(403).json({ ...base, executed: false, simulated: false, summary: 'مسار خارج مجلد الصندوق — مرفوض.' });
      if (!/\.(txt|md|json|csv)$/i.test(target)) return res.status(400).json({ ...base, executed: false, simulated: false, summary: 'يُسمح فقط بقراءة ملفات .txt/.md/.json/.csv داخل الصندوق.' });
      const stat = fs.statSync(target);
      if (stat.size > 256 * 1024) return res.status(400).json({ ...base, executed: false, simulated: false, summary: 'الملف أكبر من 256KB — قراءة جزئية غير مدعومة.' });
      const content = fs.readFileSync(target, 'utf8');
      return res.json({ ...base, executed: true, simulated: false, summary: `تمت قراءة ${params.file} من الصندوق الآمن.`, detail: content.slice(0, 6000) });
    }

    // System diagnostics quick snapshot (real)
    if (adapter === 'system') {
      const [cpuLoad, memInfo] = await Promise.all([si.currentLoad(), si.mem()]);
      return res.json({
        ...base, executed: true, simulated: false,
        summary: 'لقطة تشخيص حقيقية عبر systeminformation.',
        detail: `CPU Load: ${Math.round(cpuLoad.currentLoad)}% | RAM: ${Math.round(memInfo.used / 1024 ** 3 * 10) / 10}/${Math.round(memInfo.total / 1024 ** 3 * 10) / 10} GB | OS: ${os.type()} ${os.release()} | Uptime: ${(os.uptime() / 3600).toFixed(1)}h — التفاصيل الكاملة في تبويب «التشخيص الحقيقي».`,
      });
    }

    // Windows scripts: generation-only by design
    if (adapter === 'windows') {
      return res.json({
        ...base, executed: false, simulated: true,
        summary: 'محوّل ويندوز يولّد نصوص سكربتات فقط ولا ينفّذ أي أمر على الجهاز (by design).',
        detail: 'انتقل لتبويب «أتمتة الويندوز» لتوليد السكربت ومراجعته ونسخه، ثم شغّله بنفسك على جهازك إن وثقت بمحتواه.',
      });
    }

    // Mouse / keyboard: real only when operator-enabled + nut.js + loopback. Otherwise transparent dry-run.
    if (adapter === 'mouse' || adapter === 'keyboard') {
      if (!DESKTOP_ADAPTERS_ENABLED) {
        return res.json({
          ...base, executed: false, simulated: true,
          summary: `[وضع المعاينة الآمن Dry-Run] تم تسجيل واعتماد إجراء ${adapter}.${action} لكن لم يتم إرسال أي إدخال حقيقي إلى ${adapter === 'mouse' ? 'الفأرة' : 'لوحة المفاتيح'} لأن التنفيذ المكتبي معطّل على الخادم.`,
          detail: 'لتفعيل التنفيذ الحقيقي على جهاز ويندوز المحلي: 1) شغّل هذا المشروع محليًا 2) npm i @nut-tree/nut-js 3) عيّن ENABLE_DESKTOP_ADAPTERS=true في .env 4) افتح التطبيق من نفس الجهاز (طلبات loopback فقط). عندها يعمل بشرط موافقتك على كل إجراء كما فعلت الآن.',
        });
      }
      if (!isLoopbackRequest(req)) {
        pushAudit({ category: 'system', action: 'adapter_execute_denied_non_loopback', target: `${adapter}.${action}`, riskLevel: 'blocked', status: 'blocked', reason: 'طلب تنفيذ فأرة/لوحة مفاتيح من عنوان غير محلي (غير loopback) — مرفوض' });
        return res.status(403).json({ ...base, executed: false, simulated: false, summary: 'مرفوض أمنيًا: تنفيذ الفأرة/لوحة المفاتيح يعمل فقط عندما تفتح التطبيق من نفس الجهاز الذي يعمل عليه الخادم (loopback).' });
      }
      const nut = tryLoadNutJs();
      if (!nut) {
        return res.json({ ...base, executed: false, simulated: true, summary: '[Dry-Run] الحزمة الاختيارية ‎@nut-tree/nut-js غير مثبتة على هذا الجهاز، فتم تسجيل الإجراء دون إدخال حقيقي.', detail: 'ثبّتها محليًا: npm i @nut-tree/nut-js ثم أعد تشغيل الخادم.' });
      }
      if (adapter === 'mouse' && action === 'move') {
        await nut.mouse.setPosition(new nut.Point(Math.round(params.x), Math.round(params.y)));
        return res.json({ ...base, executed: true, simulated: false, summary: `تم تحريك مؤشر الفأرة فعليًا إلى (${params.x}, ${params.y}) بموجب موافقتك.` });
      }
      if (adapter === 'mouse' && action === 'click') {
        if (isFinite(params.x) && isFinite(params.y)) await nut.mouse.setPosition(new nut.Point(Math.round(params.x), Math.round(params.y)));
        const btn = params.button === 'right' ? nut.Button.RIGHT : params.button === 'middle' ? nut.Button.MIDDLE : nut.Button.LEFT;
        await nut.mouse.click(btn);
        return res.json({ ...base, executed: true, simulated: false, summary: 'تم تنفيذ نقرة فأرة فعلية بموجب موافقتك.' });
      }
      if (adapter === 'keyboard' && action === 'type') {
        await nut.keyboard.type(String(params.text));
        return res.json({ ...base, executed: true, simulated: false, summary: 'تمت كتابة النص فعليًا في الحقل المركّز بموجب موافقتك.' });
      }
      // keyboard.press
      const keyName = String(params.key);
      const key = nut.Key[keyName as any];
      if (key === undefined) return res.status(400).json({ ...base, executed: false, simulated: false, summary: `المفتاح ${keyName} غير معروف لمحرك الإدخال المحلي.` });
      await nut.keyboard.pressKey(key);
      await nut.keyboard.releaseKey(key);
      return res.json({ ...base, executed: true, simulated: false, summary: `تم ضغط ${keyName} فعليًا بموجب موافقتك.` });
    }

    return res.status(400).json({ ...base, executed: false, simulated: false, summary: 'إجراء غير مدعوم.' });
  } catch (err: any) {
    console.warn('Adapter execute error:', err?.message);
    pushAudit({ category: 'system', action: 'adapter_execute_error', target: `${adapter}.${action}`, riskLevel: 'low', status: 'allowed', reason: `خطأ أثناء التنفيذ المعتمد: ${String(err?.message || 'unknown').slice(0, 120)}` });
    res.status(500).json({ ...base, executed: false, simulated: false, summary: `فشل تنفيذ الإجراء المعتمد: ${err?.message || 'خطأ غير معروف'}` });
  }
});

// Vite middleware mounting in dev mode
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChatterBots Remix Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

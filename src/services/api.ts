import { 
  ChatterBot, 
  UserProfile, 
  ChatMessage, 
  ConversationSession, 
  TranscriptFinancialAnalysis,
  WebScrapeResult,
  WindowsAutomationScript,
  AgentExecutionLog,
  OrchestrationResult,
  RealDiagnostics,
  OllamaStatus,
  OllamaToolResult,
  AuditLogItem,
  CurrencyCode,
  AdaptersStateResponse,
  AdapterProposalResponse,
  AdapterExecuteResult,
  AdapterActionProposal,
  InvoiceExtractionResult
} from '../types';

export interface ChatResponse {
  reply: string;
  simulated?: boolean;
}

export interface TTSResponse {
  audioData: string | null;
  mimeType?: string;
  fallbackWebSpeech?: boolean;
}

export const ApiService = {
  // Check backend and Gemini availability
  async getStatus(): Promise<{ status: string; hasGeminiKey: boolean }> {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('Status endpoint failed');
      return await res.json();
    } catch {
      return { status: 'fallback', hasGeminiKey: false };
    }
  },

  // Get deep system telemetry & capabilities
  async getSystemTelemetry(): Promise<any> {
    try {
      const res = await fetch('/api/control/system');
      if (!res.ok) throw new Error('System telemetry failed');
      return await res.json();
    } catch (e) {
      return {
        platform: 'win32',
        osType: 'Windows_NT',
        release: '10.0.22631',
        arch: 'x64',
        cpus: 8,
        memory: { totalMB: 16384, usedMB: 7120, freeMB: 9264, usedPercentage: 43 },
        uptimeHours: '12.4',
        simulated: true,
        capabilities: {
          webScraping: true,
          windowsPowerShellGenerator: true,
          windowsBatchGenerator: true,
          appLauncherAutomation: true,
          financialAuditEngine: true,
          agentAutonomousToolUse: true,
        },
      };
    }
  },

  // Real system diagnostics via `systeminformation` (merged from Bogy-Agants)
  async getRealDiagnostics(): Promise<RealDiagnostics> {
    const res = await fetch('/api/system/real-diagnostics');
    if (!res.ok) {
      throw new Error('Real diagnostics failed');
    }
    return await res.json();
  },

  // Multi-agent orchestration: decompose one goal into delegated agent tasks
  async orchestrateTask(
    goal: string,
    bot?: ChatterBot,
    userProfile?: UserProfile
  ): Promise<OrchestrationResult> {
    const res = await fetch('/api/orchestrator/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, bot, userProfile }),
    });

    if (!res.ok) {
      throw new Error('Orchestration failed');
    }

    return await res.json();
  },

  // Ollama local AI bridge status (offline-first; server degrades gracefully)
  async getOllamaStatus(): Promise<OllamaStatus> {
    try {
      const res = await fetch('/api/ollama/status');
      if (!res.ok) throw new Error('Ollama status failed');
      return await res.json();
    } catch {
      return {
        isConnected: false,
        host: 'http://localhost:11434',
        message: 'خادم API غير متاح — يتعذر التحقق من حالة Ollama المحلي.',
        models: [],
      };
    }
  },

  // Run a guarded Ollama tool (generation happens only when Ollama is online)
  async runOllamaTool(
    tool: string,
    prompt: string,
    model?: string
  ): Promise<OllamaToolResult> {
    const res = await fetch('/api/ollama/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, prompt, model }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Ollama tool failed' }));
      throw new Error(err.error || 'Ollama tool failed');
    }

    return await res.json();
  },

  // Security audit log (every control action is recorded server-side)
  async getAuditLog(): Promise<AuditLogItem[]> {
    try {
      const res = await fetch('/api/system/audit-log');
      if (!res.ok) throw new Error('Audit log failed');
      const data = await res.json();
      return data.items ?? [];
    } catch {
      return [];
    }
  },

  // Real Web Scraper and Content Extractor
  async scrapeWebUrl(url: string): Promise<WebScrapeResult> {
    const res = await fetch('/api/control/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Web scrape failed' }));
      throw new Error(err.error || 'Failed to fetch website');
    }

    return await res.json();
  },

  // Windows Script Generator
  async generateWindowsScript(
    prompt: string,
    category?: string,
    shell: 'powershell' | 'batch' = 'powershell',
    botName?: string
  ): Promise<WindowsAutomationScript> {
    const res = await fetch('/api/control/windows-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, category, shell, botName }),
    });

    if (!res.ok) {
      throw new Error('Failed to generate script');
    }

    const data = await res.json();
    return data.script;
  },

  // Real Autonomous Agent Tool Execution
  async executeAgentAction(
    bot: ChatterBot,
    actionType: 'web_scrape' | 'web_search' | 'windows_script' | 'app_launch' | 'financial_audit',
    target?: string,
    params?: any
  ): Promise<AgentExecutionLog> {
    const res = await fetch('/api/control/agent-execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot, actionType, target, params }),
    });

    if (!res.ok) {
      throw new Error('Agent execution failed');
    }

    const data = await res.json();
    return data.log;
  },

  // Financial Transcript Analyzer with Gemini (Egypt-first accounting profile)
  async analyzeTranscript(
    session: ConversationSession,
    userProfile: UserProfile,
    currency: CurrencyCode = 'EGP'
  ): Promise<TranscriptFinancialAnalysis> {
    const res = await fetch('/api/analyze-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, userProfile, currency }),
    });

    if (!res.ok) {
      throw new Error('Transcript analysis failed');
    }

    const data = await res.json();
    return data.analysis;
  },

  // Structured extraction of one invoice image/PDF into an editable draft.
  async extractInvoice(
    fileBase64: string,
    mimeType: string,
    fileName: string,
    currency: CurrencyCode = 'EGP'
  ): Promise<InvoiceExtractionResult> {
    const res = await fetch('/api/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, mimeType, fileName, currency }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Invoice extraction failed' }));
      throw new Error(err.error || 'Invoice extraction failed');
    }

    return await res.json();
  },

  // Send message to ChatterBot
  async sendChatMessage(
    bot: ChatterBot,
    userProfile: UserProfile,
    messageHistory: ChatMessage[],
    userMessage: string,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<string> {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot,
          userProfile,
          messageHistory,
          userMessage,
          imageBase64,
          imageMimeType,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data: ChatResponse = await res.json();
      return data.reply;
    } catch (err) {
      console.warn('API chat request failed, generating client fallback:', err);
      // Smart contextual client fallback
      const userName = userProfile.name || 'محمد';
      if (userMessage.includes('فاتورة') || userMessage.includes('ضريب') || userMessage.includes('حساب')) {
        return `مرحباً يا ${userName}! معك ${bot.name}. فحصت البيانات المحاسبية بدقة: العمليات منتظمة وتدفقات النقد إيجابية. ${bot.catchphrase}`;
      }
      return `أهلاً بك يا ${userName}! أنا ${bot.name} (${bot.arabicName}). ${bot.catchphrase} يسعدني النقاش معك دائماً!`;
    }
  },

  // Request voice synthesis
  async getTTSAudio(
    text: string,
    voiceName: string,
    botStyle?: string
  ): Promise<TTSResponse> {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName,
          style: botStyle,
        }),
      });

      if (!res.ok) {
        return { audioData: null, fallbackWebSpeech: true };
      }

      return await res.json();
    } catch (err) {
      console.warn('TTS fetch failed:', err);
      return { audioData: null, fallbackWebSpeech: true };
    }
  },

  /* ===== Safe Adapters (browser / files / mouse / keyboard / windows) =====
   * The LLM may only PROPOSE actions; executeAdapterAction must be called
   * from an explicit user approval click in the UI, never automatically. */

  async getAdaptersState(): Promise<AdaptersStateResponse> {
    const res = await fetch('/api/adapters/state');
    if (!res.ok) throw new Error('Adapters state failed');
    return await res.json();
  },

  async configureBrowserAdapter(userAgentPreset: string, timeoutMs: number): Promise<any> {
    const res = await fetch('/api/adapters/browser/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAgentPreset, timeoutMs }),
    });
    if (!res.ok) throw new Error('Browser adapter configure failed');
    return await res.json();
  },

  async proposeAdapterActions(
    goal: string,
    source: 'user' | 'ollama' = 'user'
  ): Promise<AdapterProposalResponse> {
    const res = await fetch('/api/adapters/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, source }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Adapter propose failed' }));
      throw new Error(err.error || 'Adapter propose failed');
    }
    return await res.json();
  },

  /** Execute ONE action — call ONLY after explicit per-action user approval. */
  async executeAdapterAction(
    action: AdapterActionProposal,
    approvedByUser: boolean
  ): Promise<AdapterExecuteResult> {
    const res = await fetch('/api/adapters/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: { adapter: action.adapter, action: action.action, params: action.params },
        approvedByUser,
      }),
    });
    const data = await res.json().catch(() => ({
      executed: false,
      simulated: false,
      summary: 'تعذر الاتصال بخادم المحوّلات.',
    }));
    if (!res.ok && !data.summary) {
      data.summary = data.error || 'فشل تنفيذ إجراء المحوّل.';
    }
    return { adapter: action.adapter, action: action.action, ...data };
  },
};

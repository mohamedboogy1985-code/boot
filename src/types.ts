export type VoiceId = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface ChatterBot {
  id: string;
  name: string;
  arabicName: string;
  title: string;
  avatar: string;
  color: 'emerald' | 'pink' | 'amber' | 'cyan' | 'indigo' | 'purple';
  voice: VoiceId;
  personality: string;
  speakingStyle: string;
  catchphrase: string;
  systemPrompt?: string;
  samplePrompts: string[];
  isCustom?: boolean;
}

export interface UserProfile {
  name: string;
  role: string;
  company: string;
  interests: string;
  context: string;
  language: 'ar' | 'en' | 'auto';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
  audioUrl?: string;
  audioDuration?: number;
}

export interface ConversationSession {
  id: string;
  title: string;
  botId: string;
  botName: string;
  botAvatar: string;
  userName: string;
  createdAt: number;
  updatedAt: number;
  durationSeconds: number;
  messages: ChatMessage[];
  accountingTag: string;
  notes: string;
  summary?: string;
  audioBlob?: Blob;
  financialAnalysis?: TranscriptFinancialAnalysis;
}

export interface FinancialItem {
  id: string;
  type: 'expense' | 'revenue';
  description: string;
  amount: number;
  currency: string;
  category: string;
  counterparty?: string;
  date?: string;
  isTaxDeductible?: boolean;
  deductionReason?: string;
}

export interface TaxDeductionInsight {
  title: string;
  potentialSavings: number;
  category: string;
  reasoning: string;
  complianceNote: string;
}

export interface TranscriptFinancialAnalysis {
  sessionId: string;
  analyzedAt: number;
  summary: string;
  totalExpenses: number;
  totalRevenue: number;
  netImpact: number;
  totalPotentialTaxSavings: number;
  expenses: FinancialItem[];
  revenues: FinancialItem[];
  taxDeductions: TaxDeductionInsight[];
  transactions: FinancialItem[];
  recommendations?: string[];
  /** true when produced by the local heuristic engine (no live Gemini analysis) */
  isSimulated?: boolean;
}

/* =====================================================
 * Merged from Bogy-Agants (NexusAI) — Multi-Agent Orchestrator
 * ===================================================== */

export interface OrchestratorTask {
  agentId: 'adam' | 'amira' | 'paul' | 'charlotte' | 'shane' | 'penny' | 'windows' | 'web' | 'analysis';
  taskTitle: string;
  instruction: string;
  expectedArtifact: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface OrchestrationResult {
  planSummary: string;
  speechResponse: string;
  delegatedTasks: OrchestratorTask[];
  simulated?: boolean;
  createdAt: number;
}

/* =====================================================
 * Real system diagnostics (systeminformation)
 * ===================================================== */

export interface RealDiagnosticsProcess {
  pid: number;
  name: string;
  cpu: number;
  ramMb: number;
  status: string;
}

export interface RealDiagnostics {
  cpu: {
    manufacturer: string;
    brand: string;
    speed: number;
    cores: number;
    loadPercent: number;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    usedPercent: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    arch: string;
    hostname: string;
    uptimeHours: number;
  };
  storage: {
    fs: string;
    sizeGb: number;
    usedGb: number;
    usePercent: number;
    mount: string;
  }[];
  processes: RealDiagnosticsProcess[];
  timestamp: string;
  simulated?: boolean;
}

/* =====================================================
 * Ollama local AI bridge (offline-first)
 * ===================================================== */

export interface OllamaModelInfo {
  name: string;
  displayName: string;
  size: string;
  family: string;
  recommended: boolean;
}

export interface OllamaStatus {
  isConnected: boolean;
  host: string;
  message?: string;
  models: OllamaModelInfo[];
  engine?: string;
}

export interface OllamaToolResult {
  tool: string;
  executed: boolean;
  summary: string;
  detail?: string;
  explanation: string;
}

/* =====================================================
 * Security guardrails & audit log
 * ===================================================== */

export interface AuditLogItem {
  id: string;
  timestamp: number;
  category: 'web' | 'windows_script' | 'agent' | 'ollama' | 'system';
  action: string;
  target: string;
  riskLevel: 'low' | 'medium' | 'blocked';
  status: 'allowed' | 'blocked';
  reason: string;
}

export interface AccountingInvoice {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  date: string;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  vatAmount: number;
  category: string;
}

export type ChimeToneId = 'studio' | 'modern' | 'accounting' | 'gentle' | 'retro' | 'none';

export interface SoundAlertSettings {
  toneId: ChimeToneId;
  enableStartAlert: boolean;
  enableEndAlert: boolean;
  volume: number;
}

export type DeepActionCategory = 'web' | 'windows' | 'apps' | 'accounting';

export interface WindowsAutomationScript {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'apps' | 'accounting' | 'backup' | 'network';
  shell: 'powershell' | 'batch' | 'bash';
  code: string;
  authorAgent: string;
}

export interface WebScrapeResult {
  url: string;
  title: string;
  description?: string;
  h1?: string[];
  paragraphs?: string[];
  linksCount: number;
  extractedText: string;
  status: number;
  latencyMs: number;
}

export interface AgentExecutionLog {
  id: string;
  timestamp: number;
  botId: string;
  botName: string;
  actionType: 'web_scrape' | 'web_search' | 'windows_script' | 'app_launch' | 'financial_audit';
  target: string;
  status: 'success' | 'warning' | 'error';
  summary: string;
  outputPreview?: string;
  details?: any;
}

/* ===== Multi-currency (Egypt-first) ===== */
export type CurrencyCode = 'EGP' | 'USD' | 'SAR';

/* ===== Safe Adapters (human-approved, LLM proposes only) ===== */
export type AdapterName = 'mouse' | 'keyboard' | 'browser' | 'filesystem' | 'windows' | 'system';

export interface AdapterActionProposal {
  id: string;
  adapter: AdapterName;
  action: string;
  params: Record<string, any>;
  rationale: string;
  riskLevel: 'low' | 'medium';
  status: 'awaiting-approval' | 'executing' | 'done' | 'rejected';
}

export interface AdapterProposalResponse {
  proposalId: string;
  goal: string;
  engine: string;
  simulated: boolean;
  requiresUserApprovalForEveryAction: boolean;
  note: string;
  actions: AdapterActionProposal[];
}

export interface AdapterStateInfo {
  id: AdapterName;
  nameAr: string;
  mode: 'enabled' | 'dry-run';
  requiresApproval: boolean;
  capabilities: string[];
  notes: string;
}

export interface AdaptersStateResponse {
  shellExecutionEnabled: boolean;
  desktopAdaptersEnabled: boolean;
  loopbackOnlyForDesktopInput: boolean;
  sandboxDirName: string;
  browserConfig: { userAgentPreset: string; timeoutMs: number; userAgent: string };
  adapters: AdapterStateInfo[];
}

export interface AdapterExecuteResult {
  adapter: string;
  action: string;
  executed: boolean;
  simulated: boolean;
  summary: string;
  detail?: string;
}

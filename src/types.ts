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

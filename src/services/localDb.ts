import { ConversationSession, ChatMessage, TranscriptFinancialAnalysis } from '../types';

const DB_NAME = 'ChatterBotsRemixLocalDB';
const DB_VERSION = 2;
const STORE_CONVERSATIONS = 'conversations';
const STORE_RECORDINGS = 'recordings';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        const convStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        convStore.createIndex('createdAt', 'createdAt', { unique: false });
        convStore.createIndex('botId', 'botId', { unique: false });
        convStore.createIndex('accountingTag', 'accountingTag', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const LocalDB = {
  // Save or update a conversation session
  async saveSession(session: ConversationSession, audioBlob?: Blob): Promise<string> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS, STORE_RECORDINGS], 'readwrite');
      const convStore = tx.objectStore(STORE_CONVERSATIONS);
      const recStore = tx.objectStore(STORE_RECORDINGS);

      // Clean session for serialization (omit raw blob from JSON if stored in recordings store)
      const sessionToStore = {
        ...session,
        updatedAt: Date.now(),
        hasAudio: Boolean(audioBlob || session.audioBlob),
      };
      delete (sessionToStore as any).audioBlob;

      convStore.put(sessionToStore);

      if (audioBlob) {
        recStore.put({
          id: session.id,
          audioBlob: audioBlob,
          size: audioBlob.size,
          type: audioBlob.type,
          updatedAt: Date.now(),
        });
      }

      tx.oncomplete = () => resolve(session.id);
      tx.onerror = () => reject(tx.error);
    });
  },

  // Get all conversation sessions sorted newest first
  async getAllSessions(): Promise<ConversationSession[]> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS], 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.getAll();

      request.onsuccess = async () => {
        let sessions = (request.result || []) as ConversationSession[];
        if (sessions.length === 0) {
          // Auto-seed with realistic financial sessions
          try {
            await LocalDB.seedInitialFinancialSessions();
            const recheckTx = db.transaction([STORE_CONVERSATIONS], 'readonly');
            const recheckStore = recheckTx.objectStore(STORE_CONVERSATIONS);
            const recheckReq = recheckStore.getAll();
            recheckReq.onsuccess = () => {
              const seeded = (recheckReq.result || []) as ConversationSession[];
              seeded.sort((a, b) => b.createdAt - a.createdAt);
              resolve(seeded);
            };
            recheckReq.onerror = () => resolve([]);
            return;
          } catch (seedErr) {
            console.warn('Could not auto-seed sessions:', seedErr);
          }
        }
        sessions.sort((a, b) => b.createdAt - a.createdAt);
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Seed initial realistic sessions with financial analysis
  async seedInitialFinancialSessions(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS], 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);

      const now = Date.now();
      const session1: ConversationSession = {
        id: 'session-demo-1',
        botId: 'bot-adam',
        botName: 'Accountant Adam',
        botAvatar: '💼',
        userName: 'المدير المالي',
        createdAt: now - 1000 * 60 * 60 * 24 * 2,
        updatedAt: now - 1000 * 60 * 60 * 24 * 2,
        durationSeconds: 195,
        title: 'جلسة تدقيق الربع الرابع والمصاريف التشغيلية',
        accountingTag: 'ميزانية وتشغيل',
        notes: 'مراجعة عقود السحابة والخدمات اللوجستية وتوزيع إيرادات العقود',
        summary: 'تم حصر مصاريف البنية السحابية والتسويق الرقمي وتأكيد إيرادات عقود التطوير مع وفر ضريبي مستحق.',
        messages: [
          {
            id: 'msg-1',
            sender: 'user',
            text: 'مرحباً آدم، قمنا هذا الأسبوع بدفع 8400 ريال لخوادم AWS وقواعد البيانات، ودفعنا 3200 ريال لاشتراكات البرمجيات المحاسبية، و6500 ريال لحملة التسويق الرقمي.',
            timestamp: now - 1000 * 60 * 60 * 24 * 2,
          },
          {
            id: 'msg-2',
            sender: 'bot',
            text: 'ممتاز، قيدت هذه المصروفات بإجمالي 18,100 ر.س. هل تم تحصيل إيرادات عقود البرمجيات أو الاستشارات المقررة؟',
            timestamp: now - 1000 * 60 * 60 * 24 * 2 + 15000,
          },
          {
            id: 'msg-3',
            sender: 'user',
            text: 'نعم، تم استلام دفعة عقد تطوير برمجيات سحابية بمبلغ 35000 ريال، وتحصيل أتعاب استشارات شهرية بمبلغ 18500 ريال وترخيص منصة الفوترة بمبلغ 12000 ريال.',
            timestamp: now - 1000 * 60 * 60 * 24 * 2 + 35000,
          },
          {
            id: 'msg-4',
            sender: 'bot',
            text: 'إيرادات قوية بإجمالي 65,500 ر.س! كما أن فواتير الخوادم وتراخيص البرامج مؤهلة لخصم ضريبة المدخلات وفق هيئة الزكاة والضريبة والجمارك ZATCA.',
            timestamp: now - 1000 * 60 * 60 * 24 * 2 + 55000,
          }
        ],
        financialAnalysis: {
          sessionId: 'session-demo-1',
          analyzedAt: now - 1000 * 60 * 60 * 24 * 2,
          summary: 'تحليل مالي متوازن يُظهر تدفقات نقدية موجبة قوية بإجمالي إيرادات 65,500 ر.س ومصروفات تشغيلية 18,100 ر.س، مع وفر ضريبي مؤهل بقيمة 2,580 ر.س.',
          totalExpenses: 18100,
          totalRevenue: 65500,
          netImpact: 47400,
          totalPotentialTaxSavings: 2580,
          expenses: [
            {
              id: 'exp-1',
              type: 'expense',
              description: 'اشتراكات سحابية وخوادم AWS Cloud',
              amount: 8400,
              currency: 'SAR',
              category: 'بنية سحابية وخوادم',
              counterparty: 'Amazon Web Services',
              isTaxDeductible: true,
              deductionReason: 'مدخلات تشغيل تقني مؤهلة لخصم ضريبة القيمة المضافة 15%'
            },
            {
              id: 'exp-2',
              type: 'expense',
              description: 'تراخيص برمجيات وأنظمة محاسبية',
              amount: 3200,
              currency: 'SAR',
              category: 'تراخيص برمجيات',
              counterparty: 'SaaS Software Hub',
              isTaxDeductible: true,
              deductionReason: 'نفقات تقنية تشغيلية'
            },
            {
              id: 'exp-3',
              type: 'expense',
              description: 'حملة إعلانية وتسويق رقمي',
              amount: 6500,
              currency: 'SAR',
              category: 'تسويق وإعلان',
              counterparty: 'منصات الإعلانات',
              isTaxDeductible: false
            }
          ],
          revenues: [
            {
              id: 'rev-1',
              type: 'revenue',
              description: 'دفعة عقد تطوير برمجيات سحابية',
              amount: 35000,
              currency: 'SAR',
              category: 'تطوير برمجيات وحلول',
              counterparty: 'شركة الأفق الرقمي'
            },
            {
              id: 'rev-2',
              type: 'revenue',
              description: 'أتعاب استشارات مالية وإدارية شهرية',
              amount: 18500,
              currency: 'SAR',
              category: 'استشارات مالية',
              counterparty: 'مجموعة الرياض'
            },
            {
              id: 'rev-3',
              type: 'revenue',
              description: 'ترخيص استخدام منصة الفوترة السنوية',
              amount: 12000,
              currency: 'SAR',
              category: 'تراخيص واشتراكات',
              counterparty: 'مؤسسة البناء الحديث'
            }
          ],
          taxDeductions: [
            {
              title: 'استرداد ضريبة القيمة المضافة للمدخلات السحابية',
              potentialSavings: 1740,
              category: 'بنية سحابية',
              reasoning: 'فواتير الاستضافة والحوسبة السحابية معفاة جزئياً ومؤهلة لاسترداد ضريبة المدخلات بنسبة 15%.',
              complianceNote: 'متوافقة مع اشتراطات الفوترة الإلكترونية ZATCA المرحلة الثانية'
            },
            {
              title: 'إهلاك نفقات التراخيص البرمجية',
              potentialSavings: 840,
              category: 'تراخيص برمجيات',
              reasoning: 'خصم تكاليف اشتراكات البرامج المحاسبية المتخصصة كأعباء عمل مباشرة.',
              complianceNote: 'نفقات تشغيلية مسجلة في السجل التجاري'
            }
          ],
          transactions: [
            { id: 'tx-1', type: 'revenue', description: 'دفعة عقد تطوير برمجيات', amount: 35000, currency: 'SAR', category: 'تطوير برمجيات' },
            { id: 'tx-2', type: 'revenue', description: 'أتعاب استشارات إدارية', amount: 18500, currency: 'SAR', category: 'استشارات' },
            { id: 'tx-3', type: 'revenue', description: 'ترخيص منصة الفوترة', amount: 12000, currency: 'SAR', category: 'تراخيص' },
            { id: 'tx-4', type: 'expense', description: 'خوادم AWS Cloud', amount: 8400, currency: 'SAR', category: 'بنية سحابية' },
            { id: 'tx-5', type: 'expense', description: 'تسويق رقمي', amount: 6500, currency: 'SAR', category: 'تسويق' },
            { id: 'tx-6', type: 'expense', description: 'تراخيص برمجيات', amount: 3200, currency: 'SAR', category: 'تراخيص' }
          ],
          recommendations: [
            'توثيق الرقم الضريبي لمزود الخدمة السحابية لضمان قبول خصم ضريبة المدخلات 15% لدى ZATCA.',
            'إعادة توجيه جزء من الفائض النقدي الإيجابي (+47,400 ر.س) لتعزيز صندوق الطوارئ التشغيلي.'
          ]
        }
      };

      const session2: ConversationSession = {
        id: 'session-demo-2',
        botId: 'bot-penny',
        botName: 'Passport Penny',
        botAvatar: '✈️',
        userName: 'المدير المالي',
        createdAt: now - 1000 * 60 * 60 * 24 * 5,
        updatedAt: now - 1000 * 60 * 60 * 24 * 5,
        durationSeconds: 240,
        title: 'استشارات التوريد والتجارة الدولية والرسوم الجمركية',
        accountingTag: 'تجارة دولية وجمارك',
        notes: 'تحليل مصاريف استيراد المعدات وأتعاب التوسع الخارجي',
        summary: 'تدقيق نفقات الشحن الدولي والرسوم الجمركية وأتعاب تصدير التراخيص البرمجية.',
        messages: [
          {
            id: 'msg-p1',
            sender: 'user',
            text: 'مرحباً بيني، بلغت تكاليف التخليص الجمركي للشحنة 14200 ريال، ورسوم بوابات الدفع الدولية 2800 ريال وتأمين الشحن 1900 ريال.',
            timestamp: now - 1000 * 60 * 60 * 24 * 5,
          },
          {
            id: 'msg-p2',
            sender: 'bot',
            text: 'تم رصد تكاليف الشحن والجمارك بإجمالي 18,900 ر.س. وماذا عن عوائد الاستشارات الخارجية؟',
            timestamp: now - 1000 * 60 * 60 * 24 * 5 + 12000,
          },
          {
            id: 'msg-p3',
            sender: 'user',
            text: 'حصلنا أتعاب استشارات أعمال دولية بمبلغ 28000 ريال، ومبيعات تراخيص برامج خارجية بمبلغ 22500 ريال.',
            timestamp: now - 1000 * 60 * 60 * 24 * 5 + 30000,
          }
        ],
        financialAnalysis: {
          sessionId: 'session-demo-2',
          analyzedAt: now - 1000 * 60 * 60 * 24 * 5,
          summary: 'تحليل صفقات التجارة والتوريد: إجمالي إيرادات 50,500 ر.س مقابل مصاريف شحن وجمارك 18,900 ر.س، وصافي فائض +31,600 ر.س.',
          totalExpenses: 18900,
          totalRevenue: 50500,
          netImpact: 31600,
          totalPotentialTaxSavings: 2130,
          expenses: [
            {
              id: 'exp-p1',
              type: 'expense',
              description: 'رسوم تخليص جمركي وشحن دولي',
              amount: 14200,
              currency: 'SAR',
              category: 'جمارك ولوجستيات',
              counterparty: 'مكتب التخليص الجمركي',
              isTaxDeductible: true,
              deductionReason: 'بيان جمركي نظامي مع ضريبة مدفوعة عند المنفذ'
            },
            {
              id: 'exp-p2',
              type: 'expense',
              description: 'عمولات بوابات الدفع الإلكتروني الدولية',
              amount: 2800,
              currency: 'SAR',
              category: 'رسوم بنكية ومعاملات',
              counterparty: 'International Payment Gateway'
            },
            {
              id: 'exp-p3',
              type: 'expense',
              description: 'تأمين بضائع وشحنات جوية',
              amount: 1900,
              currency: 'SAR',
              category: 'تأمين تجاري',
              counterparty: 'شركة التأمين التعاوني'
            }
          ],
          revenues: [
            {
              id: 'rev-p1',
              type: 'revenue',
              description: 'أتعاب استشارات أعمال وتوسع دولي',
              amount: 28000,
              currency: 'SAR',
              category: 'استشارات دولية',
              counterparty: 'مجموعة الخليج الاستثمارية'
            },
            {
              id: 'rev-p2',
              type: 'revenue',
              description: 'مبيعات تراخيص برمجيات عبر الحدود',
              amount: 22500,
              currency: 'SAR',
              category: 'مبيعات برمجيات',
              counterparty: 'عملاء الإقليم'
            }
          ],
          taxDeductions: [
            {
              title: 'استرداد ضريبة القيمة المضافة الجمركية المدفوعة',
              potentialSavings: 2130,
              category: 'جمارك واستيراد',
              reasoning: 'الضريبة المسددة بموجب البيان الجمركي تخص أغراض النشاط الخاضع للضريبة.',
              complianceNote: 'إرفاق نسخة البيان الجمركي مع الإقرار الفصلي'
            }
          ],
          transactions: [
            { id: 'tx-p1', type: 'revenue', description: 'استشارات أعمال وتوسع', amount: 28000, currency: 'SAR', category: 'استشارات' },
            { id: 'tx-p2', type: 'revenue', description: 'تراخيص برمجيات عبر الحدود', amount: 22500, currency: 'SAR', category: 'مبيعات' },
            { id: 'tx-p3', type: 'expense', description: 'تخليص جمركي وشحن', amount: 14200, currency: 'SAR', category: 'جمارك' },
            { id: 'tx-p4', type: 'expense', description: 'عمولات دفع دولية', amount: 2800, currency: 'SAR', category: 'رسوم' },
            { id: 'tx-p5', type: 'expense', description: 'تأمين شحنات', amount: 1900, currency: 'SAR', category: 'تأمين' }
          ],
          recommendations: [
            'أرشفة البيانات الجمركية المسددة إلكترونياً لتقديمها عند فحص إقرار ضريبة القيمة المضافة.',
            'التفاوض مع مزودي بوابات الدفع لتخفيض عمولات التحويل الدولية للشريحة الأعلى.'
          ]
        }
      };

      store.put(session1);
      store.put(session2);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Get a single session by id
  async getSession(id: string): Promise<ConversationSession | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS], 'readonly');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  // Get audio blob for a session
  async getAudioBlob(sessionId: string): Promise<Blob | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECORDINGS], 'readonly');
      const store = tx.objectStore(STORE_RECORDINGS);
      const request = store.get(sessionId);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record?.audioBlob || null);
      };
      request.onerror = () => reject(request.error);
    });
  },

  // Update notes or accounting tags for an existing session
  async updateSessionNotes(id: string, notes: string, accountingTag: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS], 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result;
        if (!record) return reject(new Error('Session not found'));
        record.notes = notes;
        record.accountingTag = accountingTag;
        record.updatedAt = Date.now();
        store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Delete a session and its audio
  async deleteSession(id: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS, STORE_RECORDINGS], 'readwrite');
      tx.objectStore(STORE_CONVERSATIONS).delete(id);
      tx.objectStore(STORE_RECORDINGS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Delete all sessions
  async clearAll(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CONVERSATIONS, STORE_RECORDINGS], 'readwrite');
      tx.objectStore(STORE_CONVERSATIONS).clear();
      tx.objectStore(STORE_RECORDINGS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // Export a conversation to formatted text for accounting logs
  exportSessionToText(session: ConversationSession): string {
    const dateStr = new Date(session.createdAt).toLocaleString('ar-SA');
    let output = `====================================================\n`;
    output += `تقرير محادثة صوتية - ChatterBots Remix\n`;
    output += `====================================================\n`;
    output += `المعرف: ${session.id}\n`;
    output += `التاريخ: ${dateStr}\n`;
    output += `الوكيل الذكي: ${session.botName}\n`;
    output += `المستخدم: ${session.userName}\n`;
    output += `التصنيف المحاسبي: ${session.accountingTag || 'عام'}\n`;
    output += `المدة: ${session.durationSeconds || 0} ثانية\n`;
    if (session.notes) {
      output += `ملاحظات محاسبية: ${session.notes}\n`;
    }
    output += `----------------------------------------------------\n`;
    output += `سجل الحوار:\n`;
    output += `----------------------------------------------------\n\n`;

    session.messages.forEach((msg, idx) => {
      const senderLabel = msg.sender === 'user' ? session.userName : session.botName;
      const time = new Date(msg.timestamp).toLocaleTimeString('ar-SA');
      output += `[${time}] ${senderLabel}:\n${msg.text}\n\n`;
    });

    output += `====================================================\n`;
    output += `تم التوليد والحفظ محلياً بواسطة ChatterBots Remix\n`;
    return output;
  },

  // Helper to escape string for CSV
  escapeCsvValue(val: any): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  },

  // Export single session to CSV format
  exportSessionToCsv(session: ConversationSession): string {
    const BOM = '\uFEFF'; // UTF-8 BOM for proper Arabic encoding in Excel
    const headers = [
      'معرف المحادثة (Session ID)',
      'عنوان المحادثة (Title)',
      'تاريخ الإنشاء (Created Date)',
      'الوكيل الذكي (Bot Name)',
      'اسم المستخدم (User Name)',
      'التصنيف المحاسبي (Accounting Tag)',
      'المدة بالثواني (Duration Sec)',
      'رقم الرسالة (Msg #)',
      'المرسل (Sender)',
      'وقت الرسالة (Message Time)',
      'نص الرسالة (Message Text)',
      'الملاحظات المحاسبية (Notes)'
    ].map(this.escapeCsvValue).join(',');

    const dateStr = new Date(session.createdAt).toLocaleString('ar-SA');
    const rows: string[] = [headers];

    if (session.messages && session.messages.length > 0) {
      session.messages.forEach((msg, idx) => {
        const msgTime = new Date(msg.timestamp).toLocaleString('ar-SA');
        const senderName = msg.sender === 'user' ? session.userName : session.botName;
        const row = [
          session.id,
          session.title,
          dateStr,
          session.botName,
          session.userName,
          session.accountingTag || 'عام',
          session.durationSeconds || 0,
          idx + 1,
          senderName,
          msgTime,
          msg.text,
          session.notes || ''
        ].map(this.escapeCsvValue).join(',');
        rows.push(row);
      });
    } else {
      // Empty conversation row
      const row = [
        session.id,
        session.title,
        dateStr,
        session.botName,
        session.userName,
        session.accountingTag || 'عام',
        session.durationSeconds || 0,
        0,
        '',
        '',
        '',
        session.notes || ''
      ].map(this.escapeCsvValue).join(',');
      rows.push(row);
    }

    return BOM + rows.join('\r\n');
  },

  // Export all sessions to a single unified CSV
  exportAllSessionsToCsv(sessions: ConversationSession[]): string {
    const BOM = '\uFEFF'; // UTF-8 BOM for Arabic in Excel
    const headers = [
      'معرف المحادثة (Session ID)',
      'عنوان المحادثة (Title)',
      'تاريخ الإنشاء (Created Date)',
      'الوكيل الذكي (Bot Name)',
      'اسم المستخدم (User Name)',
      'التصنيف المحاسبي (Accounting Tag)',
      'المدة بالثواني (Duration Sec)',
      'رقم الرسالة (Msg #)',
      'المرسل (Sender)',
      'وقت الرسالة (Message Time)',
      'نص الرسالة (Message Text)',
      'الملاحظات المحاسبية (Notes)'
    ].map(this.escapeCsvValue).join(',');

    const rows: string[] = [headers];

    sessions.forEach((session) => {
      const dateStr = new Date(session.createdAt).toLocaleString('ar-SA');
      if (session.messages && session.messages.length > 0) {
        session.messages.forEach((msg, idx) => {
          const msgTime = new Date(msg.timestamp).toLocaleString('ar-SA');
          const senderName = msg.sender === 'user' ? session.userName : session.botName;
          const row = [
            session.id,
            session.title,
            dateStr,
            session.botName,
            session.userName,
            session.accountingTag || 'عام',
            session.durationSeconds || 0,
            idx + 1,
            senderName,
            msgTime,
            msg.text,
            session.notes || ''
          ].map(this.escapeCsvValue).join(',');
          rows.push(row);
        });
      } else {
        const row = [
          session.id,
          session.title,
          dateStr,
          session.botName,
          session.userName,
          session.accountingTag || 'عام',
          session.durationSeconds || 0,
          0,
          '',
          '',
          '',
          session.notes || ''
        ].map(this.escapeCsvValue).join(',');
        rows.push(row);
      }
    });

    return BOM + rows.join('\r\n');
  },

  // Helper trigger file download using Blob URL
  triggerDownload(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = filename;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Export single session to JSON file download
  downloadSessionAsJson(session: ConversationSession) {
    const jsonStr = JSON.stringify(session, null, 2);
    this.triggerDownload(
      jsonStr,
      `chatterbot-${session.botName}-${session.id}.json`,
      'application/json;charset=utf-8'
    );
  },

  // Export all sessions to a single JSON file download
  downloadAllSessionsAsJson(sessions: ConversationSession[]) {
    const jsonStr = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalSessions: sessions.length,
        system: 'ChatterBots Remix Local Database',
        sessions: sessions,
      },
      null,
      2
    );
    const dateTag = new Date().toISOString().slice(0, 10);
    this.triggerDownload(
      jsonStr,
      `chatterbots-all-conversations-${dateTag}.json`,
      'application/json;charset=utf-8'
    );
  },

  // Export single session as CSV download
  downloadSessionAsCsv(session: ConversationSession) {
    const csvContent = this.exportSessionToCsv(session);
    this.triggerDownload(
      csvContent,
      `chatterbot-${session.botName}-${session.id}.csv`,
      'text/csv;charset=utf-8;'
    );
  },

  // Export all sessions as CSV download
  downloadAllSessionsAsCsv(sessions: ConversationSession[]) {
    const csvContent = this.exportAllSessionsToCsv(sessions);
    const dateTag = new Date().toISOString().slice(0, 10);
    this.triggerDownload(
      csvContent,
      `chatterbots-all-conversations-${dateTag}.csv`,
      'text/csv;charset=utf-8;'
    );
  },

  // Export session as TXT download
  downloadSessionAsTxt(session: ConversationSession) {
    const text = this.exportSessionToText(session);
    this.triggerDownload(
      text,
      `chatterbot-report-${session.id}.txt`,
      'text/plain;charset=utf-8'
    );
  },

  // Save financial analysis to an existing session
  async saveFinancialAnalysis(sessionId: string, analysis: TranscriptFinancialAnalysis): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    session.financialAnalysis = analysis;
    await this.saveSession(session);
  },

  // Download financial analysis as CSV
  downloadFinancialAnalysisAsCsv(analysis: TranscriptFinancialAnalysis, title: string) {
    const rows: string[] = [];
    rows.push('\uFEFF'); // UTF-8 BOM for Excel
    rows.push(`تقرير التدقيق والتحليل المالي للمحادثة - ${title}`);
    rows.push(`تاريخ التحليل: ${new Date(analysis.analyzedAt).toLocaleString('ar-SA')}`);
    rows.push(`إجمالي المصروفات: ${analysis.totalExpenses} ر.س`);
    rows.push(`إجمالي الإيرادات: ${analysis.totalRevenue} ر.س`);
    rows.push(`صافي الأثر النقدي: ${analysis.netImpact} ر.س`);
    rows.push(`وفورات ضريبية مقدرة: ${analysis.totalPotentialTaxSavings} ر.س`);
    rows.push('');
    rows.push('--- سجل الحركات والبنود المستخرجة ---');
    rows.push('النوع,البيان,المبلغ (ر.س),التصنيف,الجهة المقابلة,التاريخ,خاضع للخصم الضريبي');

    for (const item of analysis.transactions || []) {
      const typeStr = item.type === 'expense' ? 'مصروف' : 'إيراد';
      const deductible = item.isTaxDeductible ? 'نعم' : 'لا';
      rows.push(`"${typeStr}","${item.description}","${item.amount}","${item.category}","${item.counterparty || ''}","${item.date || ''}","${deductible}"`);
    }

    rows.push('');
    rows.push('--- فرص ووفورات الاستقطاع الضريبي (ZATCA / VAT) ---');
    rows.push('بند الاستقطاع,الوفر التقديري (ر.س),التصنيف,التبرير النظامي');
    for (const tax of analysis.taxDeductions || []) {
      rows.push(`"${tax.title}","${tax.potentialSavings}","${tax.category}","${tax.reasoning}"`);
    }

    this.triggerDownload(
      rows.join('\r\n'),
      `financial-audit-${analysis.sessionId}.csv`,
      'text/csv;charset=utf-8;'
    );
  },

  // Download financial analysis as structured JSON
  downloadFinancialAnalysisAsJson(analysis: TranscriptFinancialAnalysis, title: string) {
    const payload = JSON.stringify(
      {
        reportTitle: `Financial Insights Audit - ${title}`,
        generatedAt: new Date(analysis.analyzedAt).toISOString(),
        system: 'ChatterBots Remix AI Accounting Intelligence',
        analysis,
      },
      null,
      2
    );
    this.triggerDownload(
      payload,
      `financial-audit-${analysis.sessionId}.json`,
      'application/json;charset=utf-8'
    );
  }
};

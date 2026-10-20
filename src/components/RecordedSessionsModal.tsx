import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  Search, 
  Trash2, 
  Download, 
  FileText, 
  Clock, 
  User, 
  Volume2, 
  Play, 
  Square, 
  Edit3, 
  Check, 
  Tag, 
  RefreshCw,
  FolderOpen,
  FileSpreadsheet,
  FileCode
} from 'lucide-react';
import { ConversationSession } from '../types';
import { LocalDB } from '../services/localDb';

interface RecordedSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionDeleted: () => void;
}

export const RecordedSessionsModal: React.FC<RecordedSessionsModalProps> = ({
  isOpen,
  onClose,
  onSessionDeleted,
}) => {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<ConversationSession | null>(null);
  const [activeAudioBlobUrl, setActiveAudioBlobUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editNotes, setEditNotes] = useState('');
  const [editTag, setEditTag] = useState('');
  const [isEditingMeta, setIsEditingMeta] = useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Load all sessions from IndexedDB
  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const records = await LocalDB.getAllSessions();
      setSessions(records);
      if (records.length > 0 && !selectedSession) {
        setSelectedSession(records[0]);
        setEditNotes(records[0].notes || '');
        setEditTag(records[0].accountingTag || 'عام');
      }
    } catch (err) {
      console.error('Error loading sessions from IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  // Load audio blob when session is selected
  useEffect(() => {
    if (!selectedSession) {
      setActiveAudioBlobUrl(null);
      return;
    }

    setEditNotes(selectedSession.notes || '');
    setEditTag(selectedSession.accountingTag || 'عام');

    let isSubscribed = true;
    LocalDB.getAudioBlob(selectedSession.id).then((blob) => {
      if (!isSubscribed) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        setActiveAudioBlobUrl(url);
      } else {
        setActiveAudioBlobUrl(null);
      }
    });

    return () => {
      isSubscribed = false;
      if (activeAudioBlobUrl) {
        URL.revokeObjectURL(activeAudioBlobUrl);
      }
    };
  }, [selectedSession?.id]);

  if (!isOpen) return null;

  // Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.botName.toLowerCase().includes(q) ||
      (s.accountingTag && s.accountingTag.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q)) ||
      s.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  });

  // Delete session
  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('هل أنت متأكد من حذف هذه المحادثة من قاعدة البيانات المحلية؟')) return;
    try {
      await LocalDB.deleteSession(id);
      const updated = sessions.filter((s) => s.id !== id);
      setSessions(updated);
      if (selectedSession?.id === id) {
        setSelectedSession(updated.length > 0 ? updated[0] : null);
      }
      onSessionDeleted();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  // Clear all sessions
  const handleClearAll = async () => {
    if (!confirm('تحذير: سيتم مسح كافة المحادثات والتسجيلات المحفوظة محلياً. هل تريد المتابعة؟')) return;
    try {
      await LocalDB.clearAll();
      setSessions([]);
      setSelectedSession(null);
      onSessionDeleted();
    } catch (err) {
      console.error('Failed to clear sessions:', err);
    }
  };

  // Save edited notes & tag
  const handleSaveNotes = async () => {
    if (!selectedSession) return;
    try {
      await LocalDB.updateSessionNotes(selectedSession.id, editNotes, editTag);
      setSelectedSession({
        ...selectedSession,
        notes: editNotes,
        accountingTag: editTag,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === selectedSession.id
            ? { ...s, notes: editNotes, accountingTag: editTag }
            : s
        )
      );
      setIsEditingMeta(false);
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  };

  // Audio playback toggle
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        
        {/* Top Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  المحادثات المسجلة في قاعدة البيانات المحلية (IndexedDB)
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  {sessions.length} جلسة
                </span>
              </div>
              <p className="text-xs text-slate-400">
                تسجيلات وحوارات صوتية مخزنة محلياً بالكامل على متصفحك مع ميزة الاستماع والتصدير
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sessions.length > 0 && (
              <>
                <button
                  onClick={() => LocalDB.downloadAllSessionsAsCsv(sessions)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                  title="تصدير كافة المحادثات المسجلة إلى ملف جدول إكسل CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">تصدير الكل CSV</span>
                </button>

                <button
                  onClick={() => LocalDB.downloadAllSessionsAsJson(sessions)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                  title="تصدير كافة المحادثات كنسخة احتياطية JSON"
                >
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">تصدير الكل JSON</span>
                </button>

                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-500/20 transition-all flex items-center gap-1.5"
                  title="مسح كافة المحادثات"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">مسح الكل</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Two columns (List on Left, Details on Right) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Sidebar: Sessions List */}
          <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-l border-slate-800 flex flex-col bg-slate-950/50">
            {/* Search Bar */}
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالنص، الوكيل، أو التصنيف..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تحميل السجلات من قاعدة البيانات...</span>
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <span>لا توجد محادثات محفوظة حتى الآن.</span>
                  <p className="mt-1 text-[11px] text-slate-600">
                    ابدأ محادثة صوتية واضغط على "حفظ المحادثة".
                  </p>
                </div>
              ) : (
                filteredSessions.map((session) => {
                  const isSelected = selectedSession?.id === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className={`p-3 rounded-2xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                          : 'bg-slate-900/80 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{session.botAvatar}</span>
                          <div>
                            <h4 className="font-bold text-xs text-white line-clamp-1">
                              {session.botName}
                            </h4>
                            <span className="text-[10px] text-slate-400">
                              {new Date(session.createdAt).toLocaleDateString('ar-SA')} • {new Date(session.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleDelete(session.id, e)}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/60">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                          {session.accountingTag || 'مراجعة عامة'}
                        </span>
                        <span className="font-mono">
                          {session.messages?.length || 0} رسائل • {session.durationSeconds || 0}ث
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Main Area: Selected Session Details & Transcript */}
          {selectedSession ? (
            <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
              
              {/* Session Meta Header */}
              <div className="p-4 sm:p-5 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shadow-inner">
                    {selectedSession.botAvatar}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-white">
                      {selectedSession.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 text-amber-400" />
                        {selectedSession.userName}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        المدة: {selectedSession.durationSeconds || 0} ثانية
                      </span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                        {selectedSession.accountingTag || 'عام'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Export Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => LocalDB.downloadSessionAsCsv(selectedSession)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all shadow-sm"
                    title="تصدير هذه المحادثة كملف CSV لجداول الحسابات والإكسل"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تصدير CSV</span>
                  </button>

                  <button
                    onClick={() => LocalDB.downloadSessionAsJson(selectedSession)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-all shadow-sm"
                    title="تنزيل بتنسيق JSON"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                    <span>تصدير JSON</span>
                  </button>

                  <button
                    onClick={() => LocalDB.downloadSessionAsTxt(selectedSession)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all shadow-sm"
                    title="تنزيل كملف نصي لتقارير الحسابات"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-300" />
                    <span>تقرير TXT</span>
                  </button>
                </div>
              </div>

              {/* Audio Playback Bar if audio recording exists */}
              {activeAudioBlobUrl && (
                <div className="px-5 py-3 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={togglePlayAudio}
                      className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md transition-all"
                    >
                      {isPlayingAudio ? (
                        <Square className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-200">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>التسجيل الصوتي للجلسة المحفوظ محلياً</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        يمكنك إعادة الاستماع للصوت المسجل في أي وقت
                      </span>
                    </div>
                  </div>

                  <audio
                    ref={audioRef}
                    src={activeAudioBlobUrl}
                    onEnded={() => setIsPlayingAudio(false)}
                    controls
                    className="h-8 max-w-[240px] sm:max-w-xs"
                  />
                </div>
              )}

              {/* Notes and Accounting Tag editing bar */}
              <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                {isEditingMeta ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      placeholder="التصنيف المحاسبي..."
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white max-w-[140px]"
                    />
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="أضف ملاحظاتك المحاسبية..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                    <button
                      onClick={handleSaveNotes}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                    >
                      حفظ
                    </button>
                    <button
                      onClick={() => setIsEditingMeta(false)}
                      className="px-2 py-1 text-slate-400 hover:text-white"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-slate-400 line-clamp-1">
                      <Tag className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-slate-300 font-semibold">{selectedSession.accountingTag}:</span>
                      <span>{selectedSession.notes || 'لا توجد ملاحظات إضافية.'}</span>
                    </div>
                    <button
                      onClick={() => setIsEditingMeta(true)}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold text-xs shrink-0"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>تعديل الملاحظات</span>
                    </button>
                  </>
                )}
              </div>

              {/* Transcript Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="text-center my-2">
                  <span className="text-[11px] font-semibold text-slate-500 px-3 py-1 rounded-full bg-slate-850 border border-slate-800">
                    بداية سجل المحادثة
                  </span>
                </div>

                {selectedSession.messages.map((msg, idx) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base shadow border ${
                          isUser
                            ? 'bg-amber-600 border-amber-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-200'
                        }`}
                      >
                        {isUser ? selectedSession.userName.charAt(0) : selectedSession.botAvatar}
                      </div>

                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-800/90 border border-slate-700 text-slate-100 rounded-tl-none'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-[11px] font-bold opacity-80">
                            {isUser ? selectedSession.userName : selectedSession.botName}
                          </span>
                          <span className="text-[10px] opacity-60 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString('ar-SA', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
              <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-semibold">اختر محادثة من القائمة لعرض تفاصيلها وسجلها الصوتي</p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

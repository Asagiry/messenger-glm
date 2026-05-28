import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { api } from '../utils/api';
import { formatTime, truncate } from '../utils/format';
import Sidebar from '../components/Sidebar';
import MessageBubble from '../components/MessageBubble';
import ChatHeader from '../components/ChatHeader';
import MessageInput from '../components/MessageInput';

interface Dialog {
  peer_id: string;
  nickname: string;
  avatar_url: string;
  is_online: boolean;
  last_message: string;
  last_message_at: string;
  last_sender_id: string;
  last_status: string;
  unread_count: number;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  status: string;
  edited_at: string | null;
  deleted_for_sender: boolean;
  deleted_for_receiver: boolean;
  created_at: string;
}

interface PeerUser {
  id: string;
  nickname: string;
  avatar_url: string;
  bio: string;
  is_online: boolean;
  last_seen: string;
}

export default function Chat() {
  const { peerId } = useParams();
  const { user } = useAuth();
  const { send, lastMessage, connected } = useWebSocket();
  const navigate = useNavigate();

  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [peer, setPeer] = useState<PeerUser | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Export/Import state
  const [showExportImport, setShowExportImport] = useState(false);
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [importedMessages, setImportedMessages] = useState<any[]>([]);
  const [importedParticipants, setImportedParticipants] = useState<any[]>([]);
  const [importError, setImportError] = useState('');
  const [showImportPreview, setShowImportPreview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dialogs
  const loadDialogs = useCallback(async () => {
    try {
      const data = await api.get('/messages/dialogs');
      setDialogs(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadDialogs();
    const interval = setInterval(loadDialogs, 5000);
    return () => clearInterval(interval);
  }, [loadDialogs]);

  // Load peer info and messages when peerId changes
  useEffect(() => {
    if (!peerId) {
      setMessages([]);
      setPeer(null);
      setPeerTyping(false);
      return;
    }

    const loadPeer = async () => {
      try {
        const data = await api.get(`/users/${peerId}`);
        setPeer(data);
      } catch {}
    };

    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const data = await api.get(`/messages/history/${peerId}?limit=30`);
        setMessages(data);
        setHasMore(data.length >= 30);
        send({ type: 'mark_read', peerId });
      } catch {}
      setLoadingMessages(false);
    };

    loadPeer();
    loadMessages();
    setPeerTyping(false);
    setShowExportImport(false);
    setExportData('');
    setImportData('');
    setImportedMessages([]);
    setShowImportPreview(false);
  }, [peerId]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'new_message': {
        const msg = lastMessage.message as Message;
        if (msg.sender_id === peerId || msg.receiver_id === peerId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.sender_id === peerId) {
            send({ type: 'mark_read', peerId: msg.sender_id });
          }
        }
        loadDialogs();
        break;
      }
      case 'message_sent': {
        const msg = lastMessage.message as Message;
        if (msg.receiver_id === peerId || msg.sender_id === peerId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
        loadDialogs();
        break;
      }
      case 'message_status': {
        const { messageId, status } = lastMessage;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status } : m))
        );
        break;
      }
      case 'message_edited': {
        const msg = lastMessage.message as Message;
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
        );
        break;
      }
      case 'message_deleted': {
        const { messageId, mode } = lastMessage;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            if (mode === 'both') {
              return { ...m, content: 'Message deleted', deleted_for_sender: true, deleted_for_receiver: true };
            }
            return m;
          })
        );
        break;
      }
      case 'typing': {
        if (lastMessage.userId === peerId) {
          setPeerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
        }
        break;
      }
      case 'stop_typing': {
        if (lastMessage.userId === peerId) {
          setPeerTyping(false);
        }
        break;
      }
      case 'messages_read': {
        if (lastMessage.byUserId === peerId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender_id === user?.id && m.receiver_id === peerId
                ? { ...m, status: 'read' }
                : m
            )
          );
        }
        break;
      }
      case 'presence': {
        if (lastMessage.userId === peerId) {
          setPeer((p) => p ? { ...p, is_online: lastMessage.online } : p);
          setDialogs((prev) =>
            prev.map((d) =>
              d.peer_id === lastMessage.userId
                ? { ...d, is_online: lastMessage.online }
                : d
            )
          );
        }
        break;
      }
    }
  }, [lastMessage, peerId, user?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load more messages (pagination)
  const loadMore = async () => {
    if (!peerId || !hasMore || loadingMessages) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const prevScrollHeight = container.scrollHeight;

    setLoadingMessages(true);
    try {
      const oldestMsg = messages[0];
      if (!oldestMsg) return;
      const data = await api.get(`/messages/history/${peerId}?limit=30&before=${oldestMsg.created_at}`);
      if (data.length < 30) setHasMore(false);
      setMessages((prev) => [...data, ...prev]);

      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch {}
    setLoadingMessages(false);
  };

  const handleSendMessage = (content: string) => {
    if (!peerId) return;
    send({ type: 'chat_message', receiverId: peerId, content });
    send({ type: 'stop_typing', receiverId: peerId });
  };

  const handleTyping = () => {
    if (!peerId) return;
    send({ type: 'typing', receiverId: peerId });
  };

  const handleStopTyping = () => {
    if (!peerId) return;
    send({ type: 'stop_typing', receiverId: peerId });
  };

  const handleEditMessage = (messageId: string, content: string) => {
    send({ type: 'edit_message', messageId, content });
  };

  const handleDeleteMessage = (messageId: string, mode: 'me' | 'both') => {
    send({ type: 'delete_message', messageId, mode });
  };

  const selectPeer = (id: string) => {
    navigate(`/chat/${id}`);
    setShowSearch(false);
    setSearchQuery('');
  };

  // Export chat history
  const handleExport = async () => {
    if (!peerId) return;
    try {
      const data = await api.get(`/messages/export/${peerId}`);
      setExportData(data.data);
    } catch {}
  };

  // Import chat history
  const handleImport = async () => {
    if (!importData.trim()) return;
    setImportError('');
    try {
      const data = await api.post('/messages/import', { data: importData.trim() });
      setImportedMessages(data.messages);
      setImportedParticipants(data.participants);
      setShowImportPreview(true);
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="h-screen flex bg-slate-900">
      {/* Sidebar */}
      <Sidebar
        dialogs={dialogs}
        activePeerId={peerId}
        onSelectPeer={selectPeer}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        showSearch={showSearch}
        setShowSearch={setShowSearch}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {peerId && peer ? (
          <>
            <ChatHeader peer={peer} typing={peerTyping} />
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop < 100 && hasMore) {
                  loadMore();
                }
              }}
            >
              {hasMore && (
                <div className="text-center py-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMessages}
                    className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    {loadingMessages ? 'Loading...' : 'Load earlier messages'}
                  </button>
                </div>
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender_id === user?.id}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                />
              ))}
              <div ref={messagesEndRef} />

              {/* Import Preview Overlay */}
              {showImportPreview && importedMessages.length > 0 && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-600/50">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Imported Chat Preview</h3>
                      <button
                        onClick={() => { setShowImportPreview(false); setImportedMessages([]); }}
                        className="text-slate-400 hover:text-white"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-slate-400 mb-3">
                      Participants: {importedParticipants.map((p: any) => p.nickname).join(' & ')}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                      {importedMessages.map((msg: any, idx: number) => (
                        <div key={idx} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                          <div className={`px-4 py-2 rounded-2xl text-sm max-w-[70%] ${
                            msg.sender_id === user?.id ? 'bg-indigo-600/50 text-slate-200' : 'bg-slate-700/50 text-slate-200'
                          }`}>
                            <p className="break-words">{msg.content}</p>
                            <span className="text-[10px] text-slate-400">{formatTime(msg.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Export/Import Bar */}
            {showExportImport && peerId && (
              <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/50 space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Export Chat
                  </button>
                  {exportData && (
                    <button
                      onClick={() => copyToClipboard(exportData)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                    >
                      Copy Base64
                    </button>
                  )}
                  <button
                    onClick={() => setShowExportImport(false)}
                    className="ml-auto text-slate-400 hover:text-white text-sm"
                  >
                    Close
                  </button>
                </div>
                {exportData && (
                  <div className="bg-slate-900/50 rounded-lg p-3 max-h-24 overflow-y-auto">
                    <p className="text-xs text-slate-400 font-mono break-all">{exportData}</p>
                  </div>
                )}
                <div className="border-t border-slate-700/30 pt-3">
                  <p className="text-sm text-slate-300 mb-2">Import Chat History</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Paste base64-encoded chat data..."
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                    <button
                      onClick={handleImport}
                      disabled={!importData.trim()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-30"
                    >
                      Import
                    </button>
                  </div>
                  {importError && (
                    <p className="text-xs text-red-400 mt-1">{importError}</p>
                  )}
                </div>
              </div>
            )}

            <MessageInput
              onSend={handleSendMessage}
              onTyping={handleTyping}
              onStopTyping={handleStopTyping}
              showExportImport={showExportImport}
              onToggleExportImport={() => setShowExportImport(!showExportImport)}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-800 mb-4">
                <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-400">Select a conversation</h2>
              <p className="text-slate-500 mt-1">Choose a chat or search for users to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

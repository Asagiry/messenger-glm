import { useState, useRef, useEffect } from 'react';
import { formatTime } from '../utils/format';

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

interface Props {
  message: Message;
  isOwn: boolean;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string, mode: 'me' | 'both') => void;
}

export default function MessageBubble({ message, isOwn, onEdit, onDelete }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const isDeleted = (isOwn && message.deleted_for_sender) || (!isOwn && message.deleted_for_receiver);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleEditSubmit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const statusIcon = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case 'sent':
        return <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
      case 'delivered':
        return <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7m-4 0l-4 4" /></svg>;
      case 'read':
        return <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7m-4 0l-4 4" /></svg>;
      default:
        return null;
    }
  };

  if (isDeleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5`}>
        <div className="px-4 py-2 rounded-2xl bg-slate-800/30 text-slate-500 text-sm italic max-w-[70%]">
          Message deleted
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5 group`} ref={menuRef}>
      <div className="relative max-w-[70%]">
        {isEditing ? (
          <div className={`px-4 py-2.5 rounded-2xl ${isOwn ? 'bg-indigo-600/90' : 'bg-slate-700/90'}`}>
            <input
              ref={editRef}
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEditSubmit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="bg-transparent text-white text-sm w-full border-b border-white/20 pb-1"
            />
            <div className="flex gap-2 mt-2 text-xs">
              <button onClick={handleEditSubmit} className="text-indigo-200 hover:text-white">Save</button>
              <button onClick={() => setIsEditing(false)} className="text-slate-300 hover:text-white">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`px-4 py-2.5 rounded-2xl text-sm ${
                isOwn
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-slate-700 text-slate-100 rounded-bl-md'
              }`}
            >
              <p className="break-words whitespace-pre-wrap">{message.content}</p>
              <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                <span className={`text-[10px] ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {formatTime(message.created_at)}
                </span>
                {message.edited_at && (
                  <span className={`text-[10px] ${isOwn ? 'text-indigo-200' : 'text-slate-400'}`}>edited</span>
                )}
                {statusIcon()}
              </div>
            </div>

            {/* Context menu trigger */}
            {isOwn && (
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-700"
              >
                <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" />
                </svg>
              </button>
            )}
            {!isOwn && (
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-700"
              >
                <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18" r="1.5" />
                </svg>
              </button>
            )}

            {showMenu && (
              <div className={`absolute z-20 ${isOwn ? 'right-0' : 'left-0'} top-full mt-1 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl py-1 min-w-[160px]`}>
                {isOwn && (
                  <button
                    onClick={() => { setIsEditing(true); setShowMenu(false); setEditContent(message.content); }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/50 transition-colors"
                  >
                    Edit message
                  </button>
                )}
                <button
                  onClick={() => { onDelete(message.id, 'me'); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/50 transition-colors"
                >
                  Delete for me
                </button>
                {isOwn && (
                  <button
                    onClick={() => { onDelete(message.id, 'both'); setShowMenu(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700/50 transition-colors"
                  >
                    Delete for both
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

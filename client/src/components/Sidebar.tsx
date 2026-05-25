import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { truncate, formatTime } from '../utils/format';

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

interface Props {
  dialogs: Dialog[];
  activePeerId: string | undefined;
  onSelectPeer: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: any[];
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
}

export default function Sidebar({
  dialogs,
  activePeerId,
  onSelectPeer,
  searchQuery,
  setSearchQuery,
  searchResults,
  showSearch,
  setShowSearch,
}: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="w-80 flex flex-col border-r border-slate-700/50 bg-slate-850 shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                  {user?.nickname?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-850"></div>
            </div>
            <span className="font-semibold text-white text-sm">{user?.nickname}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/directory')}
              className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              autoFocus
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600/50 rounded-xl shadow-xl overflow-hidden">
                {searchResults.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => onSelectPeer(u.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                        {u.nickname[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-white text-sm font-medium">{u.nickname}</div>
                      <div className="text-slate-400 text-xs">{u.is_online ? 'Online' : 'Offline'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs List */}
      <div className="flex-1 overflow-y-auto">
        {dialogs.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            No conversations yet. Search for users to start chatting!
          </div>
        ) : (
          dialogs.map((dialog) => (
            <button
              key={dialog.peer_id}
              onClick={() => onSelectPeer(dialog.peer_id)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors text-left ${
                activePeerId === dialog.peer_id ? 'bg-slate-800/70 border-l-2 border-indigo-500' : ''
              }`}
            >
              <div className="relative shrink-0">
                {dialog.avatar_url ? (
                  <img src={dialog.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                    {dialog.nickname[0].toUpperCase()}
                  </div>
                )}
                {dialog.is_online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm truncate">{dialog.nickname}</span>
                  <span className="text-xs text-slate-500 shrink-0">{formatTime(dialog.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-slate-400 truncate">{truncate(dialog.last_message, 35)}</span>
                  {dialog.unread_count > 0 && (
                    <span className="ml-2 shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-indigo-600 text-white text-xs font-medium rounded-full">
                      {dialog.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Logout */}
      <div className="p-3 border-t border-slate-700/50">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-red-400 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
}

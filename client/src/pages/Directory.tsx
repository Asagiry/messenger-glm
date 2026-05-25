import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

interface User {
  id: string;
  nickname: string;
  avatar_url: string;
  bio: string;
  is_online: boolean;
  last_seen: string;
}

export default function Directory() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/users/directory').then(setUsers).catch(() => {});
  }, []);

  const filtered = search
    ? users.filter((u) => u.nickname.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="min-h-screen bg-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to chats
          </button>
          <h1 className="text-xl font-bold text-white">User Directory</h1>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by nickname..."
            className="w-full px-4 py-3 bg-slate-800 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <div className="grid gap-3">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => navigate(`/chat/${u.id}`)}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-700/30 transition-colors text-left"
            >
              <div className="relative">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
                    {u.nickname[0].toUpperCase()}
                  </div>
                )}
                {u.is_online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-800"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">{u.nickname}</div>
                <div className="text-sm text-slate-400 truncate">{u.bio || 'No bio'}</div>
              </div>
              <div className="text-xs text-slate-500 shrink-0">
                {u.is_online ? (
                  <span className="text-emerald-400">Online</span>
                ) : (
                  'Offline'
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

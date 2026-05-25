interface PeerUser {
  id: string;
  nickname: string;
  avatar_url: string;
  bio: string;
  is_online: boolean;
  last_seen: string;
}

interface Props {
  peer: PeerUser;
  typing: boolean;
}

export default function ChatHeader({ peer, typing }: Props) {
  return (
    <div className="px-5 py-3 border-b border-slate-700/50 bg-slate-850 flex items-center gap-3">
      <div className="relative">
        {peer.avatar_url ? (
          <img src={peer.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
            {peer.nickname[0].toUpperCase()}
          </div>
        )}
        {peer.is_online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-850"></div>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-white text-sm">{peer.nickname}</h3>
        {typing ? (
          <p className="text-xs text-indigo-400 animate-pulse">typing...</p>
        ) : peer.is_online ? (
          <p className="text-xs text-emerald-400">Online</p>
        ) : (
          <p className="text-xs text-slate-500">Offline</p>
        )}
      </div>
    </div>
  );
}

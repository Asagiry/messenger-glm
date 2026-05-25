import { useState, FormEvent } from 'react';

interface Props {
  onSend: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

export default function MessageInput({ onSend, onTyping, onStopTyping }: Props) {
  const [text, setText] = useState('');
  const [typingSent, setTypingSent] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    onStopTyping();
    setTypingSent(false);
  };

  const handleChange = (value: string) => {
    setText(value);
    if (value.trim() && !typingSent) {
      onTyping();
      setTypingSent(true);
    }
    if (!value.trim() && typingSent) {
      onStopTyping();
      setTypingSent(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-slate-700/50 bg-slate-850">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </form>
  );
}

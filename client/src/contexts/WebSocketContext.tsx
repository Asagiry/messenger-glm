import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface WSMessage {
  type: string;
  [key: string]: any;
}

interface WebSocketContextType {
  connected: boolean;
  send: (msg: WSMessage) => void;
  lastMessage: WSMessage | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);

  useEffect(() => {
    if (!token) {
      if (ws) {
        ws.close();
        setWs(null);
        setConnected(false);
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (token) {
          const newUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
          const newSocket = new WebSocket(newUrl);
          setWs(newSocket);
        }
      }, 3000);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch {}
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [token]);

  const send = useCallback((msg: WSMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [ws]);

  return (
    <WebSocketContext.Provider value={{ connected, send, lastMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}

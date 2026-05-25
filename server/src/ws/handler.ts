import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { JWT_SECRET } from '../middleware/auth';

interface ClientWS extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, ClientWS>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: ClientWS, req) => {
    // Extract token from query
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      ws.userId = decoded.userId;
      ws.isAlive = true;

      // Replace any existing connection for this user
      const existing = clients.get(ws.userId);
      if (existing && existing !== ws) {
        existing.close(4002, 'Replaced by new connection');
      }
      clients.set(ws.userId, ws);

      // Set user online
      setUserOnline(ws.userId, true);

      // Notify contacts this user is online
      broadcastPresence(ws.userId, true);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await handleMessage(ws, msg);
        } catch (err) {
          console.error('WS message error:', err);
        }
      });

      ws.on('close', () => {
        if (ws.userId) {
          clients.delete(ws.userId);
          setUserOnline(ws.userId, false);
          broadcastPresence(ws.userId, false);
        }
      });
    } catch {
      ws.close(4003, 'Invalid token');
    }
  });

  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: ClientWS) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
}

async function handleMessage(ws: ClientWS, msg: any) {
  const userId = ws.userId!;
  switch (msg.type) {
    case 'chat_message': {
      const { receiverId, content } = msg;
      if (!receiverId || !content) return;

      const result = await pool.query(
        `INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, 'sent') RETURNING id, sender_id, receiver_id, content, status, created_at`,
        [userId, receiverId, content]
      );
      const message = result.rows[0];

      const recipientWs = clients.get(receiverId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        // Mark as delivered
        await pool.query(`UPDATE messages SET status = 'delivered' WHERE id = $1`, [message.id]);
        message.status = 'delivered';

        recipientWs.send(JSON.stringify({
          type: 'new_message',
          message,
        }));

        // Send delivery receipt back to sender
        ws.send(JSON.stringify({
          type: 'message_status',
          messageId: message.id,
          status: 'delivered',
        }));
      }

      // Confirm to sender
      ws.send(JSON.stringify({
        type: 'message_sent',
        message,
      }));
      break;
    }

    case 'typing': {
      const { receiverId } = msg;
      if (!receiverId) return;
      const recipientWs = clients.get(receiverId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify({
          type: 'typing',
          userId,
        }));
      }
      break;
    }

    case 'stop_typing': {
      const { receiverId } = msg;
      if (!receiverId) return;
      const recipientWs = clients.get(receiverId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify({
          type: 'stop_typing',
          userId,
        }));
      }
      break;
    }

    case 'mark_read': {
      const { peerId } = msg;
      if (!peerId) return;
      await pool.query(
        `UPDATE messages SET status = 'read' WHERE sender_id = $1 AND receiver_id = $2 AND status = 'delivered'`,
        [peerId, userId]
      );
      // Notify peer that messages were read
      const peerWs = clients.get(peerId);
      if (peerWs && peerWs.readyState === WebSocket.OPEN) {
        peerWs.send(JSON.stringify({
          type: 'messages_read',
          byUserId: userId,
        }));
      }
      break;
    }

    case 'edit_message': {
      const { messageId, content } = msg;
      if (!messageId || !content) return;
      const result = await pool.query(
        `UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2 AND sender_id = $3 RETURNING id, sender_id, receiver_id, content, status, edited_at, created_at`,
        [content, messageId, userId]
      );
      if (result.rows[0]) {
        const edited = result.rows[0];
        const recipientWs = clients.get(edited.receiver_id);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'message_edited',
            message: edited,
          }));
        }
        ws.send(JSON.stringify({
          type: 'message_edited',
          message: edited,
        }));
      }
      break;
    }

    case 'delete_message': {
      const { messageId, mode } = msg; // mode: 'me' or 'both'
      if (!messageId) return;

      const msgRow = await pool.query(`SELECT sender_id, receiver_id FROM messages WHERE id = $1`, [messageId]);
      if (!msgRow.rows[0]) return;

      if (mode === 'both' && msgRow.rows[0].sender_id === userId) {
        await pool.query(`UPDATE messages SET deleted_for_sender = TRUE, deleted_for_receiver = TRUE WHERE id = $1`, [messageId]);
        const recipientWs = clients.get(msgRow.rows[0].receiver_id);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'message_deleted',
            messageId,
            mode: 'both',
          }));
        }
      } else {
        if (msgRow.rows[0].sender_id === userId) {
          await pool.query(`UPDATE messages SET deleted_for_sender = TRUE WHERE id = $1`, [messageId]);
        } else {
          await pool.query(`UPDATE messages SET deleted_for_receiver = TRUE WHERE id = $1`, [messageId]);
        }
      }
      ws.send(JSON.stringify({
        type: 'message_deleted',
        messageId,
        mode: mode || 'me',
      }));
      break;
    }
  }
}

async function setUserOnline(userId: string, online: boolean) {
  await pool.query(
    `UPDATE users SET is_online = $1, last_seen = NOW() WHERE id = $2`,
    [online, userId]
  );
}

function broadcastPresence(userId: string, online: boolean) {
  const presence = JSON.stringify({
    type: 'presence',
    userId,
    online,
  });
  clients.forEach((ws) => {
    if (ws.userId !== userId && ws.readyState === WebSocket.OPEN) {
      ws.send(presence);
    }
  });
}

export { clients };

import { Router, Response } from 'express';
import pool from '../db/pool';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Get dialogs list (chats with last message + unread count)
router.get('/dialogs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        u.id as peer_id,
        u.nickname,
        u.avatar_url,
        u.is_online,
        m.content as last_message,
        m.created_at as last_message_at,
        m.sender_id as last_sender_id,
        m.status as last_status,
        (SELECT COUNT(*) FROM messages m2
          WHERE m2.sender_id = u.id AND m2.receiver_id = $1
          AND m2.status = 'delivered' AND m2.deleted_for_receiver = FALSE
        )::int as unread_count
      FROM users u
      INNER JOIN LATERAL (
        SELECT content, created_at, sender_id, status
        FROM messages
        WHERE (sender_id = $1 AND receiver_id = u.id AND deleted_for_sender = FALSE)
           OR (sender_id = u.id AND receiver_id = $1 AND deleted_for_receiver = FALSE)
        ORDER BY created_at DESC LIMIT 1
      ) m ON TRUE
      WHERE u.id != $1
      ORDER BY m.created_at DESC NULLS LAST`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error('Get dialogs error', { userId: req.userId, error: String(err) });
    res.status(500).json({ error: 'Failed to get dialogs' });
  }
});

// Get chat history with a specific user (paginated)
router.get('/history/:peerId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { peerId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
  const before = req.query.before as string | undefined;

  try {
    let query = `
      SELECT id, sender_id, receiver_id, content, status, edited_at, deleted_for_sender, deleted_for_receiver, created_at
      FROM messages
      WHERE ((sender_id = $1 AND receiver_id = $2 AND deleted_for_sender = FALSE)
         OR (sender_id = $2 AND receiver_id = $1 AND deleted_for_receiver = FALSE))
      ${before ? 'AND created_at < $4' : ''}
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const params = before ? [req.userId, peerId, limit, before] : [req.userId, peerId, limit];
    const result = await pool.query(query, params);

    // Mark messages as read (delivered -> read) where current user is receiver
    await pool.query(
      `UPDATE messages SET status = 'read' WHERE sender_id = $2 AND receiver_id = $1 AND status = 'delivered'`,
      [req.userId, peerId]
    );

    res.json(result.rows.reverse());
  } catch (err) {
    logger.error('Get history error', { userId: req.userId, peerId, error: String(err) });
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

// Send a message (REST fallback)
router.post('/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { receiverId, content } = req.body;
  if (!receiverId || !content) {
    res.status(400).json({ error: 'Receiver and content required' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, 'sent') RETURNING id, sender_id, receiver_id, content, status, created_at`,
      [req.userId, receiverId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Send message error', { userId: req.userId, receiverId, error: String(err) });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Edit a message
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content required' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE messages SET content = $1, edited_at = NOW() WHERE id = $2 AND sender_id = $3 RETURNING id, sender_id, receiver_id, content, status, edited_at, created_at`,
      [content, id, req.userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Message not found or not yours' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Edit message error', { messageId: id, userId: req.userId, error: String(err) });
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete a message
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { mode } = req.body; // 'me' or 'both'

  try {
    if (mode === 'both') {
      // Only sender can delete for both
      const result = await pool.query(
        `UPDATE messages SET deleted_for_sender = TRUE, deleted_for_receiver = TRUE WHERE id = $1 AND sender_id = $2`,
        [id, req.userId]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Message not found or not yours' });
        return;
      }
    } else {
      // Delete for me - mark as deleted for the appropriate side
      const msg = await pool.query(`SELECT sender_id, receiver_id FROM messages WHERE id = $1`, [id]);
      if (!msg.rows[0]) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }
      if (msg.rows[0].sender_id === req.userId) {
        await pool.query(`UPDATE messages SET deleted_for_sender = TRUE WHERE id = $1`, [id]);
      } else {
        await pool.query(`UPDATE messages SET deleted_for_receiver = TRUE WHERE id = $1`, [id]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete message error', { messageId: id, userId: req.userId, error: String(err) });
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Export chat history as base64-encoded JSON
router.get('/export/:peerId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { peerId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, sender_id, receiver_id, content, status, edited_at, created_at
       FROM messages
       WHERE ((sender_id = $1 AND receiver_id = $2 AND deleted_for_sender = FALSE)
          OR (sender_id = $2 AND receiver_id = $1 AND deleted_for_receiver = FALSE))
       ORDER BY created_at ASC`,
      [req.userId, peerId]
    );

    // Get peer info for context
    const peerResult = await pool.query(
      `SELECT id, nickname FROM users WHERE id = $1`,
      [peerId]
    );
    const meResult = await pool.query(
      `SELECT id, nickname FROM users WHERE id = $1`,
      [req.userId]
    );

    const exportData = {
      exportedAt: new Date().toISOString(),
      participants: [
        { id: meResult.rows[0]?.id, nickname: meResult.rows[0]?.nickname },
        { id: peerResult.rows[0]?.id, nickname: peerResult.rows[0]?.nickname },
      ],
      messages: result.rows,
    };

    const jsonStr = JSON.stringify(exportData);
    const base64 = Buffer.from(jsonStr).toString('base64');

    logger.info('Chat history exported', { userId: req.userId, peerId, messageCount: result.rows.length });
    res.json({ data: base64 });
  } catch (err) {
    logger.error('Export chat error', { userId: req.userId, peerId, error: String(err) });
    res.status(500).json({ error: 'Failed to export chat history' });
  }
});

// Import chat history from base64-encoded JSON
router.post('/import', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { data } = req.body;
  if (!data) {
    res.status(400).json({ error: 'Base64 data is required' });
    return;
  }

  try {
    const jsonStr = Buffer.from(data, 'base64').toString('utf-8');
    const importData = JSON.parse(jsonStr);

    if (!importData.messages || !Array.isArray(importData.messages)) {
      res.status(400).json({ error: 'Invalid import data: messages array required' });
      return;
    }

    // Validate that the importing user is a participant
    const participantIds = (importData.participants || []).map((p: any) => p.id);
    if (!participantIds.includes(req.userId)) {
      res.status(403).json({ error: 'You are not a participant in this chat history' });
      return;
    }

    const peerId = participantIds.find((id: string) => id !== req.userId);
    if (!peerId) {
      res.status(400).json({ error: 'Could not determine peer from import data' });
      return;
    }

    // Verify peer exists
    const peerCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [peerId]);
    if (peerCheck.rows.length === 0) {
      res.status(400).json({ error: 'Peer user not found' });
      return;
    }

    // Return the imported messages for display (read-only preview, not inserted into DB)
    logger.info('Chat history imported', { userId: req.userId, peerId, messageCount: importData.messages.length });
    res.json({
      participants: importData.participants,
      messages: importData.messages,
    });
  } catch (err) {
    logger.error('Import chat error', { userId: req.userId, error: String(err) });
    res.status(400).json({ error: 'Invalid base64 data or malformed JSON' });
  }
});

export default router;

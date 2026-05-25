import { Router, Response } from 'express';
import pool from '../db/pool';
import { AuthRequest, authMiddleware } from '../middleware/auth';

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
    console.error('Get dialogs error:', err);
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
    console.error('Get history error:', err);
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
    console.error('Send message error:', err);
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
    console.error('Edit message error:', err);
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
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;

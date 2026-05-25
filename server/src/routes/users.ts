import { Router, Response } from 'express';
import pool from '../db/pool';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, email, nickname, avatar_url, bio, is_online, last_seen, created_at FROM users WHERE id = $1`,
      [req.userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { nickname, avatar_url, bio, password } = req.body;
  try {
    if (password) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.userId]);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (nickname !== undefined) {
      updates.push(`nickname = $${idx++}`);
      values.push(nickname);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(avatar_url);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${idx++}`);
      values.push(bio);
    }

    if (updates.length > 0) {
      values.push(req.userId);
      const result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, nickname, avatar_url, bio`,
        values
      );
      res.json(result.rows[0]);
    } else if (password) {
      const result = await pool.query(
        `SELECT id, email, nickname, avatar_url, bio FROM users WHERE id = $1`,
        [req.userId]
      );
      res.json(result.rows[0]);
    } else {
      res.status(400).json({ error: 'No fields to update' });
    }
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Nickname already taken' });
      return;
    }
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.length < 1) {
    res.status(400).json({ error: 'Search query required' });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT id, nickname, avatar_url, bio, is_online, last_seen FROM users WHERE nickname ILIKE $1 AND id != $2 ORDER BY nickname LIMIT 20`,
      [`%${q}%`, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/directory', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nickname, avatar_url, bio, is_online, last_seen FROM users WHERE id != $1 ORDER BY nickname LIMIT 50`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Directory error:', err);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, nickname, avatar_url, bio, is_online, last_seen FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;

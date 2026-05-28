import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from '../db/pool';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

async function downloadAvatar(url: string, userId: string): Promise<string> {
  // Ensure uploads directory exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Messenger/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    // Determine extension
    let ext = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('svg')) ext = 'svg';
    else if (contentType.includes('webp')) ext = 'webp';

    const filename = `${userId}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${filename}`;
  } catch (err) {
    logger.warn('Failed to download avatar', { url, userId, error: String(err) });
    // Fallback: store the original URL if download fails
    return url;
  }
}

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
    logger.error('Get profile error', { userId: req.userId, error: String(err) });
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
      logger.info('Password changed', { userId: req.userId });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (nickname !== undefined) {
      updates.push(`nickname = $${idx++}`);
      values.push(nickname);
    }

    if (avatar_url !== undefined) {
      // Download avatar from URL and save locally
      const localPath = await downloadAvatar(avatar_url, req.userId!);
      updates.push(`avatar_url = $${idx++}`);
      values.push(localPath);
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
      logger.info('Profile updated', { userId: req.userId, fields: updates.map(u => u.split('=')[0].trim()) });
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
    logger.error('Update profile error', { userId: req.userId, error: String(err) });
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
    logger.info('User search', { query: q, userId: req.userId, results: result.rows.length });
    res.json(result.rows);
  } catch (err) {
    logger.error('Search error', { query: q, userId: req.userId, error: String(err) });
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
    logger.error('Directory error', { userId: req.userId, error: String(err) });
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
    logger.error('Get user error', { targetId: req.params.id, error: String(err) });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;

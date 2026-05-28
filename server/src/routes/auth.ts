import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db/pool';
import { generateToken, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  nickname: string;
  avatar_url: string;
  bio: string;
  is_online: boolean;
  last_seen: Date;
  created_at: Date;
}

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, nickname } = req.body;
  if (!email || !password || !nickname) {
    res.status(400).json({ error: 'Email, password, and nickname are required' });
    return;
  }
  if (nickname.length < 2 || nickname.length > 100) {
    res.status(400).json({ error: 'Nickname must be 2-100 characters' });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname, avatar_url, bio`,
      [email, hash, nickname]
    );
    const user = result.rows[0];
    const token = generateToken(user.id);
    logger.info('User registered', { email, nickname, userId: user.id });
    res.status(201).json({ token, user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, bio: user.bio } });
  } catch (err: any) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'Email' : 'Nickname';
      logger.warn('Registration failed - duplicate', { email, nickname, field });
      res.status(409).json({ error: `${field} already taken` });
      return;
    }
    logger.error('Registration error', { email, error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, nickname, avatar_url, bio FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      logger.warn('Login attempt - user not found', { email });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logger.warn('Login attempt - invalid password', { email, userId: user.id });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user.id);
    logger.info('User logged in', { email, userId: user.id });
    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, bio: user.bio },
    });
  } catch (err) {
    logger.error('Login error', { email, error: String(err) });
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out' });
});

// Password recovery: request reset token
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    const result = await pool.query<UserRow>(
      `SELECT id, email, nickname FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];

    // Always return success to avoid user enumeration
    if (!user) {
      logger.warn('Password reset requested for unknown email', { email });
      res.json({ message: 'If that email exists, a reset token has been generated' });
      return;
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, resetToken, expiresAt]
    );

    logger.info('Password reset token generated', { email, userId: user.id });

    // In a real app this would be sent via email. For MVP, return the token directly.
    res.json({
      message: 'If that email exists, a reset token has been generated',
      token: resetToken,
    });
  } catch (err) {
    logger.error('Forgot password error', { email, error: String(err) });
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Password recovery: confirm reset with token
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ error: 'Token and new password are required' });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT pr.user_id, pr.expires_at, pr.used FROM password_resets pr WHERE pr.token = $1`,
      [token]
    );
    const resetRow = result.rows[0];

    if (!resetRow) {
      logger.warn('Password reset attempted with invalid token');
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    if (resetRow.used) {
      logger.warn('Password reset attempted with already-used token', { userId: resetRow.user_id });
      res.status(400).json({ error: 'This reset token has already been used' });
      return;
    }

    if (new Date(resetRow.expires_at) < new Date()) {
      logger.warn('Password reset attempted with expired token', { userId: resetRow.user_id });
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, resetRow.user_id]);
    await pool.query(`UPDATE password_resets SET used = TRUE WHERE token = $1`, [token]);

    logger.info('Password reset successful', { userId: resetRow.user_id });
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    logger.error('Reset password error', { error: String(err) });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;

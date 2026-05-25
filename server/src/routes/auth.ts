import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { generateToken, AuthRequest } from '../middleware/auth';

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
    res.status(201).json({ token, user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, bio: user.bio } });
  } catch (err: any) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'Email' : 'Nickname';
      res.status(409).json({ error: `${field} already taken` });
      return;
    }
    console.error('Register error:', err);
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
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, bio: user.bio },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out' });
});

export default router;

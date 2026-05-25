import pool from './pool';
import bcrypt from 'bcryptjs';

const TEST_USERS = [
  { nickname: 'alice', email: 'alice@test.com', password: '123456' },
  { nickname: 'bob', email: 'bob@test.com', password: 'qwerty' },
  { nickname: 'charlie', email: 'charlie@test.com', password: 'charlie' },
  { nickname: 'diana', email: 'diana@test.com', password: 'diana' },
  { nickname: 'eve', email: 'eve@test.com', password: '123456' },
  { nickname: 'frank', email: 'frank@test.com', password: 'qwerty' },
  { nickname: 'grace', email: 'grace@test.com', password: 'grace' },
  { nickname: 'heidi', email: 'heidi@test.com', password: 'heidi' },
  { nickname: 'ivan', email: 'ivan@test.com', password: 'ivan' },
  { nickname: 'judy', email: 'judy@test.com', password: 'judy' },
];

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=eve',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=frank',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=grace',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=heidi',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=ivan',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=judy',
];

const BIOS = [
  'Coffee enthusiast & code lover',
  'Exploring the world one step at a time',
  'Music is my therapy',
  'Books, cats, and quiet evenings',
  'Tech geek with a creative side',
  'Fitness freak and foodie',
  'Art is the lie that enables us to realize the truth',
  'Dreamer, thinker, doer',
  'Life is short, make it sweet',
  'Adventure awaits around every corner',
];

interface DialogSeed {
  user1Idx: number;
  user2Idx: number;
  messages: { from: number; text: string }[];
}

const DIALOGS: DialogSeed[] = [
  {
    user1Idx: 0,
    user2Idx: 1,
    messages: [
      { from: 0, text: 'Hey Bob! How are you doing?' },
      { from: 1, text: 'Hi Alice! Pretty good, just finished a project.' },
      { from: 0, text: 'That sounds awesome! What was it about?' },
      { from: 1, text: 'A new web app for tracking habits.' },
      { from: 0, text: 'Oh cool, I could use something like that!' },
      { from: 1, text: 'I will send you the link once it is live.' },
      { from: 0, text: 'Thanks, looking forward to it!' },
    ],
  },
  {
    user1Idx: 0,
    user2Idx: 2,
    messages: [
      { from: 2, text: 'Alice, have you seen the new React docs?' },
      { from: 0, text: 'Yes! The new hooks section is amazing.' },
      { from: 2, text: 'Totally agree. Server components are a game changer.' },
      { from: 0, text: 'I am planning to refactor my app with them.' },
      { from: 2, text: 'Let me know if you need help!' },
    ],
  },
  {
    user1Idx: 1,
    user2Idx: 3,
    messages: [
      { from: 1, text: 'Diana, want to grab lunch?' },
      { from: 3, text: 'Sure! What time works for you?' },
      { from: 1, text: 'How about 12:30?' },
      { from: 3, text: 'Perfect, see you then!' },
      { from: 1, text: 'Great, I know a nice place downtown.' },
      { from: 3, text: 'Awesome, I love trying new spots!' },
      { from: 1, text: 'You will love this one, trust me.' },
      { from: 3, text: 'Cannot wait! 😋' },
      { from: 1, text: 'See you soon!' },
    ],
  },
  {
    user1Idx: 4,
    user2Idx: 5,
    messages: [
      { from: 4, text: 'Frank, did you finish the API integration?' },
      { from: 5, text: 'Almost done, just fixing some edge cases.' },
      { from: 4, text: 'Nice, let me review when you are ready.' },
      { from: 5, text: 'Will push the branch in an hour.' },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if already seeded
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) > 0) {
      console.log('Database already has users, skipping seed');
      await client.query('COMMIT');
      return;
    }

    // Insert users
    const userIds: string[] = [];
    for (let i = 0; i < TEST_USERS.length; i++) {
      const u = TEST_USERS[i];
      const hash = await bcrypt.hash(u.password, 10);
      const res = await client.query(
        `INSERT INTO users (email, password_hash, nickname, avatar_url, bio) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [u.email, hash, u.nickname, AVATARS[i], BIOS[i]]
      );
      userIds.push(res.rows[0].id);
    }

    // Insert dialog messages
    for (const dialog of DIALOGS) {
      const u1 = userIds[dialog.user1Idx];
      const u2 = userIds[dialog.user2Idx];
      for (const msg of dialog.messages) {
        const senderId = msg.from === 0 ? u1 : u2;
        const receiverId = msg.from === 0 ? u2 : u1;
        await client.query(
          `INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, 'read')`,
          [senderId, receiverId, msg.text]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

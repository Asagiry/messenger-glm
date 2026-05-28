#!/bin/bash
set -e

echo "=== Messenger Deployment Script ==="

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded .env file"
else
  echo "ERROR: .env file not found"
  exit 1
fi

SSH_KEY="./id_ed25519"
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@$SSH_IP"

echo "=== Step 1: Push code to remote ==="
git push origin main 2>/dev/null || echo "Push may have already been up to date"

echo "=== Step 2: Clone/update code on VM ==="
$SSH_CMD << 'REMOTE_SCRIPT'
set -e
cd /home/base-ubuntu

if [ -d messenger ]; then
  echo "Updating existing repository..."
  cd messenger
  git pull origin main
else
  echo "Cloning repository..."
  git clone https://github.com/$(git config --global user.name 2>/dev/null || echo "unknown")/messenger.git 2>/dev/null || {
    echo "Clone not available, will use rsync"
  }
fi
REMOTE_SCRIPT

echo "=== Step 2b: Sync files via rsync ==="
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='client/dist' \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  ./ $SSH_USER@$SSH_IP:/home/base-ubuntu/messenger/

echo "=== Step 3: Install dependencies, migrate, build, and start ==="
$SSH_CMD << 'REMOTE_SCRIPT'
set -e
cd /home/base-ubuntu/messenger

# Copy env file
if [ -f .env ]; then
  echo "Using existing .env"
else
  echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app" > .env
  echo "PORT=80" >> .env
  echo "JWT_SECRET=messenger-jwt-secret-prod-2024" >> .env
  echo "CORS_ORIGIN=http://glm-messenger.voimaxgm.online" >> .env
fi

# Create uploads directory for avatar storage
echo "Creating uploads directory..."
mkdir -p server/uploads

# Install server dependencies
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Install client dependencies
echo "Installing client dependencies..."
cd client
npm install
cd ..

# Run migrations (includes new password_resets table)
echo "Running database migrations..."
cd server
npx ts-node src/db/migrate.ts
cd ..

# Seed database
echo "Seeding database..."
cd server
npx ts-node src/db/seed.ts
cd ..

# Build client
echo "Building React frontend..."
cd client
npm run build
cd ..

# Build server
echo "Building server TypeScript..."
cd server
npx tsc
cd ..

# Stop existing PM2 process
echo "Restarting PM2 process..."
sudo pm2 delete messenger 2>/dev/null || true

# Start with PM2 on port 80 (needs sudo for privileged port)
sudo pm2 start server/dist/index.js --name messenger -- --env production

# Save PM2 process list
sudo pm2 save

echo "=== Deployment Complete ==="
sudo pm2 status
REMOTE_SCRIPT

echo "=== Verifying deployment ==="
sleep 3
$SSH_CMD "curl -s -o /dev/null -w '%{http_code}' http://localhost:80" && echo " - Server responding on port 80" || echo " - WARNING: Server not responding"

echo ""
echo "Deployment finished! App should be accessible at http://glm-messenger.voimaxgm.online"

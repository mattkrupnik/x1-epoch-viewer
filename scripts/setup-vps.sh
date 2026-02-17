#!/bin/bash
set -e

# ============================================
# VPS Setup Script for x1-epoch-viewer
# Run once on a fresh Ubuntu/Debian VPS
# Usage: bash scripts/setup-vps.sh
# ============================================

APP_DIR="/opt/x1-epoch-viewer"
REPO_URL="https://github.com/YOUR_USERNAME/x1-epoch-viewer.git"

echo "=== x1-epoch-viewer VPS Setup ==="

# 1. Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed."
else
    echo "Docker already installed."
fi

# 2. Clone repo
if [ ! -d "$APP_DIR" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
else
    echo "Repository already exists, pulling latest..."
    cd "$APP_DIR" && git pull
fi

cd "$APP_DIR"

# 3. Create .env from template
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file..."
    cp .env.production.example .env

    read -p "Enter your domain (e.g. validator.example.com): " DOMAIN
    read -p "Enter a strong PostgreSQL password: " PG_PASS

    sed -i "s/yourdomain.com/$DOMAIN/" .env
    sed -i "s/change_me_to_a_strong_password/$PG_PASS/" .env

    echo ".env created. Review it: cat $APP_DIR/.env"
else
    echo ".env already exists."
    source .env
fi

# Load env
source .env

# 4. Get SSL certificate (before starting nginx)
echo ""
echo "=== Setting up SSL certificate ==="

# Start postgres and server first (nginx needs SSL certs to start)
docker compose -f docker-compose.prod.yml up -d postgres
sleep 5

# Get initial certificate using standalone mode
docker run --rm \
    -v "$(pwd)/certbot-conf:/etc/letsencrypt" \
    -v "$(pwd)/certbot-www:/var/www/certbot" \
    -p 80:80 \
    certbot/certbot certonly \
    --standalone \
    --email admin@${DOMAIN} \
    --agree-tos \
    --no-eff-email \
    -d ${DOMAIN}

# Move certs to docker volume
docker compose -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot --email admin@${DOMAIN} --agree-tos --no-eff-email -d ${DOMAIN} --force-renewal 2>/dev/null || true

# Copy standalone certs into volume if webroot failed
if [ -d "certbot-conf/live/${DOMAIN}" ]; then
    echo "Copying certificates to Docker volume..."
    docker compose -f docker-compose.prod.yml up -d certbot
    docker cp "certbot-conf/." "$(docker compose -f docker-compose.prod.yml ps -q certbot):/etc/letsencrypt/" 2>/dev/null || true
fi

# 5. Build and start everything
echo ""
echo "=== Building and starting services ==="
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm frontend-init
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=== Setup complete! ==="
echo "Your app should be available at: https://${DOMAIN}"
echo ""
echo "Useful commands:"
echo "  cd $APP_DIR"
echo "  docker compose -f docker-compose.prod.yml logs -f        # View logs"
echo "  docker compose -f docker-compose.prod.yml restart server  # Restart server"
echo "  docker compose -f docker-compose.prod.yml down            # Stop all"
echo ""
echo "GitHub Actions secrets needed:"
echo "  VPS_HOST     = $(curl -s ifconfig.me)"
echo "  VPS_USER     = $(whoami)"
echo "  VPS_SSH_KEY  = (your private SSH key)"

#!/bin/bash
set -e

# Persian Legal Firm - Deployment Script
# Run this script to deploy the application to your Ubuntu VPS

# Configuration
APP_NAME="lawyer"
APP_USER="lawyer"
APP_DIR="/srv/lawyer"
DOMAIN="lawyer.partnersystems.online"
SERVICE_NAME="lawyer"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root (use sudo)"
fi

# Step 1: System preparation and user creation
log "Step 1: Creating system user and directories..."

# Create application user (system user without sudo for security)
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" --create-home "$APP_USER"
    log "Created system user: $APP_USER"
else
    log "User $APP_USER already exists"
fi

# Create directory structure
mkdir -p "$APP_DIR"/{releases,shared/{certs,logs}}
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
log "Created directory structure in $APP_DIR"

# Step 2: Install Node.js 20 LTS
log "Step 2: Installing Node.js 20 LTS..."

if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log "Installed Node.js $(node -v)"
else
    log "Node.js 20 is already installed: $(node -v)"
fi

# Install build tools
apt-get update
apt-get install -y git build-essential python3-minimal

# Step 3: Clone and build application
log "Step 3: Cloning and building application..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RELEASE_DIR="$APP_DIR/releases/$TIMESTAMP"

# Clone the repository (you'll need to update this with your repo URL)
# For now, we'll assume the code is already in the current directory
if [ ! -d "./server" ]; then
    error "Please run this script from the root of your application directory"
fi

# Copy application files to release directory
sudo -u "$APP_USER" mkdir -p "$RELEASE_DIR"
sudo -u "$APP_USER" cp -r ./* "$RELEASE_DIR/"

# Copy health monitor script to shared directory
mkdir -p "$APP_DIR/shared"
cp "./deploy/health-monitor.sh" "$APP_DIR/shared/health-monitor.sh"
chmod +x "$APP_DIR/shared/health-monitor.sh"
chown "$APP_USER:$APP_USER" "$APP_DIR/shared/health-monitor.sh"

# Install dependencies and build
cd "$RELEASE_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

# Copy SSL certificate
if [ -f "./singlestore-bundle.pem" ]; then
    cp "./singlestore-bundle.pem" "$APP_DIR/shared/certs/"
    ln -sf "$APP_DIR/shared/certs/singlestore-bundle.pem" "$RELEASE_DIR/singlestore-bundle.pem"
    chown "$APP_USER:$APP_USER" "$APP_DIR/shared/certs/singlestore-bundle.pem"
    log "SSL certificate copied and linked"
else
    warn "SSL certificate (singlestore-bundle.pem) not found. Please copy it manually."
fi

# Step 4: Environment configuration
log "Step 4: Setting up environment configuration..."

mkdir -p /etc/"$APP_NAME"

if [ ! -f "/etc/$APP_NAME/$APP_NAME.env" ]; then
    cp "./deploy/environment.template" "/etc/$APP_NAME/$APP_NAME.env"
    chmod 600 "/etc/$APP_NAME/$APP_NAME.env"
    chown root:root "/etc/$APP_NAME/$APP_NAME.env"
    warn "Environment file created at /etc/$APP_NAME/$APP_NAME.env"
    warn "Please edit this file with your actual database configuration!"
else
    log "Environment file already exists"
fi

# Step 5: Systemd service setup
log "Step 5: Setting up systemd service..."

cp "./deploy/lawyer.service" "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload

# Create symlink to current release
ln -sfn "$RELEASE_DIR" "$APP_DIR/current"
chown -h "$APP_USER:$APP_USER" "$APP_DIR/current"

# Step 6: NGINX configuration
log "Step 6: Setting up NGINX reverse proxy..."

if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi

# Copy NGINX configuration (HTTP only initially)
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "./deploy/nginx-site.conf" > "/etc/nginx/sites-available/$APP_NAME"
ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/"

# Test NGINX configuration
nginx -t || error "NGINX configuration test failed"

# Step 7: SSL certificate with Certbot
log "Step 7: Setting up SSL certificate..."

if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
fi

# Enable and start services
systemctl enable "$SERVICE_NAME"
systemctl enable nginx

log "Deployment setup complete!"
echo
warn "IMPORTANT: Complete these final steps:"
echo "1. Edit /etc/$APP_NAME/$APP_NAME.env with your actual database configuration"
echo "2. Update the domain name in this script and NGINX config"
echo "3. Run the following commands to finish deployment:"
echo
echo "   # Start the application"
echo "   systemctl start $SERVICE_NAME"
echo
echo "   # Restart NGINX"
echo "   systemctl reload nginx"
echo
echo "   # Obtain SSL certificate (replace with your domain)"
echo "   certbot --nginx -d $DOMAIN"
echo
echo "   # Check application status"
echo "   systemctl status $SERVICE_NAME"
echo "   curl -k https://$DOMAIN/health"
echo
log "Application will be available at: https://$DOMAIN"
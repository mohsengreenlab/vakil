#!/bin/bash
set -e

# Persian Legal Firm - Post-SSL Setup Script
# Run this after the main deployment to configure SSL with Certbot

# Configuration
APP_NAME="lawyer"
DOMAIN="lawyer.partnersystems.online"  # CHANGE THIS TO YOUR DOMAIN

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

# Install Certbot if not already installed
if ! command -v certbot &> /dev/null; then
    log "Installing Certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Obtain SSL certificate
log "Obtaining SSL certificate for $DOMAIN..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email webmaster@"$DOMAIN"

# Test NGINX configuration after SSL setup
nginx -t || error "NGINX configuration test failed after SSL setup"

# Reload NGINX
systemctl reload nginx

log "SSL setup completed successfully!"
log "Your application is now available at: https://$DOMAIN"

# Test the secured endpoint
log "Testing secured endpoint..."
if curl -f -s "https://$DOMAIN/health" > /dev/null; then
    log "✅ HTTPS health check passed"
else
    warn "⚠️ HTTPS health check failed - please verify manually"
fi

echo
log "SSL certificate will auto-renew. Test renewal with:"
echo "  sudo certbot renew --dry-run"

#!/bin/bash
set -e

# Persian Legal Firm - Rollback Script
# Use this script to rollback to a previous deployment

# Configuration
APP_NAME="lawyer"
APP_USER="lawyer"
APP_DIR="/srv/lawyer"
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

# Check if releases directory exists
if [ ! -d "$APP_DIR/releases" ]; then
    error "Releases directory not found. Nothing to rollback to."
fi

# List available releases
log "Available releases:"
releases=($(ls -1t "$APP_DIR/releases" 2>/dev/null))

if [ ${#releases[@]} -eq 0 ]; then
    error "No releases found for rollback"
fi

if [ ${#releases[@]} -eq 1 ]; then
    error "Only one release found. Cannot rollback."
fi

# Show current release
current_release=$(readlink "$APP_DIR/current" 2>/dev/null | xargs basename 2>/dev/null || echo "none")
log "Current release: $current_release"

echo
echo "Available releases (newest first):"
for i in "${!releases[@]}"; do
    release="${releases[$i]}"
    if [ "$release" = "$current_release" ]; then
        echo "  $((i+1)). $release (CURRENT)"
    else
        echo "  $((i+1)). $release"
    fi
done

echo
read -p "Select release number to rollback to (1-${#releases[@]}): " selection

# Validate selection
if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#releases[@]} ]; then
    error "Invalid selection"
fi

target_release="${releases[$((selection-1))]}"

if [ "$target_release" = "$current_release" ]; then
    error "Cannot rollback to the current release"
fi

log "Rolling back to: $target_release"

# Confirm rollback
echo
warn "This will rollback the application to release: $target_release"
read -p "Are you sure? (y/N): " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    log "Rollback cancelled"
    exit 0
fi

# Perform rollback
log "Starting rollback process..."

# Stop the service
log "Stopping $SERVICE_NAME service..."
systemctl stop "$SERVICE_NAME" || warn "Failed to stop service (may not be running)"

# Update symlink
log "Updating current release symlink..."
ln -sfn "$APP_DIR/releases/$target_release" "$APP_DIR/current"
chown -h "$APP_USER:$APP_USER" "$APP_DIR/current"

# Start the service
log "Starting $SERVICE_NAME service..."
systemctl start "$SERVICE_NAME"

# Wait a moment for startup
sleep 3

# Check service status
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "Service started successfully"
else
    error "Service failed to start after rollback. Check logs: journalctl -u $SERVICE_NAME"
fi

# Test health endpoint
log "Testing application health..."
if curl -f -s http://localhost:3008/health > /dev/null; then
    log "Health check passed"
else
    warn "Health check failed. Application may not be responding correctly."
fi

log "Rollback completed successfully!"
log "Current release: $target_release"

echo
log "Verify the rollback:"
echo "  systemctl status $SERVICE_NAME"
echo "  curl http://localhost:3008/health"
echo "  journalctl -u $SERVICE_NAME -f"
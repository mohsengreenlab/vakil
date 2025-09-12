#!/bin/bash

# Persian Legal Firm - Health Monitor Script
# Add this to cron for continuous health monitoring
# Example cron entry (check every 5 minutes):
# */5 * * * * /srv/lawyer/shared/health-monitor.sh

# Configuration
APP_NAME="lawyer"
SERVICE_NAME="lawyer"
HEALTH_URL="http://localhost:3008/health"
LOG_FILE="/var/log/lawyer-health.log"
MAX_FAILURES=3
FAILURE_COUNT_FILE="/tmp/lawyer-failures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "$(date +'%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

# Check if service is running
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    log "${RED}[CRITICAL] Service $SERVICE_NAME is not running${NC}"
    
    # Try to restart the service
    log "${YELLOW}[ACTION] Attempting to restart $SERVICE_NAME${NC}"
    systemctl restart "$SERVICE_NAME"
    
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "${GREEN}[RECOVERY] Service $SERVICE_NAME restarted successfully${NC}"
        # Reset failure count
        rm -f "$FAILURE_COUNT_FILE"
    else
        log "${RED}[CRITICAL] Failed to restart $SERVICE_NAME. Manual intervention required.${NC}"
        exit 1
    fi
fi

# Check health endpoint
response=$(curl -s -w "%{http_code}" -o /dev/null "$HEALTH_URL" --connect-timeout 10 --max-time 30)

if [ "$response" = "200" ]; then
    log "${GREEN}[OK] Health check passed (HTTP $response)${NC}"
    # Reset failure count on success
    rm -f "$FAILURE_COUNT_FILE"
else
    log "${RED}[ERROR] Health check failed (HTTP $response)${NC}"
    
    # Track failure count
    if [ -f "$FAILURE_COUNT_FILE" ]; then
        failure_count=$(cat "$FAILURE_COUNT_FILE")
    else
        failure_count=0
    fi
    
    failure_count=$((failure_count + 1))
    echo "$failure_count" > "$FAILURE_COUNT_FILE"
    
    log "${YELLOW}[WARNING] Failure count: $failure_count/$MAX_FAILURES${NC}"
    
    if [ "$failure_count" -ge "$MAX_FAILURES" ]; then
        log "${RED}[CRITICAL] Maximum failures reached. Restarting service.${NC}"
        
        systemctl restart "$SERVICE_NAME"
        sleep 5
        
        # Test again after restart
        response=$(curl -s -w "%{http_code}" -o /dev/null "$HEALTH_URL" --connect-timeout 10 --max-time 30)
        
        if [ "$response" = "200" ]; then
            log "${GREEN}[RECOVERY] Service recovered after restart${NC}"
            rm -f "$FAILURE_COUNT_FILE"
        else
            log "${RED}[CRITICAL] Service failed to recover. Manual intervention required.${NC}"
            # Could send alert here (email, Slack, etc.)
        fi
    fi
fi

# Check disk space
disk_usage=$(df /srv/lawyer | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -gt 80 ]; then
    log "${YELLOW}[WARNING] Disk usage high: ${disk_usage}%${NC}"
fi

# Clean old log entries (keep last 1000 lines)
if [ -f "$LOG_FILE" ]; then
    tail -n 1000 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi
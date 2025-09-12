# Persian Legal Firm - VPS Deployment Guide

This guide provides complete step-by-step instructions for deploying the Persian Legal Firm web application to your Ubuntu VPS with full isolation and zero conflicts with existing applications.

## Prerequisites

- Ubuntu VPS with root access
- Domain name pointed to your VPS IP address
- SingleStore database credentials
- Ports 80 and 443 available for web traffic

## Directory Structure

```
/srv/lawyer/
├── releases/           # Timestamped application releases
│   ├── 20250912_120000/
│   └── 20250912_140000/
├── shared/            # Shared files across releases
│   ├── certs/         # SSL certificates
│   └── logs/          # Application logs
└── current -> releases/latest  # Symlink to current release
```

## Configuration Files

- **Environment**: `/etc/lawyer/lawyer.env`
- **Systemd Service**: `/etc/systemd/system/lawyer.service`
- **NGINX Config**: `/etc/nginx/sites-available/lawyer`

## Deployment Process

### 1. Prepare Your Domain

Update the domain name in the deployment scripts:
Domain is pre-configured as `lawyer.partnersystems.online`

### 2. Configure Database Connection

Copy and edit the environment template:
```bash
cp deploy/environment.template /etc/lawyer/lawyer.env
chmod 600 /etc/lawyer/lawyer.env
```

Required environment variables:
```bash
# Database Configuration
DB_HOST=your-singlestore-host.com
DB_PORT=3333
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_secure_password

# Application Security
SESSION_SECRET=generate-strong-random-secret
```

### 3. Deploy Application

Run the deployment script:
```bash
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

### 4. Start Services

```bash
# Start the application
sudo systemctl start lawyer

# Start NGINX
sudo systemctl reload nginx

# Check application status
sudo systemctl status lawyer
curl http://localhost:5000/health
```

### 5. Setup SSL Certificate

```bash
# Install Certbot if not already installed
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

## Application Management

### Check Application Status
```bash
sudo systemctl status lawyer
sudo journalctl -u lawyer -f
curl https://your-domain.com/health
```

### View Logs
```bash
# Application logs
sudo journalctl -u lawyer -f

# NGINX logs
sudo tail -f /var/log/nginx/lawyer.access.log
sudo tail -f /var/log/nginx/lawyer.error.log
```

### Restart Application
```bash
sudo systemctl restart lawyer
```

## Rollback Procedure

Use the rollback script to revert to a previous release:
```bash
chmod +x deploy/rollback.sh
sudo ./deploy/rollback.sh
```

The script will:
1. Show available releases
2. Allow you to select a previous version
3. Update the symlink atomically
4. Restart the service
5. Verify the rollback

## Health Monitoring

Set up automatic health monitoring:
```bash
# Copy health monitor script
sudo cp deploy/health-monitor.sh /srv/lawyer/shared/
sudo chmod +x /srv/lawyer/shared/health-monitor.sh

# Add to crontab safely (check every 5 minutes)
(sudo crontab -l 2>/dev/null | grep -v "/srv/lawyer/shared/health-monitor.sh"; echo "*/5 * * * * /srv/lawyer/shared/health-monitor.sh") | sudo crontab -
```

## Security Considerations

1. **Database**: Environment variables stored securely in `/etc/lawyer/lawyer.env` (600 permissions)
2. **SSL/TLS**: Automatic HTTPS with Let's Encrypt certificates
3. **Firewall**: Only ports 80 and 443 exposed externally
4. **Application**: Runs as dedicated `lawyer` user with limited privileges
5. **Isolation**: Complete separation from other applications on ports 3001-3007

## Troubleshooting

### Service Won't Start
```bash
# Check detailed logs
sudo journalctl -u lawyer -xe

# Check environment file
sudo cat /etc/lawyer/lawyer.env

# Test configuration
cd /srv/lawyer/current && sudo -u lawyer node dist/index.js
```

### Database Connection Issues
```bash
# Verify environment variables
sudo grep DB_ /etc/lawyer/lawyer.env

# Test database connectivity
# Update connection details and test from application directory
```

### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew

# Test NGINX configuration
sudo nginx -t
```

### Port Conflicts
The application uses port 5000 internally (isolated to localhost). This should not conflict with your existing applications on ports 8000, 3001-3007.

## Updating Database Configuration

To update database settings without code changes:

1. Edit environment file:
   ```bash
   sudo nano /etc/lawyer/lawyer.env
   ```

2. Restart application:
   ```bash
   sudo systemctl restart lawyer
   ```

3. Verify health:
   ```bash
   curl https://your-domain.com/health
   ```

## Monitoring and Maintenance

- **Health Check**: Automatic monitoring via cron job
- **Log Rotation**: Handled by systemd journal
- **SSL Renewal**: Automatic via Certbot
- **Updates**: Use deployment script for new releases
- **Backups**: Backup `/etc/lawyer/` and application data

## Support

For issues with this deployment:
1. Check application logs: `sudo journalctl -u lawyer -f`
2. Check NGINX logs: `sudo tail -f /var/log/nginx/lawyer.error.log`
3. Verify health endpoint: `curl https://your-domain.com/health`
4. Use rollback script if needed: `sudo ./deploy/rollback.sh`
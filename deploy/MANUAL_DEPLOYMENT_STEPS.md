# Persian Legal Firm - Manual Deployment Steps

This guide provides step-by-step manual deployment instructions for the lawyer.partnersystems.online web application on Ubuntu VPS.

## Prerequisites
- Ubuntu VPS with root access
- Domain `lawyer.partnersystems.online` pointed to your VPS IP
- SingleStore database credentials ready

---

## Step 1: Create System User and Directories

```bash
# Create dedicated user with bash shell
sudo useradd --shell /bin/bash --home-dir /home/lawyer --create-home lawyer

# Create application directory structure
sudo mkdir -p /home/lawyer/{releases,shared/{certs,logs}}
sudo chown -R lawyer:lawyer /home/lawyer

# Create environment config directory
sudo mkdir -p /etc/lawyer
sudo chown root:root /etc/lawyer
sudo chmod 755 /etc/lawyer

# Verify user and directories created
id lawyer
ls -la /home/lawyer
ls -la /etc/lawyer
```

---

## Step 2: Install Build Dependencies

```bash
# Update package list
sudo apt-get update

# Install essential build tools
sudo apt-get install -y git build-essential python3-minimal curl

# Verify installations
git --version
gcc --version
python3 --version
```

---

## Step 3: Install Isolated Node.js via nvm

```bash
# Switch to lawyer user's home directory
sudo su - lawyer -s /bin/bash

# Set HOME for the session
export HOME="/home/lawyer"
cd /home/lawyer

# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload nvm
export NVM_DIR="/home/lawyer/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install and use Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify Node.js installation
node --version
npm --version

# Exit back to root
exit
```

---

## Step 4: Clone and Deploy Application

```bash
# Clone your repository to temporary location
cd /tmp
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name

# Create timestamped release directory
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
RELEASE_DIR="/home/lawyer/releases/$TIMESTAMP"
sudo mkdir -p "$RELEASE_DIR"

# Copy application files to release directory
sudo cp -r ./* "$RELEASE_DIR/"
sudo chown -R lawyer:lawyer "$RELEASE_DIR"

# Copy health monitor script
sudo cp "./deploy/health-monitor.sh" "/home/lawyer/shared/health-monitor.sh"
sudo chmod +x "/home/lawyer/shared/health-monitor.sh"
sudo chown lawyer:lawyer "/home/lawyer/shared/health-monitor.sh"
```

---

## Step 5: Build Application

```bash
# Switch to release directory
cd "$RELEASE_DIR"

# Build as lawyer user with isolated Node.js
sudo -u lawyer bash -c "
    export HOME='/home/lawyer'
    export NVM_DIR='/home/lawyer/.nvm'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\"
    nvm use 20
    npm ci
    npm run build
"

# Verify build completed
ls -la "$RELEASE_DIR/dist/"
```

---

## Step 6: Create Environment Configuration

```bash
# Copy environment template
sudo cp "$RELEASE_DIR/deploy/environment.template" "/etc/lawyer/lawyer.env"
sudo chown root:root "/etc/lawyer/lawyer.env"
sudo chmod 600 "/etc/lawyer/lawyer.env"

# Edit environment file with your database credentials
sudo nano /etc/lawyer/lawyer.env
```

**Configure these variables:**
```bash
NODE_ENV=production
PORT=3008
SESSION_SECRET=GENERATE_STRONG_RANDOM_SECRET_HERE

# Your SingleStore Database Details
DB_HOST=your-singlestore-host.com
DB_PORT=3333
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_secure_password
```

**Generate session secret:**
```bash
# Generate a strong session secret
openssl rand -base64 32
```

---

## Step 7: Set Up Systemd Service

```bash
# Copy systemd service file
sudo cp "$RELEASE_DIR/deploy/lawyer.service" "/etc/systemd/system/lawyer.service"

# Reload systemd
sudo systemctl daemon-reload

# Create symlink to current release
sudo ln -sfn "$RELEASE_DIR" "/home/lawyer/current"
sudo chown -h lawyer:lawyer "/home/lawyer/current"

# Enable service (don't start yet)
sudo systemctl enable lawyer

# Verify service file is correct
sudo systemctl cat lawyer
```

---

## Step 8: Install and Configure NGINX

```bash
# Install NGINX if not present
sudo apt-get install -y nginx

# Create NGINX site configuration
sudo sed "s/DOMAIN_PLACEHOLDER/lawyer.partnersystems.online/g" "$RELEASE_DIR/deploy/nginx-site.conf" > "/etc/nginx/sites-available/lawyer"

# Enable the site
sudo ln -sf "/etc/nginx/sites-available/lawyer" "/etc/nginx/sites-enabled/"

# Test NGINX configuration
sudo nginx -t

# If test passes, reload NGINX
sudo systemctl reload nginx

# Verify NGINX is running
sudo systemctl status nginx
```

---

## Step 9: Start Application

```bash
# Start the lawyer application
sudo systemctl start lawyer

# Check service status
sudo systemctl status lawyer

# View logs if there are issues
sudo journalctl -u lawyer -f

# Test health endpoint
curl http://localhost:3008/health

# Test via NGINX (should work if domain is pointed to your VPS)
curl -H "Host: lawyer.partnersystems.online" http://localhost/health
```

---

## Step 10: Set Up SSL Certificate

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain SSL certificate for your domain
sudo certbot --nginx -d lawyer.partnersystems.online

# Test automatic renewal
sudo certbot renew --dry-run

# Verify HTTPS is working
curl https://lawyer.partnersystems.online/health
```

---

## Step 11: Set Up Health Monitoring (Optional)

```bash
# Add cron job for health monitoring (every 5 minutes)
(sudo crontab -l 2>/dev/null | grep -v "/home/lawyer/shared/health-monitor.sh"; echo "*/5 * * * * /home/lawyer/shared/health-monitor.sh") | sudo crontab -

# Verify cron job was added
sudo crontab -l

# Test health monitor manually
sudo /home/lawyer/shared/health-monitor.sh
```

---

## Verification Checklist

Check each item to ensure deployment was successful:

- [ ] **User Created**: `id lawyer` shows system user
- [ ] **Directories**: `/home/lawyer/` structure exists with proper ownership
- [ ] **Node.js Isolated**: `/home/lawyer/.nvm/versions/node/` contains v20.x
- [ ] **Application Built**: `/home/lawyer/current/dist/` contains built files
- [ ] **Environment Config**: `/etc/lawyer/lawyer.env` has your database credentials
- [ ] **Service Running**: `sudo systemctl status lawyer` shows active
- [ ] **Health Check**: `curl http://localhost:3008/health` returns success
- [ ] **NGINX Working**: `curl -H "Host: lawyer.partnersystems.online" http://localhost/` loads
- [ ] **SSL Active**: `curl https://lawyer.partnersystems.online/health` works
- [ ] **Domain Resolves**: Visit `https://lawyer.partnersystems.online` in browser

---

## Troubleshooting Commands

```bash
# Check service logs
sudo journalctl -u lawyer -f

# Check NGINX logs
sudo tail -f /var/log/nginx/lawyer.error.log

# Test database connection
cd /home/lawyer/current && sudo -u lawyer node -e "console.log('Testing DB connection...')"

# Restart services
sudo systemctl restart lawyer
sudo systemctl reload nginx

# Check which ports are in use
sudo netstat -tlnp | grep :3008
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

---

## Clean Up

```bash
# Remove temporary clone
rm -rf /tmp/your-repo-name

# Your application is now running at:
# https://lawyer.partnersystems.online
```

## Next Deployment

For future deployments, you can:
1. Clone the updated repository
2. Repeat steps 4-5 (create new release and build)
3. Update the symlink in step 7: `sudo ln -sfn /home/lawyer/releases/NEW_TIMESTAMP /home/lawyer/current`
4. Restart the service: `sudo systemctl restart lawyer`

The previous release will remain in `/home/lawyer/releases/` for easy rollback if needed.
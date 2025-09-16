import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import expressEjsLayouts from "express-ejs-layouts";
import session from "express-session";
import bcrypt from "bcrypt";
import { SingleStoreStorage } from "./singlestore.js";
import type { IStorage } from "./storage.js";
import { getConfig } from "./config.js";
import { registerRoutes } from "./routes.js";

const app = express();

// Initialize configuration (only in production)
const isProduction = process.env.NODE_ENV === 'production';
let config: any;

if (isProduction) {
  config = getConfig();
  // Configure app for production
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }
}

// Initialize storage and start server
async function initializeApp() {
  let storage: IStorage;

  try {
    storage = new SingleStoreStorage();
    console.log(`🗄️  Using SingleStore database connection`);
    
    // Test database connectivity before starting server in production
    if (isProduction) {
      console.log('🔍 Testing database connectivity...');
      const connection = await (storage as any).pool.getConnection();
      await connection.ping();
      connection.release();
      console.log('✅ Database connectivity verified');
    }
  } catch (error) {
    console.error('❌ Failed to initialize database connection:', error);
    if (isProduction) {
      console.error('📋 Required environment variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
    } else {
      console.error('📋 Required environment variable: SINGLESTORE_PASSWORD');
    }
    process.exit(1);
  }

  return storage;
}

// Initialize storage
let storage: IStorage;

// Set EJS as templating engine with layouts
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));
app.use(expressEjsLayouts);
app.set('layout', 'layouts/main');

// Serve static files
app.use(express.static(path.join(process.cwd(), 'public')));

// Body parsing middleware (for form submissions)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: isProduction ? config.sessionSecret : (process.env.SESSION_SECRET || 'your-secret-key-here'),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction ? config.secureCookies : false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Extend session type
declare module 'express-session' {
  interface SessionData {
    adminId?: string;
    adminUsername?: string;
    clientId?: string;
    clientNationalId?: string;
  }
}

// Authentication middleware for HTML pages (redirects to login)
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/admin24');
  }
};

// Authentication middleware for API endpoints (returns JSON)
const requireAuthAPI = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.adminId) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'دسترسی غیر مجاز - احراز هویت مدیر الزامی است' });
  }
};

// QA API routes
app.get('/api/qa', async (req, res) => {
  try {
    const qaItems = await storage.getPublicQAItems();
    res.json({ success: true, items: qaItems });
  } catch (error) {
    console.error('Error getting public QA items:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت پرسش و پاسخ‌ها' });
  }
});

// Admin QA routes (protected)
app.get('/api/admin/qa', requireAuthAPI, async (req, res) => {
  try {
    const qaItems = await storage.getAllQAItems();
    res.json({ success: true, items: qaItems });
  } catch (error) {
    console.error('Error getting all QA items:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت پرسش و پاسخ‌ها' });
  }
});

app.post('/api/admin/qa', requireAuthAPI, async (req, res) => {
  try {
    const { question, answer, topic, show } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        success: false, 
        message: 'سوال و پاسخ الزامی است' 
      });
    }

    const qaData = {
      question,
      answer,
      topic: topic || 'عمومی',
      show: show !== undefined ? (show ? 1 : 0) : 1
    };


    const newQA = await storage.createQAItem(qaData);
    res.json({ success: true, item: newQA });
  } catch (error) {
    console.error('Error creating QA item:', error);
    res.status(500).json({ success: false, message: 'خطا در ایجاد پرسش و پاسخ' });
  }
});

app.put('/api/admin/qa/:id', requireAuthAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, topic, show } = req.body;
    
    const qaData: any = {};
    if (question !== undefined) qaData.question = question;
    if (answer !== undefined) qaData.answer = answer;
    if (topic !== undefined) qaData.topic = topic;
    if (show !== undefined) qaData.show = show ? 1 : 0;

    const updatedQA = await storage.updateQAItem(id, qaData);
    if (updatedQA) {
      res.json({ success: true, item: updatedQA });
    } else {
      res.status(404).json({ success: false, message: 'پرسش و پاسخ یافت نشد' });
    }
  } catch (error) {
    console.error('Error updating QA item:', error);
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی پرسش و پاسخ' });
  }
});

app.delete('/api/admin/qa/:id', requireAuthAPI, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await storage.deleteQAItem(id);
    
    if (deleted) {
      res.json({ success: true, message: 'پرسش و پاسخ حذف شد' });
    } else {
      res.status(404).json({ success: false, message: 'پرسش و پاسخ یافت نشد' });
    }
  } catch (error) {
    console.error('Error deleting QA item:', error);
    res.status(500).json({ success: false, message: 'خطا در حذف پرسش و پاسخ' });
  }
});

// Client login routes
app.get('/login', (req, res) => {
  res.render('pages/client-login', { 
    title: 'ورود موکلان - دفتر وکالت پیشرو',
    page: 'client-login',
    error: null
  });
});

app.post('/api/client/login', async (req, res) => {
  try {
    const { nationalId, password } = req.body;
    
    if (!nationalId || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'کد ملی و رمز عبور الزامی است' 
      });
    }

    // Authenticate client
    const client = await storage.authenticateClient(nationalId, password);
    
    if (!client) {
      return res.status(401).json({ 
        success: false, 
        message: 'کد ملی یا رمز عبور اشتباه است' 
      });
    }
    
    // Set session
    req.session.clientId = client.client_id;
    req.session.clientNationalId = client.national_id;
    
    // Explicitly save session before responding to prevent race condition
    req.session.save((saveError) => {
      if (saveError) {
        console.error('Session save error:', saveError);
        return res.status(500).json({ 
          success: false, 
          message: 'خطای ذخیره جلسه. لطفاً مجدداً تلاش کنید.' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'ورود موفقیت‌آمیز',
        redirectUrl: '/client'
      });
    });
    
  } catch (error) {
    console.error('Error during client login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطای سرور. لطفاً مجدداً تلاش کنید.' 
    });
  }
});

app.post('/api/client/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying client session:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'خطا در خروج' 
      });
    }
    res.json({ 
      success: true, 
      message: 'خروج موفقیت‌آمیز' 
    });
  });
});

// Client authentication middleware
const requireClientAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.clientId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// HTML escaping function to prevent XSS attacks
function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Safe date formatting function
function formatDate(date: any): string {
  if (!date) return 'تاریخ نامشخص';
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return 'تاریخ نامعتبر';
    return dateObj.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'خطا در نمایش تاریخ';
  }
}

// Client landing page route
app.get('/client', requireClientAuth, async (req, res) => {
  try {
    const client = await storage.getClient(req.session.clientId);
    res.render('pages/client-landing', { 
      title: 'پورتال موکل - دفتر وکالت پیشرو',
      page: 'client-landing',
      client,
      layout: false // Don't use main layout for client landing page
    });
  } catch (error) {
    console.error('Error loading client landing:', error);
    res.status(500).render('pages/500', {
      title: 'خطای سرور',
      page: 'error'
    });
  }
});

// Client upload documents page
app.get('/client/upload-documents', requireClientAuth, (req, res) => {
  res.render('pages/client-upload-documents', { 
    title: 'ارسال مدارک - دفتر وکالت پیشرو',
    page: 'client-upload-documents',
    layout: false // Don't use main layout for client upload page
  });
});

// Client send message page
app.get('/client/send-message', requireClientAuth, (req, res) => {
  res.render('pages/client-send-message', { 
    title: 'ارسال پیام - دفتر وکالت پیشرو',
    page: 'client-send-message',
    layout: false // Don't use main layout for client send message page
  });
});

// Client portal route
app.get('/client/portal', requireClientAuth, async (req, res) => {
  try {
    console.log('Loading client portal for client ID:', req.session.clientId);
    
    const clientCaseEvents = await storage.getClientCaseEvents(req.session.clientId);
    console.log('Client case events loaded:', clientCaseEvents);
    
    const client = await storage.getClient(req.session.clientId);
    console.log('Client data loaded:', client);
    
    try {
      // Build cases HTML with events/history - with defensive programming
      let casesHtml = '';
      if (Array.isArray(clientCaseEvents) && clientCaseEvents.length > 0) {
        for (const caseEventItem of clientCaseEvents) {
          // Safely validate data shape before destructuring
          if (!caseEventItem || typeof caseEventItem !== 'object') continue;
          
          const caseItem = caseEventItem.case;
          const events = caseEventItem.events;
          
          // Skip if case data is missing
          if (!caseItem) continue;
          // Fix field name access - use snake_case from database
          const rawStatus = (caseItem as any).last_case_status || 'pending';
          const status = rawStatus === 'lawyer-study' ? 'در حال مطالعه وکیل' : 
                        rawStatus === 'active' ? 'فعال' : 
                        rawStatus === 'in-progress' ? 'در حال انجام' :
                        rawStatus === 'pending' ? 'در انتظار' :
                        escapeHtml(rawStatus);
          
          let eventsHtml = '';
          if (Array.isArray(events) && events.length > 0) {
            eventsHtml = '<div class="case-events"><h4>تاریخچه پرونده:</h4>';
            for (const event of events) {
              // Skip invalid event objects
              if (!event || typeof event !== 'object') continue;
              
              // Fix field name access and add HTML escaping
              const eventDate = formatDate((event as any).occurred_at || (event as any).occurredAt);
              const eventType = escapeHtml((event as any).event_type || (event as any).eventType || 'رویداد');
              const eventDetails = (event as any).details ? escapeHtml((event as any).details) : '';
              
              eventsHtml += `
                <div class="event">
                  <div class="event-header">
                    <span class="event-type">${eventType}</span>
                    <span class="event-date">${eventDate}</span>
                  </div>
                  ${eventDetails ? `<p class="event-details">${eventDetails}</p>` : ''}
                </div>
              `;
            }
            eventsHtml += '</div>';
          } else {
            eventsHtml = '<div class="no-events"><p>هنوز رویدادی برای این پرونده ثبت نشده است.</p></div>';
          }
          
          // Fix field name access and add HTML escaping
          const caseId = escapeHtml((caseItem as any).case_id || (caseItem as any).caseId || 'نامشخص');
          const caseCreationDate = formatDate((caseItem as any).case_creation_date || (caseItem as any).caseCreationDate);
          
          casesHtml += `
            <div class="case">
              <h3>شماره پرونده: ${caseId}</h3>
              <span class="status">${status}</span>
              <p>تاریخ ایجاد: ${caseCreationDate}</p>
              ${eventsHtml}
            </div>
          `;
        }
      } else {
        casesHtml = '<p>هنوز پرونده‌ای ثبت نشده است.</p>';
      }
      
      const html = `
        <!DOCTYPE html>
        <html lang="fa" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>پورتال موکل</title>
            <style>
                body { font-family: Tahoma; margin: 20px; background: #f5f5f5; direction: rtl; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; }
                .header { background: #2563eb; color: white; padding: 20px; margin-bottom: 20px; position: relative; }
                .case { border: 1px solid #ddd; padding: 15px; margin: 10px 0; }
                .status { background: #f3e8ff; color: #7c3aed; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
                .case-events { margin-top: 15px; }
                .case-events h4 { color: #2563eb; margin-bottom: 10px; }
                .event { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
                .event-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                .event-type { background: #dbeafe; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
                .event-date { color: #64748b; font-size: 12px; }
                .event-details { margin: 8px 0 0 0; color: #374151; font-size: 13px; line-height: 1.4; }
                .no-events { margin-top: 15px; padding: 12px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; }
                .no-events p { margin: 0; color: #92400e; }
                .logout-btn { 
                    position: absolute; 
                    top: 20px; 
                    left: 20px; 
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white; 
                    border: none; 
                    padding: 12px 24px; 
                    border-radius: 8px; 
                    cursor: pointer; 
                    font-family: Tahoma;
                    font-size: 14px;
                    font-weight: 600;
                    box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
                    transition: all 0.2s ease;
                    z-index: 10;
                }
                .logout-btn:hover { 
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(220, 38, 38, 0.3);
                }
                .logout-btn:active {
                    transform: translateY(0);
                    box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <button class="logout-btn" onclick="logout()">خروج</button>
                    <h1>پورتال موکل - دفتر وکالت پیشرو</h1>
                    <p>خوش آمدید، ${escapeHtml((client as any)?.first_name || (client as any)?.firstName || '')} ${escapeHtml((client as any)?.last_name || (client as any)?.lastName || '')}</p>
                    <p>کد ملی: ${escapeHtml((client as any)?.national_id || (client as any)?.nationalId || '')}</p>
                </div>
                <h2>پرونده‌های شما</h2>
                ${casesHtml}
                <h2>اطلاعات تماس</h2>
                <p>تلفن: ۰۲۱-۸۸۷۷۶۶۵۵</p>
                <p>ایمیل: info@pishrolawfirm.ir</p>
            </div>
            <script>
                function logout() {
                    if (confirm('آیا مطمئن هستید که می‌خواهید خارج شوید؟')) {
                        fetch('/api/client/logout', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                window.location.href = '/';
                            } else {
                                alert('خطا در خروج: ' + data.message);
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            alert('خطا در خروج');
                        });
                    }
                }
            </script>
        </body>
        </html>
      `;
    
      res.send(html);
    } catch (htmlError) {
      console.error('Error generating HTML:', htmlError);
      const safeFirstName = escapeHtml((client as any)?.first_name || (client as any)?.firstName || 'Unknown');
      const safeLastName = escapeHtml((client as any)?.last_name || (client as any)?.lastName || 'User');
      const safeNationalId = escapeHtml((client as any)?.national_id || (client as any)?.nationalId || 'N/A');
      const caseCount = clientCaseEvents?.length || 0;
      res.send(`<html><body><h1>Client Portal - ${safeFirstName} ${safeLastName}</h1><p>National ID: ${safeNationalId}</p><p>Cases: ${caseCount}</p></body></html>`);
    }
  } catch (error) {
    // Log error details server-side for debugging
    console.error('Error loading client portal:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    // Send generic error message to client to prevent information disclosure
    res.status(500).send(`
      <html lang="fa" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>خطای سرور</title>
          <style>
            body { font-family: Tahoma; margin: 20px; background: #f5f5f5; direction: rtl; text-align: center; }
            .error-container { max-width: 400px; margin: 50px auto; padding: 30px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #dc2626; margin-bottom: 20px; }
            p { color: #374151; line-height: 1.6; margin-bottom: 20px; }
            .retry-link { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>خطای موقتی</h1>
            <p>متأسفانه در حال حاضر امکان نمایش اطلاعات پورتال موکل وجود ندارد.</p>
            <p>لطفاً چند لحظه بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.</p>
            <p><a href="/" class="retry-link">بازگشت به صفحه اصلی</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// Health check endpoint for production deployment
app.get('/health', async (req, res) => {
  try {
    // Test database connectivity
    const connection = await (storage as any).pool.getConnection();
    await connection.ping();
    connection.release();
    
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// Static Routes
// Home page
app.get('/', (req, res) => {
  res.render('pages/home', { 
    title: 'دفتر وکالت پیشرو | Persian Legal Firm',
    page: 'home'
  });
});

// Services page
app.get('/services', (req, res) => {
  res.render('pages/services', { 
    title: 'خدمات - دفتر وکالت پیشرو',
    page: 'services'
  });
});

// QA page
app.get('/qa', (req, res) => {
  res.render('pages/qa', { 
    title: 'پرسش و پاسخ حقوقی - دفتر وکالت پیشرو',
    page: 'qa'
  });
});

// Contact page
app.get('/contact', (req, res) => {
  res.render('pages/contact', { 
    title: 'تماس با ما - دفتر وکالت پیشرو',
    page: 'contact'
  });
});

// Client login page
app.get('/client-login', (req, res) => {
  res.render('pages/client-login', { 
    title: 'ورود موکلان - دفتر وکالت پیشرو',
    page: 'client-login'
  });
});

// Admin login page
app.get('/admin24', (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.session.adminId) {
    return res.redirect('/admin24/dashboard');
  }
  
  res.render('pages/admin-login', { 
    title: 'ورود مدیر - دفتر وکالت پیشرو',
    layout: false // Don't use main layout for login page
  });
});

// Admin dashboard (protected route)
app.get('/admin24/dashboard', requireAuth, async (req, res) => {
  try {
    const cases = await storage.getAllCases();
    const contacts = await storage.getAllContacts();
    
    res.render('pages/admin', { 
      title: 'پنل مدیریت - دفتر وکالت پیشرو',
      page: 'admin',
      cases: cases,
      contacts: contacts,
      adminUsername: req.session.adminUsername
    });
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    res.status(500).render('pages/500', {
      title: 'خطای داخلی سرور',
      error: 'خطا در بارگذاری اطلاعات'
    });
  }
});

// Admin test endpoint to create a client for testing login
app.post('/api/admin/create-test-client', requireAuthAPI, async (req, res) => {
  try {
    const connection = await (storage as any).pool.getConnection();
    
    const clientId = Math.floor(1000 + Math.random() * 9000).toString();
    const nationalId = '2222222222';
    
    // Insert client with plain text password for testing
    await connection.execute(
      'INSERT INTO clients (client_id, first_name, last_name, national_id, phone_numbers, password) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, 'تست', 'موکل', nationalId, JSON.stringify(['09123456789']), 'test123']
    );
    
    await connection.execute(
      'INSERT INTO national_id_registry (national_id, client_id) VALUES (?, ?)',
      [nationalId, clientId]
    );
    
    connection.release();
    
    res.json({
      success: true,
      message: 'Test client created successfully',
      clientId: clientId,
      nationalId: nationalId
    });
  } catch (error) {
    console.error('Error creating test client:', error);
    res.json({ 
      success: false, 
      error: error.message
    });
  }
});

// Admin login API endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'نام کاربری و رمز عبور الزامی است' 
      });
    }
    
    // Fetch admin from database
    const admin = await storage.getUserByUsername(username);
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'نام کاربری یا رمز عبور اشتباه است' 
      });
    }
    
    // Use bcrypt to properly hash and compare passwords
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'نام کاربری یا رمز عبور اشتباه است' 
      });
    }
    
    // Set session
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    
    res.json({ 
      success: true, 
      message: 'ورود موفقیت‌آمیز' 
    });
    
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطای سرور. لطفاً مجدداً تلاش کنید.' 
    });
  }
});

// Admin logout API endpoint
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'خطا در خروج' 
      });
    }
    res.json({ 
      success: true, 
      message: 'خروج موفقیت‌آمیز' 
    });
  });
});

// Admin API endpoints for clients management
app.get('/api/admin/clients', requireAuthAPI, async (req, res) => {
  try {
    const clients = await storage.getAllClients();
    res.json({ 
      success: true, 
      clients: clients 
    });
  } catch (error) {
    console.error('Error getting clients:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطا در بارگذاری موکلان' 
    });
  }
});

app.post('/api/admin/clients', requireAuthAPI, async (req, res) => {
  try {
    const { firstName, lastName, nationalId, phoneNumbers, password } = req.body;
    
    if (!firstName || !lastName || !nationalId || !phoneNumbers || phoneNumbers.length === 0 || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'تمام فیلدهای الزامی باید پر شوند' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' 
      });
    }
    
    // Validate national ID format (10 digits)
    if (!/^\d{10}$/.test(nationalId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'کد ملی باید ۱۰ رقم باشد' 
      });
    }
    
    const client = await storage.createClient(firstName, lastName, nationalId, phoneNumbers, password);
    res.json({ 
      success: true, 
      message: 'موکل با موفقیت اضافه شد',
      client: client 
    });
  } catch (error) {
    console.error('Error creating client:', error);
    if (error instanceof Error && error.message.includes('Duplicate entry')) {
      res.status(400).json({ 
        success: false, 
        message: 'کد ملی قبلاً ثبت شده است' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'خطا در ایجاد موکل' 
      });
    }
  }
});

// Admin API endpoints for cases management
app.get('/api/admin/cases', requireAuthAPI, async (req, res) => {
  try {
    const cases = await storage.getAllCases();
    res.json({ 
      success: true, 
      cases: cases 
    });
  } catch (error) {
    console.error('Error getting cases:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطا در بارگذاری پرونده‌ها' 
    });
  }
});

app.post('/api/admin/cases', requireAuthAPI, async (req, res) => {
  try {
    const { clientId, status, caseId } = req.body;
    
    if (!clientId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'شناسه موکل و وضعیت الزامی است' 
      });
    }
    
    // Check if client exists
    const client = await storage.getClient(clientId.toString());
    if (!client) {
      return res.status(400).json({ 
        success: false, 
        message: 'موکل با این شناسه یافت نشد' 
      });
    }
    
    const case_ = await storage.createCase(clientId, status, caseId);
    res.json({ 
      success: true, 
      message: 'پرونده با موفقیت اضافه شد',
      case: case_ 
    });
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطا در ایجاد پرونده' 
    });
  }
});

app.put('/api/admin/cases/:caseId/status', requireAuthAPI, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ 
        success: false, 
        message: 'وضعیت الزامی است' 
      });
    }
    
    // Use caseId as string (VARCHAR(7) in database)
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'شناسه پرونده نامعتبر است' 
      });
    }
    
    const updatedCase = await storage.updateCaseStatus(caseId, status);
    if (!updatedCase) {
      return res.status(404).json({ 
        success: false, 
        message: 'پرونده یافت نشد' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'وضعیت پرونده بروزرسانی شد',
      case: updatedCase 
    });
  } catch (error) {
    console.error('Error updating case status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطا در بروزرسانی وضعیت پرونده' 
    });
  }
});

// Convert contact message to client
app.post('/api/admin/convert-contact/:contactId', requireAuthAPI, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    const contact = await storage.getContact(contactId);
    if (!contact) {
      return res.status(404).json({ 
        success: false, 
        message: 'پیام یافت نشد' 
      });
    }
    
    // For now, we need a national ID to create a client
    // Since contacts don't have national ID, we'll need to ask admin to provide it
    // For this implementation, we'll use a placeholder
    res.status(400).json({ 
      success: false, 
      message: 'برای تبدیل پیام به موکل، کد ملی مورد نیاز است. لطفاً موکل را به صورت دستی اضافه کنید.' 
    });
  } catch (error) {
    console.error('Error converting contact:', error);
    res.status(500).json({ 
      success: false, 
      message: 'خطا در تبدیل پیام' 
    });
  }
});

// Form submission handlers (saving to SingleStore)
app.post('/api/case-review', async (req, res) => {
  try {
    const { clientName, clientPhone, clientEmail, caseType, urgency, description, hasLawyer } = req.body;
    
    await storage.createLegalCase({
      clientName,
      clientPhone,
      clientEmail: clientEmail || null,
      caseType,
      urgency: urgency || 'normal',
      description,
      hasLawyer: hasLawyer === 'true' || hasLawyer === true
    });
    
    res.json({ success: true, message: 'پرونده شما با موفقیت ثبت شد.' });
  } catch (error) {
    console.error('Error creating legal case:', error);
    res.status(500).json({ success: false, message: 'خطا در ثبت پرونده. لطفاً مجدداً تلاش کنید.' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, subject, message } = req.body;
    
    await storage.createContact({
      firstName,
      lastName,
      phone,
      email: email || null,
      subject,
      message
    });
    
    res.json({ success: true, message: 'پیام شما با موفقیت ارسال شد.' });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ success: false, message: 'خطا در ارسال پیام. لطفاً مجدداً تلاش کنید.' });
  }
});

// Admin file management API endpoints
app.get('/api/admin/clients/:clientId/files', requireAuthAPI, async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Verify client exists
    const client = await storage.getClient(clientId);
    if (!client) {
      return res.status(404).json({ 
        success: false, 
        message: 'موکل یافت نشد' 
      });
    }
    
    const files = await storage.getClientFiles(clientId);
    res.json({
      success: true,
      client: {
        id: client.clientId,
        name: `${client.firstName} ${client.lastName}`
      },
      files: files.map(file => ({
        id: file.id,
        fileName: file.fileName,
        originalFileName: file.originalFileName,
        uploadDate: file.uploadDate,
        description: file.description,
        fileSize: file.fileSize,
        mimeType: file.mimeType
      }))
    });
  } catch (error) {
    console.error('Error fetching client files for admin:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت فایل‌های موکل' });
  }
});

// Admin download client file
app.get('/api/admin/files/:fileId/download', requireAuthAPI, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = await storage.getClientFile(fileId);
    
    if (!file) {
      return res.status(404).json({ success: false, message: 'فایل یافت نشد' });
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.filePath)) {
      return res.status(404).json({ success: false, message: 'فایل فیزیکی یافت نشد' });
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalFileName)}"`);
    res.setHeader('Content-Type', file.mimeType);

    // Send file
    res.sendFile(path.resolve(file.filePath));
  } catch (error) {
    console.error('Error downloading file for admin:', error);
    res.status(500).json({ success: false, message: 'خطا در دانلود فایل' });
  }
});

// Error handling middleware will be registered after routes in startServer()

// Start server function
async function startServer() {
  // Initialize storage
  storage = await initializeApp();
  
  // Register API routes
  console.log('📝 Registering API routes...');
  try {
    await registerRoutes(app, storage);
    console.log('✅ API routes registered successfully');
  } catch (error) {
    console.error('❌ Failed to register API routes:', error);
  }

  // Error handling middleware (must be registered AFTER routes)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Render error page for HTML requests
    if (_req.accepts('html')) {
      res.status(status).render('pages/500', {
        title: 'خطای داخلی سرور',
        error: message
      });
    } else {
      res.status(status).json({ message });
    }
  });

  // 404 handler (must be registered AFTER routes)
  app.use((req, res) => {
    if (req.accepts('html')) {
      res.status(404).render('pages/404', {
        title: 'صفحه پیدا نشد'
      });
    } else {
      res.status(404).json({ message: 'Page not found' });
    }
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Persian Legal Firm server running at http://localhost:${port}`);
  });
}

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

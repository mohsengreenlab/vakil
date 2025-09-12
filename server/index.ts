import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import expressEjsLayouts from "express-ejs-layouts";
import session from "express-session";
import bcrypt from "bcrypt";
import { SingleStoreStorage } from "./singlestore.js";
import type { IStorage } from "./storage.js";

const app = express();

// Initialize storage with SingleStore database
let storage: IStorage;

// Initialize SingleStore database connection
if (!process.env.SINGLESTORE_PASSWORD) {
  throw new Error("SINGLESTORE_PASSWORD environment variable is required");
}

storage = new SingleStoreStorage();
console.log(`🗄️  Using SingleStore database connection`);

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
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
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

// Authentication middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/admin24');
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
app.get('/api/admin/qa', requireAuth, async (req, res) => {
  try {
    const qaItems = await storage.getAllQAItems();
    res.json({ success: true, items: qaItems });
  } catch (error) {
    console.error('Error getting all QA items:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت پرسش و پاسخ‌ها' });
  }
});

app.post('/api/admin/qa', requireAuth, async (req, res) => {
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

app.put('/api/admin/qa/:id', requireAuth, async (req, res) => {
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

app.delete('/api/admin/qa/:id', requireAuth, async (req, res) => {
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
        redirectUrl: '/client/portal'
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

// Client portal route
app.get('/client/portal', requireClientAuth, async (req, res) => {
  try {
    console.log('Loading client portal for client ID:', req.session.clientId);
    
    const clientCases = await storage.getClientCases(req.session.clientId);
    console.log('Client cases loaded:', clientCases);
    
    const client = await storage.getClient(req.session.clientId);
    console.log('Client data loaded:', client);
    
    try {
      // Build cases HTML
      let casesHtml = '';
      if (clientCases && clientCases.length > 0) {
        for (const caseItem of clientCases) {
          const status = caseItem.last_case_status === 'lawyer-study' ? 'در حال مطالعه وکیل' : 
                        caseItem.last_case_status === 'active' ? 'فعال' : 
                        caseItem.last_case_status;
          
          casesHtml += `
            <div class="case">
              <h3>شماره پرونده: ${caseItem.case_id}</h3>
              <span class="status">${status}</span>
              <p>تاریخ ایجاد: ${new Date(caseItem.case_creation_date).toLocaleDateString('fa-IR')}</p>
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
                .header { background: #2563eb; color: white; padding: 20px; margin-bottom: 20px; }
                .case { border: 1px solid #ddd; padding: 15px; margin: 10px 0; }
                .status { background: #f3e8ff; color: #7c3aed; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>پورتال موکل - دفتر وکالت پیشرو</h1>
                    <p>خوش آمدید، ${client.first_name} ${client.last_name}</p>
                    <p>کد ملی: ${client.national_id}</p>
                </div>
                <h2>پرونده‌های شما</h2>
                ${casesHtml}
                <h2>اطلاعات تماس</h2>
                <p>تلفن: ۰۲۱-۸۸۷۷۶۶۵۵</p>
                <p>ایمیل: info@pishrolawfirm.ir</p>
            </div>
        </body>
        </html>
      `;
    
      res.send(html);
    } catch (htmlError) {
      console.error('Error generating HTML:', htmlError);
      res.send(`<html><body><h1>Client Portal - ${client.first_name} ${client.last_name}</h1><p>National ID: ${client.national_id}</p><p>Cases: ${clientCases.length}</p></body></html>`);
    }
  } catch (error) {
    console.error('CATCH BLOCK EXECUTED! Error loading client portal:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send(`
      <html><head><meta charset="UTF-8"><title>Debug Error</title></head><body>
      <h1>Debug Error Information</h1>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><strong>Stack:</strong></p>
      <pre>${error.stack}</pre>
      </body></html>
    `);
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
app.post('/api/admin/create-test-client', requireAuth, async (req, res) => {
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
app.get('/api/admin/clients', requireAuth, async (req, res) => {
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

app.post('/api/admin/clients', requireAuth, async (req, res) => {
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
app.get('/api/admin/cases', requireAuth, async (req, res) => {
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

app.post('/api/admin/cases', requireAuth, async (req, res) => {
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

app.put('/api/admin/cases/:caseId/status', requireAuth, async (req, res) => {
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
app.post('/api/admin/convert-contact/:contactId', requireAuth, async (req, res) => {
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

// Error handling middleware
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

// 404 handler
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

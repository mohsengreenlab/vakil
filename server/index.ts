import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import expressEjsLayouts from "express-ejs-layouts";
import session from "express-session";
import bcrypt from "bcrypt";
import { SingleStoreStorage } from "./singlestore.js";

const app = express();

// Initialize storage
const storage = new SingleStoreStorage();

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

// Case review page
app.get('/case-review', (req, res) => {
  res.render('pages/case-review', { 
    title: 'بررسی پرونده حقوقی - دفتر وکالت پیشرو',
    page: 'case-review'
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
    const cases = await storage.getAllLegalCases();
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
    const bcrypt = require('bcrypt');
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
    const { firstName, lastName, nationalId, phoneNumbers } = req.body;
    
    if (!firstName || !lastName || !nationalId || !phoneNumbers || phoneNumbers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'تمام فیلدهای الزامی باید پر شوند' 
      });
    }
    
    // Validate national ID format (10 digits)
    if (!/^\d{10}$/.test(nationalId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'کد ملی باید ۱۰ رقم باشد' 
      });
    }
    
    const client = await storage.createClient(firstName, lastName, nationalId, phoneNumbers);
    res.json({ 
      success: true, 
      message: 'موکل با موفقیت اضافه شد',
      client: client 
    });
  } catch (error) {
    console.error('Error creating client:', error);
    if (error.message && error.message.includes('Duplicate entry')) {
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
    const { clientId, status } = req.body;
    
    if (!clientId || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'شناسه موکل و وضعیت الزامی است' 
      });
    }
    
    // Check if client exists
    const client = await storage.getClient(clientId);
    if (!client) {
      return res.status(400).json({ 
        success: false, 
        message: 'موکل با این شناسه یافت نشد' 
      });
    }
    
    const case_ = await storage.createCase(clientId, status);
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
    
    // Parse caseId to number
    const caseIdNum = parseInt(caseId, 10);
    if (isNaN(caseIdNum)) {
      return res.status(400).json({ 
        success: false, 
        message: 'شناسه پرونده نامعتبر است' 
      });
    }
    
    const updatedCase = await storage.updateCaseStatus(caseIdNum, status);
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

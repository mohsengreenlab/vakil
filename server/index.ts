import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import expressEjsLayouts from "express-ejs-layouts";

const app = express();

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

// Admin page (mock data for static prototype)
app.get('/admin24', (req, res) => {
  const mockCases = [
    {
      id: 'case-001',
      clientName: 'احمد محمدی',
      caseType: 'family',
      status: 'pending',
      urgency: 'normal',
      description: 'موضوع طلاق توافقی',
      createdAt: new Date('2024-01-15')
    },
    {
      id: 'case-002', 
      clientName: 'فاطمه احمدی',
      caseType: 'commercial',
      status: 'reviewing',
      urgency: 'urgent',
      description: 'تأسیس شرکت تجاری',
      createdAt: new Date('2024-01-10')
    },
    {
      id: 'case-003',
      clientName: 'علی رضایی',
      caseType: 'property',
      status: 'resolved',
      urgency: 'normal',
      description: 'قرارداد خرید ملک',
      createdAt: new Date('2024-01-05')
    }
  ];

  const mockContacts = [
    {
      id: 'contact-001',
      firstName: 'مریم',
      lastName: 'حسینی',
      phone: '09121234567',
      email: 'maryam@email.com',
      subject: 'consultation',
      message: 'سلام، نیاز به مشاوره در مورد حقوق کار دارم.',
      createdAt: new Date('2024-01-12')
    },
    {
      id: 'contact-002',
      firstName: 'حسن',
      lastName: 'کریمی',
      phone: '09127654321',
      email: null,
      subject: 'appointment',
      message: 'می‌خواهم وقت ملاقات بگیرم.',
      createdAt: new Date('2024-01-08')
    }
  ];
  
  res.render('pages/admin', { 
    title: 'پنل مدیریت - دفتر وکالت پیشرو',
    page: 'admin',
    cases: mockCases,
    contacts: mockContacts
  });
});

// Form submission handlers (static responses for prototype)
app.post('/api/case-review', (req, res) => {
  // Mock successful response
  res.json({ success: true, message: 'پرونده شما با موفقیت ثبت شد.' });
});

app.post('/api/contact', (req, res) => {
  // Mock successful response
  res.json({ success: true, message: 'پیام شما با موفقیت ارسال شد.' });
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

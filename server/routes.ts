import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertContactSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Admin authentication middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.session.adminId) {
      next();
    } else {
      res.status(401).json({ success: false, message: 'دسترسی غیر مجاز - احراز هویت مدیر الزامی است' });
    }
  };
  
  // Client authentication middleware
  const requireClientAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.session.clientId) {
      next();
    } else {
      res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است' });
    }
  };
  
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

  // Admin page
  app.get('/admin24', async (req, res) => {
    try {
      const cases = await storage.getAllLegalCases();
      const contacts = await storage.getAllContacts();
      
      res.render('pages/admin', { 
        title: 'پنل مدیریت - دفتر وکالت پیشرو',
        page: 'admin',
        cases,
        contacts
      });
    } catch (error) {
      res.status(500).render('pages/500', {
        title: 'خطای داخلی سرور',
        error: 'خطا در بارگذاری اطلاعات'
      });
    }
  });

  // API Routes

  // Submit case review
  app.post('/api/case-review', async (req, res) => {
    try {
      const validatedData = insertCaseSchema.parse(req.body);
      const newCase = await storage.createLegalCase(validatedData);
      res.json({ success: true, case: newCase });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, errors: error.errors });
      } else {
        res.status(500).json({ success: false, message: 'خطا در ثبت پرونده' });
      }
    }
  });

  // Submit contact form
  app.post('/api/contact', async (req, res) => {
    try {
      const validatedData = insertContactSchema.parse(req.body);
      const newContact = await storage.createContact(validatedData);
      res.json({ success: true, contact: newContact });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, errors: error.errors });
      } else {
        res.status(500).json({ success: false, message: 'خطا در ارسال پیام' });
      }
    }
  });

  // Get all cases (admin)
  app.get('/api/cases', requireAuth, async (req, res) => {
    try {
      const cases = await storage.getAllLegalCases();
      res.json({ success: true, cases });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پرونده‌ها' });
    }
  });

  // Update case status (admin)
  app.put('/api/cases/:id/status', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      console.log(`🔄 Updating case ${id} status to ${status}`);
      const updatedCase = await storage.updateCaseStatus(id, status);
      if (updatedCase) {
        console.log(`✅ Case ${id} status updated successfully to ${status}`);
        res.json({ success: true, case: updatedCase });
      } else {
        console.log(`❌ Case ${id} not found`);
        res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }
    } catch (error) {
      console.error('❌ Error updating case status:', error);
      res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی وضعیت' });
    }
  });

  // Get all contacts (admin)
  app.get('/api/contacts', requireAuth, async (req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json({ success: true, contacts });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
    }
  });

  // CLIENT CASE HISTORY ENDPOINTS (protected by requireClientAuth)
  
  // Get client's case history with events
  app.get('/api/client/case-history', requireClientAuth, async (req, res) => {
    try {
      const clientId = req.session.clientId;
      if (!clientId) {
        return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده' });
      }

      const caseHistory = await storage.getClientCaseEvents(clientId);
      
      // Sort cases by creation date (newest first)
      caseHistory.sort((a, b) => {
        const dateA = a.case.caseCreationDate?.getTime() || 0;
        const dateB = b.case.caseCreationDate?.getTime() || 0;
        return dateB - dateA;
      });

      res.json({ 
        success: true, 
        caseHistory,
        clientId 
      });
    } catch (error) {
      console.error('Error fetching client case history:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه پرونده‌ها' });
    }
  });

  // Get events for a specific case (only if it belongs to the current client)
  app.get('/api/client/cases/:caseId/events', requireClientAuth, async (req, res) => {
    try {
      const clientId = req.session.clientId;
      const { caseId } = req.params;
      
      if (!clientId) {
        return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده' });
      }

      // Verify the case belongs to the current client
      const case_ = await storage.getCase(caseId);
      if (!case_ || case_.clientId.toString() !== clientId) {
        return res.status(403).json({ success: false, message: 'دسترسی به این پرونده مجاز نمی‌باشد' });
      }

      // Get events for this case
      const events = await storage.getCaseEvents(caseId);
      
      // Pagination support
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      const paginatedEvents = events.slice(offset, offset + limit);
      const totalEvents = events.length;
      const hasMore = offset + limit < totalEvents;

      res.json({ 
        success: true, 
        case: case_,
        events: paginatedEvents,
        pagination: {
          page,
          limit,
          total: totalEvents,
          hasMore
        }
      });
    } catch (error) {
      console.error('Error fetching case events:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت رویدادهای پرونده' });
    }
  });

  // ADMIN: Get all cases (needed by admin.ejs)
  app.get('/api/admin/cases', requireAuth, async (req, res) => {
    try {
      const cases = await storage.getAllLegalCases();
      res.json({ success: true, cases });
    } catch (error) {
      console.error('Error fetching all cases for admin:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت پرونده‌ها' });
    }
  });

  // Add a new event to a case (admin functionality)
  app.post('/api/cases/:caseId/events', requireAuth, async (req, res) => {
    try {
      const { caseId } = req.params;
      
      // Validate input with Zod schema
      const validatedData = insertCaseEventSchema.parse(req.body);

      // Verify case exists
      const case_ = await storage.getCase(caseId);
      if (!case_) {
        return res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }

      const newEvent = await storage.createCaseEvent({
        caseId,
        eventType: validatedData.eventType,
        details: validatedData.details
      });

      res.json({ 
        success: true, 
        event: newEvent 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, errors: error.errors, message: 'داده‌های ورودی نامعتبر است' });
      } else {
        console.error('Error creating case event:', error);
        res.status(500).json({ success: false, message: 'خطا در ایجاد رویداد پرونده' });
      }
    }
  });

  // Admin-only endpoints for case event management
  app.get('/api/admin/cases/:caseId/events', requireAuth, async (req, res) => {
    try {
      const { caseId } = req.params;

      // Verify case exists
      const case_ = await storage.getCase(caseId);
      if (!case_) {
        return res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }

      // Get events for this case
      const events = await storage.getCaseEvents(caseId);

      res.json({ 
        success: true, 
        case: case_,
        events: events
      });
    } catch (error) {
      console.error('Error fetching case events for admin:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت رویدادهای پرونده' });
    }
  });

  app.put('/api/admin/cases/:caseId/events/:eventId', requireAuth, async (req, res) => {
    try {
      const { caseId, eventId } = req.params;

      // Verify case exists
      const case_ = await storage.getCase(caseId);
      if (!case_) {
        return res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }

      // Validate input with Zod schema (partial for updates)
      const partialEventSchema = insertCaseEventSchema.partial();
      const validatedData = partialEventSchema.parse(req.body);

      // Ensure at least one field is provided
      if (!validatedData.eventType && validatedData.details === undefined) {
        return res.status(400).json({ success: false, message: 'حداقل یک فیلد برای بروزرسانی الزامی است' });
      }

      const updatedEvent = await storage.updateCaseEvent(eventId, validatedData);

      if (!updatedEvent) {
        return res.status(404).json({ success: false, message: 'رویداد یافت نشد' });
      }

      res.json({ 
        success: true, 
        message: 'رویداد با موفقیت بروزرسانی شد',
        event: updatedEvent 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, errors: error.errors, message: 'داده‌های ورودی نامعتبر است' });
      } else {
        console.error('Error updating case event:', error);
        res.status(500).json({ success: false, message: 'خطا در بروزرسانی رویداد پرونده' });
      }
    }
  });

  app.delete('/api/admin/cases/:caseId/events/:eventId', requireAuth, async (req, res) => {
    try {
      const { caseId, eventId } = req.params;

      // Verify case exists
      const case_ = await storage.getCase(caseId);
      if (!case_) {
        return res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }

      const deleted = await storage.deleteCaseEvent(eventId);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'رویداد یافت نشد' });
      }

      res.json({ 
        success: true, 
        message: 'رویداد با موفقیت حذف شد' 
      });
    } catch (error) {
      console.error('Error deleting case event:', error);
      res.status(500).json({ success: false, message: 'خطا در حذف رویداد پرونده' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCaseSchema, insertContactSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  
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
  app.get('/api/cases', async (req, res) => {
    try {
      const cases = await storage.getAllLegalCases();
      res.json({ success: true, cases });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پرونده‌ها' });
    }
  });

  // Update case status (admin)
  app.put('/api/cases/:id/status', async (req, res) => {
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
  app.get('/api/contacts', async (req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json({ success: true, contacts });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

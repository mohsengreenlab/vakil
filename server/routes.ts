import type { Express, Request, Response, NextFunction } from "express";
import type { IStorage } from "./storage";
import { insertCaseSchema, insertContactSchema, insertCaseEventSchema, caseEventFormSchema, insertClientFileSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

export async function registerRoutes(app: Express, storage: IStorage): Promise<void> {
  
  // Admin authentication middleware for API routes
  const requireAuthAPI = (req: Request, res: Response, next: NextFunction) => {
    if (req.session.adminId) {
      next();
    } else {
      res.status(401).json({ success: false, message: 'دسترسی غیر مجاز - احراز هویت مدیر الزامی است' });
    }
  };
  
  // Admin authentication middleware for web pages
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.session.adminId) {
      next();
    } else {
      res.redirect('/admin24');
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

  // Multer configuration for file uploads
  const storage_multer = multer.diskStorage({
    destination: function (req, file, cb) {
      const clientId = req.session.clientId;
      if (!clientId) {
        return cb(new Error('Client not authenticated'), '');
      }
      
      const uploadDir = path.join(process.cwd(), 'Client_Files', clientId.toString());
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      // Format: DD-MM-YYYY
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = `${day}-${month}-${year}`;
      
      // Get file extension
      const ext = path.extname(file.originalname);
      
      // If multiple files on same day, add a counter
      let filename = `${dateStr}${ext}`;
      let counter = 1;
      const uploadDir = path.join(process.cwd(), 'Client_Files', req.session.clientId!.toString());
      
      while (fs.existsSync(path.join(uploadDir, filename))) {
        filename = `${dateStr}_${counter}${ext}`;
        counter++;
      }
      
      cb(null, filename);
    }
  });

  const upload = multer({
    storage: storage_multer,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: function (req, file, cb) {
      // Accept PDF, images, and common document formats
      const allowedTypes = /\.(pdf|jpg|jpeg|png|gif|doc|docx|txt)$/i;
      if (allowedTypes.test(path.extname(file.originalname))) {
        cb(null, true);
      } else {
        cb(new Error('نوع فایل مجاز نیست. فرمت‌های مجاز: PDF, JPG, PNG, DOC, DOCX, TXT'));
      }
    }
  });
  
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

  // SECURITY FIX: This route should NOT exist here as it duplicates the properly protected route in index.ts
  // Removing this completely unprotected admin route that was exposing sensitive data
  // The proper protected admin route is in index.ts at /admin24/dashboard with requireAuth

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
  app.get('/api/cases', requireAuthAPI, async (req, res) => {
    try {
      const cases = await storage.getAllLegalCases();
      res.json({ success: true, cases });
    } catch (error) {
      res.status(500).json({ success: false, message: 'خطا در دریافت پرونده‌ها' });
    }
  });


  // Get all contacts (admin)
  app.get('/api/contacts', requireAuthAPI, async (req, res) => {
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

  // ROUTE CONSOLIDATION FIX: This duplicate route is removed to prevent conflicts
  // The primary '/api/admin/cases' route is handled in server/index.ts

  // Add a new event to a case (admin functionality)
  app.post('/api/cases/:caseId/events', requireAuthAPI, async (req, res) => {
    try {
      const { caseId } = req.params;
      
      // Validate input with Zod schema
      const validatedData = caseEventFormSchema.parse(req.body);

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
  app.get('/api/admin/cases/:caseId/events', requireAuthAPI, async (req, res) => {
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

  app.put('/api/admin/cases/:caseId/events/:eventId', requireAuthAPI, async (req, res) => {
    try {
      const { caseId, eventId } = req.params;

      // Verify case exists
      const case_ = await storage.getCase(caseId);
      if (!case_) {
        return res.status(404).json({ success: false, message: 'پرونده یافت نشد' });
      }

      // Validate input with Zod schema (partial for updates)
      const partialEventSchema = caseEventFormSchema.partial();
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

  app.delete('/api/admin/cases/:caseId/events/:eventId', requireAuthAPI, async (req, res) => {
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

  // Client file upload endpoint
  app.post('/api/client/files', requireClientAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'هیچ فایلی انتخاب نشده است' });
      }

      const clientId = req.session.clientId!;
      const { description } = req.body;

      // Create file record in storage
      const fileData = {
        clientId: parseInt(clientId.toString()),
        fileName: req.file.filename,
        originalFileName: req.file.originalname,
        fileSize: req.file.size.toString(),
        mimeType: req.file.mimetype,
        description: description || null,
        filePath: req.file.path,
      };

      const clientFile = await storage.createClientFile(fileData);

      res.json({
        success: true,
        message: 'فایل با موفقیت آپلود شد',
        file: {
          id: clientFile.id,
          fileName: clientFile.fileName,
          originalFileName: clientFile.originalFileName,
          uploadDate: clientFile.uploadDate,
          description: clientFile.description,
        },
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      
      // Clean up uploaded file if database operation fails
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ success: false, message: 'خطا در آپلود فایل' });
    }
  });

  // Get client files list
  app.get('/api/client/files', requireClientAuth, async (req, res) => {
    try {
      const clientId = req.session.clientId!;
      const files = await storage.getClientFiles(clientId);

      res.json({
        success: true,
        files: files.map(file => ({
          id: file.id,
          fileName: file.fileName,
          originalFileName: file.originalFileName,
          uploadDate: file.uploadDate,
          description: file.description,
          fileSize: file.fileSize,
        })),
      });
    } catch (error) {
      console.error('Error fetching client files:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت فایل‌ها' });
    }
  });

  // Download/view client file
  app.get('/api/client/files/:fileId/download', requireClientAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const clientId = req.session.clientId!;

      const file = await storage.getClientFile(fileId);
      
      if (!file) {
        return res.status(404).json({ success: false, message: 'فایل یافت نشد' });
      }

      // Security check: ensure file belongs to authenticated client
      if (file.clientId !== parseInt(clientId.toString())) {
        return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
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
      console.error('Error downloading file:', error);
      res.status(500).json({ success: false, message: 'خطا در دانلود فایل' });
    }
  });

  // Admin-to-client file delivery endpoints
  
  // Admin multer configuration for uploading files to clients
  const adminFileUploadStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const { clientId } = req.body;
      if (!clientId) {
        return cb(new Error('Client ID is required for file upload'), '');
      }
      
      const paddedClientId = clientId.toString().padStart(4, '0');
      const uploadDir = path.join(process.cwd(), 'Client_Files', paddedClientId);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      // Format: admin_DD-MM-YYYY_originalname
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = `${day}-${month}-${year}`;
      
      // Get file extension
      const ext = path.extname(file.originalname);
      const baseName = path.basename(file.originalname, ext);
      
      // Use original name with admin prefix and date
      let filename = `admin_${dateStr}_${baseName}${ext}`;
      let counter = 1;
      
      const { clientId } = req.body;
      const paddedClientId = clientId.toString().padStart(4, '0');
      const uploadDir = path.join(process.cwd(), 'Client_Files', paddedClientId);
      
      while (fs.existsSync(path.join(uploadDir, filename))) {
        filename = `admin_${dateStr}_${baseName}_${counter}${ext}`;
        counter++;
      }
      
      cb(null, filename);
    }
  });

  const adminFileUpload = multer({
    storage: adminFileUploadStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: function (req, file, cb) {
      // Accept PDF, images, and common document formats
      const allowedTypes = /\.(pdf|jpg|jpeg|png|gif|doc|docx|txt)$/i;
      if (allowedTypes.test(path.extname(file.originalname))) {
        cb(null, true);
      } else {
        cb(new Error('نوع فایل مجاز نیست. فرمت‌های مجاز: PDF, JPG, PNG, DOC, DOCX, TXT'));
      }
    }
  });

  // Admin endpoint to upload file to specific client
  app.post('/api/admin/files/upload-to-client', requireAuthAPI, adminFileUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'هیچ فایلی انتخاب نشده است' });
      }

      const { clientId, description } = req.body;
      
      if (!clientId) {
        // Clean up uploaded file if clientId is missing
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ success: false, message: 'شناسه موکل الزامی است' });
      }

      // Create file record in storage with admin flag
      const fileData = {
        clientId: parseInt(clientId.toString()),
        fileName: req.file.filename,
        originalFileName: req.file.originalname,
        fileSize: req.file.size.toString(),
        mimeType: req.file.mimetype,
        description: description || null,
        filePath: req.file.path,
        uploadedByType: 'admin'
      };

      const clientFile = await storage.createClientFile(fileData);

      res.json({
        success: true,
        message: 'فایل با موفقیت برای موکل ارسال شد',
        file: {
          id: clientFile.id,
          fileName: clientFile.fileName,
          originalFileName: clientFile.originalFileName,
          uploadDate: clientFile.uploadDate,
          description: clientFile.description,
          uploadedByType: clientFile.uploadedByType,
        },
      });
    } catch (error) {
      console.error('Error uploading admin file to client:', error);
      
      // Clean up uploaded file if database operation fails
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ success: false, message: 'خطا در ارسال فایل به موکل' });
    }
  });

  // Client endpoint to get admin-uploaded files (received files)
  app.get('/api/client/received-files', requireClientAuth, async (req, res) => {
    try {
      const clientId = req.session.clientId!;
      const allFiles = await storage.getClientFiles(clientId);
      
      // Filter only admin-uploaded files
      const receivedFiles = allFiles.filter(file => file.uploadedByType === 'admin');

      res.json({
        success: true,
        files: receivedFiles.map(file => ({
          id: file.id,
          fileName: file.fileName,
          originalFileName: file.originalFileName,
          uploadDate: file.uploadDate,
          description: file.description,
          fileSize: file.fileSize,
        })),
      });
    } catch (error) {
      console.error('Error fetching received files:', error);
      res.status(500).json({ success: false, message: 'خطا در دریافت فایل‌های دریافتی' });
    }
  });

  // Routes registered successfully
}

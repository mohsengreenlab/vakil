// Global state management
let isDarkMode = false;
let isMobileMenuOpen = false;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Persian Legal System Application Loaded');
    initializeTheme();
    initializeForms();
    initializeFileUploads();
});

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        enableDarkMode();
    }
}

function toggleDarkMode() {
    if (isDarkMode) {
        disableDarkMode();
    } else {
        enableDarkMode();
    }
}

function enableDarkMode() {
    document.documentElement.classList.add('dark');
    isDarkMode = true;
    localStorage.setItem('theme', 'dark');
}

function disableDarkMode() {
    document.documentElement.classList.remove('dark');
    isDarkMode = false;
    localStorage.setItem('theme', 'light');
}

// Mobile menu management
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
        if (isMobileMenuOpen) {
            mobileMenu.classList.add('hidden');
            isMobileMenuOpen = false;
        } else {
            mobileMenu.classList.remove('hidden');
            isMobileMenuOpen = true;
        }
    }
}

function closeMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
        mobileMenu.classList.add('hidden');
        isMobileMenuOpen = false;
    }
}

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}

// Modal management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modals on background click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Form handling
function initializeForms() {
    // Case review form
    const caseReviewForm = document.getElementById('case-review-form');
    if (caseReviewForm) {
        caseReviewForm.addEventListener('submit', handleCaseReviewSubmit);
    }

    // Contact form
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }

    // Client login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
}

async function handleCaseReviewSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Convert hasLawyer to boolean
    data.hasLawyer = data.hasLawyer === 'yes';
    
    try {
        setFormLoading(form, true);
        
        const response = await fetch('/api/case-review', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('پرونده شما با موفقیت ثبت شد. به زودی با شما تماس خواهیم گرفت.', 'success');
            form.reset();
        } else {
            showToast('خطا در ثبت پرونده. لطفاً دوباره تلاش کنید.', 'error');
        }
    } catch (error) {
        showToast('خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.', 'error');
    } finally {
        setFormLoading(form, false);
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    try {
        setFormLoading(form, true);
        
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('پیام شما با موفقیت ارسال شد. به زودی پاسخ خواهیم داد.', 'success');
            form.reset();
        } else {
            showToast('خطا در ارسال پیام. لطفاً دوباره تلاش کنید.', 'error');
        }
    } catch (error) {
        showToast('خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.', 'error');
    } finally {
        setFormLoading(form, false);
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    
    // Mock login for demonstration
    showToast('ورود موفقیت‌آمیز بود. به پنل شخصی خود منتقل می‌شوید.', 'success');
    
    setTimeout(() => {
        window.location.href = '/';
    }, 2000);
}

function setFormLoading(form, isLoading) {
    const submitButton = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('input, textarea, select, button');
    
    inputs.forEach(input => {
        input.disabled = isLoading;
    });
    
    if (submitButton) {
        if (isLoading) {
            submitButton.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>در حال ارسال...';
            submitButton.classList.add('loading');
        } else {
            submitButton.innerHTML = submitButton.getAttribute('data-original-text') || 'ارسال';
            submitButton.classList.remove('loading');
        }
    }
}

// File upload handling
function initializeFileUploads() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    fileInputs.forEach(input => {
        const uploadArea = input.closest('.file-upload-area');
        if (uploadArea) {
            setupFileUpload(input, uploadArea);
        }
    });
}

function setupFileUpload(input, uploadArea) {
    // Click to select files
    uploadArea.addEventListener('click', () => {
        input.click();
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            input.files = files;
            updateFileUploadDisplay(input, uploadArea);
        }
    });
    
    // File selection change
    input.addEventListener('change', () => {
        updateFileUploadDisplay(input, uploadArea);
    });
}

function updateFileUploadDisplay(input, uploadArea) {
    const files = input.files;
    const fileList = uploadArea.querySelector('.file-list') || createFileList(uploadArea);
    
    fileList.innerHTML = '';
    
    if (files.length > 0) {
        Array.from(files).forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'flex items-center justify-between p-2 bg-muted rounded-lg';
            fileItem.innerHTML = `
                <div class="flex items-center">
                    <svg class="w-5 h-5 text-muted-foreground ml-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"></path>
                    </svg>
                    <div>
                        <div class="text-sm font-medium">${file.name}</div>
                        <div class="text-xs text-muted-foreground">${formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button type="button" onclick="removeFile(${index})" class="text-destructive hover:text-destructive/80">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                    </svg>
                </button>
            `;
            fileList.appendChild(fileItem);
        });
    }
}

function createFileList(uploadArea) {
    const fileList = document.createElement('div');
    fileList.className = 'file-list mt-4 space-y-2';
    uploadArea.appendChild(fileList);
    return fileList;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
    // This would need to be implemented to actually remove files
    showToast('فایل حذف شد', 'info');
}

// Admin functions
async function updateCaseStatus(caseId, newStatus) {
    try {
        const response = await fetch(`/api/admin/cases/${caseId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('وضعیت پرونده به‌روزرسانی شد', 'success');
            // Reload the page to show updated data
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showToast('خطا در به‌روزرسانی وضعیت', 'error');
        }
    } catch (error) {
        showToast('خطا در ارتباط با سرور', 'error');
    }
}

// Password visibility toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
            </svg>
        `;
    } else {
        input.type = 'password';
        button.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
        `;
    }
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('کپی شد', 'success');
    }).catch(() => {
        showToast('خطا در کپی کردن', 'error');
    });
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    // ESC to close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
        closeMobileMenu();
        document.body.style.overflow = '';
    }
});

// Responsive behavior
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        closeMobileMenu();
    }
});

// Smooth scrolling for anchor links
document.addEventListener('click', function(e) {
    if (e.target.tagName === 'A' && e.target.getAttribute('href')?.startsWith('#')) {
        e.preventDefault();
        const targetId = e.target.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
});

// Print functionality
function printPage() {
    window.print();
}

// Search functionality
function handleSearch(query) {
    if (query.trim() === '') {
        showToast('لطفاً عبارت جستجو را وارد کنید', 'warning');
        return;
    }
    
    showToast(`جستجو برای: ${query}`, 'info');
    // Implement actual search logic here
}

// Export functionality
function exportData(format) {
    showToast(`در حال صادر کردن داده‌ها به فرمت ${format}...`, 'info');
    // Implement actual export logic here
}

// Auto-save for forms
let autoSaveTimeout;

function autoSaveForm(form) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        localStorage.setItem('form_draft_' + form.id, JSON.stringify(data));
        showToast('پیش‌نویس ذخیره شد', 'info');
    }, 2000);
}

// Load form draft
function loadFormDraft(formId) {
    const savedData = localStorage.getItem('form_draft_' + formId);
    if (savedData) {
        const data = JSON.parse(savedData);
        const form = document.getElementById(formId);
        
        if (form) {
            Object.keys(data).forEach(key => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = data[key];
                }
            });
            
            showToast('پیش‌نویس بازیابی شد', 'info');
        }
    }
}

// Clear form draft
function clearFormDraft(formId) {
    localStorage.removeItem('form_draft_' + formId);
}

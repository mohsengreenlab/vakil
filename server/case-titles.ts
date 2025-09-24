// Case Title Variables - File-based storage for admin-configurable case titles
// These variables persist across server restarts by reading/writing to JSON file

import * as fs from 'fs';
import * as path from 'path';

export interface CaseTitle {
  id: string;
  label: string;
  createdAt: string;
}

const CASE_TITLES_FILE = path.join(process.cwd(), 'data', 'case-titles.json');

// Ensure data directory exists
function ensureDataDir(): void {
  const dataDir = path.dirname(CASE_TITLES_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Read case titles from file
function readCaseTitlesFromFile(): CaseTitle[] {
  try {
    ensureDataDir();
    
    if (!fs.existsSync(CASE_TITLES_FILE)) {
      // Create default file if it doesn't exist
      const defaultTitles: CaseTitle[] = [
        {
          id: "lawyer-study",
          label: "مطالعه وکیل",
          createdAt: new Date().toISOString()
        },
        {
          id: "awaiting-court",
          label: "در انتظار رای دادگاه", 
          createdAt: new Date().toISOString()
        }
      ];
      
      fs.writeFileSync(CASE_TITLES_FILE, JSON.stringify(defaultTitles, null, 2), 'utf8');
      return defaultTitles;
    }
    
    const fileContent = fs.readFileSync(CASE_TITLES_FILE, 'utf8');
    return JSON.parse(fileContent) as CaseTitle[];
  } catch (error) {
    console.error('Error reading case titles file:', error);
    return [];
  }
}

// Write case titles to file
function writeCaseTitlesToFile(titles: CaseTitle[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(CASE_TITLES_FILE, JSON.stringify(titles, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing case titles file:', error);
    throw error;
  }
}

// Functions to manage case titles with file persistence
export function getAllCaseTitles(): CaseTitle[] {
  return readCaseTitlesFromFile();
}

export function addCaseTitle(label: string): CaseTitle {
  const titles = readCaseTitlesFromFile();
  const newTitle: CaseTitle = {
    id: generateId(),
    label: label.trim(),
    createdAt: new Date().toISOString()
  };
  
  titles.push(newTitle);
  writeCaseTitlesToFile(titles);
  
  return newTitle;
}

export function updateCaseTitle(id: string, label: string): CaseTitle | null {
  const titles = readCaseTitlesFromFile();
  const titleIndex = titles.findIndex(title => title.id === id);
  
  if (titleIndex === -1) {
    return null;
  }
  
  titles[titleIndex].label = label.trim();
  writeCaseTitlesToFile(titles);
  
  return titles[titleIndex];
}

export function deleteCaseTitle(id: string): boolean {
  const titles = readCaseTitlesFromFile();
  const titleIndex = titles.findIndex(title => title.id === id);
  
  if (titleIndex === -1) {
    return false;
  }
  
  titles.splice(titleIndex, 1);
  writeCaseTitlesToFile(titles);
  
  return true;
}

// Helper function to generate unique IDs
function generateId(): string {
  return 'title_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
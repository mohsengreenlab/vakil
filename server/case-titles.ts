// Case Title Variables - File-based storage for admin-configurable case titles
// These variables persist across server restarts by reading/writing to JSON file

import * as fs from 'fs';
import * as path from 'path';

export interface CaseTitle {
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
          label: "مطالعه وکیل",
          createdAt: new Date().toISOString()
        },
        {
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
  const trimmedLabel = label.trim();
  
  // Check if title already exists
  if (titles.some(title => title.label === trimmedLabel)) {
    throw new Error('عنوان تکراری است');
  }
  
  const newTitle: CaseTitle = {
    label: trimmedLabel,
    createdAt: new Date().toISOString()
  };
  
  titles.push(newTitle);
  writeCaseTitlesToFile(titles);
  
  return newTitle;
}

export function updateCaseTitle(oldLabel: string, newLabel: string): CaseTitle | null {
  const titles = readCaseTitlesFromFile();
  const titleIndex = titles.findIndex(title => title.label === oldLabel);
  
  if (titleIndex === -1) {
    return null;
  }
  
  const trimmedNewLabel = newLabel.trim();
  
  // Check if new label already exists (unless it's the same)
  if (trimmedNewLabel !== oldLabel && titles.some(title => title.label === trimmedNewLabel)) {
    throw new Error('عنوان تکراری است');
  }
  
  titles[titleIndex].label = trimmedNewLabel;
  writeCaseTitlesToFile(titles);
  
  return titles[titleIndex];
}

export function deleteCaseTitle(label: string): boolean {
  const titles = readCaseTitlesFromFile();
  const titleIndex = titles.findIndex(title => title.label === label);
  
  if (titleIndex === -1) {
    return false;
  }
  
  titles.splice(titleIndex, 1);
  writeCaseTitlesToFile(titles);
  
  return true;
}
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';

export interface OcrResult {
  text: string;
}

const getFunctionErrorMessage = async (error: any, response?: Response): Promise<string> => {
  const contextResponse = error?.context instanceof Response ? error.context : response;

  if (contextResponse) {
    const cloned = contextResponse.clone();
    try {
      const body = await cloned.json();
      if (typeof body?.error === 'string' && body.error.trim()) {
        return body.error;
      }
    } catch {
      try {
        const text = await contextResponse.clone().text();
        if (text.trim()) return text;
      } catch {
        // Fall through to the SDK error below.
      }
    }
  }

  return error?.message || 'OCR request failed.';
};

export const ocrService = {
  async parseImage(imageUri: string): Promise<string> {
    const image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { data, error, response } = await supabase.functions.invoke<{ text?: string; error?: string }>(
      'ocr-receipt',
      {
        body: { image },
        timeout: 30000,
      },
    );

    if (error) {
      throw new Error(await getFunctionErrorMessage(error, response));
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data?.text ?? '';
  },

  extractDate(text: string): string | null {
    // 1. Look for numeric dates: DD.MM.YYYY, DD/MM/YYYY, or YYYY-MM-DD
    const datePattern = /(\d{2}[.\/-]\d{2}[.\/-]\d{2,4})|(\d{4}-\d{2}-\d{2})/g;
    const matches = text.match(datePattern);

    if (matches) {
      for (let match of matches) {
        let normalized = match.replace(/[.\/]/g, '-');
        const parts = normalized.split('-');

        if (parts.length === 3) {
          // YYYY-MM-DD
          if (parts[0].length === 4) return normalized;
          // DD-MM-YYYY
          if (parts[0].length === 2 && parts[2].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          // DD-MM-YY (assume 20xx)
          if (parts[0].length === 2 && parts[2].length === 2) {
            return `20${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
      }
    }

    // 2. Look for dates with month names: 12 Jan 2024, 12 January 2024
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthPattern = new RegExp(`(\\d{1,2})\\s+(${monthNames.join('|')})[a-z]*\\s+(\\d{4}|\\d{2})`, 'i');
    const monthMatch = text.match(monthPattern);

    if (monthMatch) {
      const day = monthMatch[1].padStart(2, '0');
      const monthStr = monthMatch[2].toLowerCase();
      const monthIdx = monthNames.indexOf(monthStr) + 1;
      const month = monthIdx.toString().padStart(2, '0');
      let year = monthMatch[3];
      if (year.length === 2) year = `20${year}`;

      return `${year}-${month}-${day}`;
    }

    return null;
  },

  extractReferenceNumber(text: string, type?: string): string | null {
    // 1. Specific Document Type Logic
    if (type === 'HGV_Licence' || type === 'licence') {
      // UK Licence: 5 letters, 6 digits, 2 letters, 3 chars (e.g., SMITH912345AB9KL)
      const licenceMatch = text.match(/[A-Z9]{5}\d{6}[A-Z9]{2}[A-Z0-9]{3}/);
      if (licenceMatch) return licenceMatch[0];
    }

    // 2. Try to find 11-12 digit numbers (V5C / MOT)
    const longDigitsPattern = /\b\d{4}[ \-]?\d{3,4}[ \-]?\d{4}\b/g;
    const digitMatches = text.match(longDigitsPattern);
    if (digitMatches && digitMatches.length > 0) {
      return digitMatches[0].replace(/[ \-]/g, '');
    }

    // 2. Try to find common labels followed by a reference
    const labels = [
      'Document reference',
      'Ref',
      'No',
      'Number',
      'Test number',
      'Policy',
      'Certificate',
      'VIN'
    ];

    for (const label of labels) {
      const regex = new RegExp(`${label}[:.\\s]+([A-Z0-9]{5,20})`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // 3. Fallback: look for any 9-12 digit sequence that isn't a date
    const genericRef = /\b\d{9,12}\b/g;
    const genericMatches = text.match(genericRef);
    if (genericMatches) {
        // Filter out things that look like dates (YYYYMMDD)
        for (const m of genericMatches) {
            if (!m.startsWith('202') && !m.startsWith('203')) { // Crude filter for future dates
                return m;
            }
        }
    }

    return null;
  },

  extractRegistration(text: string): string | null {
    // UK Registration format: 2 letters, 2 digits, space, 3 letters (e.g. AB12 CDE)
    const ukReg = /\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3})\b/i;
    const match = text.match(ukReg);
    if (match) {
      return match[1].toUpperCase().replace(/\s/g, '');
    }

    // Older UK format: 1 letter, 1-3 digits, 3 letters
    const oldUkReg = /\b([A-Z][0-9]{1,3}\s?[A-Z]{3})\b/i;
    const oldMatch = text.match(oldUkReg);
    if (oldMatch) {
      return oldMatch[1].toUpperCase().replace(/\s/g, '');
    }

    return null;
  }
};

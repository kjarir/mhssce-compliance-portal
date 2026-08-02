import { Router, type Request, type Response } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";
import { authenticate } from "../../core/middleware/auth";
import { asyncHandler } from "../../core/utils/async-handler";
import { logger } from "../../core/utils/logger";

const router = Router();
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 } // Support files up to 25MB
});

/**
 * Month names lookup table for parsing strings like '31 March 2027', '03-Aug-2026', 'April 30, 2026'
 */
const MONTHS_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12"
};

/**
 * Helper to normalize extracted date tokens to standard ISO format (YYYY-MM-DD)
 */
const normalizeToIsoDate = (rawDateStr: string): string | null => {
  try {
    const clean = rawDateStr.trim().replace(/[,/.]/g, "-").replace(/\s+/g, "-");
    const parts = clean.split("-").filter(Boolean);

    if (parts.length < 3) return null;

    let day = "";
    let month = "";
    let year = "";

    // Case 1: YYYY-MM-DD or YYYY-Month-DD
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } 
    // Case 2: DD-MM-YYYY or DD-Month-YYYY
    else if (parts[2].length === 4) {
      day = parts[0];
      month = parts[1];
      year = parts[2];
    } else {
      return null;
    }

    // Convert month name to double-digit string if text
    const lowerMonth = month.toLowerCase();
    if (MONTHS_MAP[lowerMonth]) {
      month = MONTHS_MAP[lowerMonth];
    } else if (/^\d{1,2}$/.test(month)) {
      month = month.padStart(2, "0");
    } else {
      return null;
    }

    day = day.padStart(2, "0");

    const parsedDate = new Date(`${year}-${month}-${day}`);
    if (isNaN(parsedDate.getTime())) return null;

    // Basic sanity check: year should be between 2020 and 2045
    const numYear = parseInt(year, 10);
    if (numYear < 2020 || numYear > 2045) return null;

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
};

/**
 * Advanced Regex Date Extraction Engine for Compliance Documents
 */
const extractExpiryDateFromText = (text: string): { expiryDate: string | null; detectedKeyword: string | null; confidence: number } => {
  // Regex pattern matching common compliance expiry phrases across documents/images
  const expiryPatterns = [
    // Expiry date: 03/08/2026, Valid until: 31-03-2027
    /(?:expiry|expiring|valid\s+until|validity\s+upto|valid\s+upto|date\s+of\ expiration|expiration\s+date|upto|till)\s*[:\-\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2}\s*,\s*\d{4})/i,
    // Valid for period ending 31st March 2027
    /(?:period\s+ending|expires\s+on|valid\s+through)\s*[:\-\s]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4})/i,
    // Direct date pattern near word 'Expiry' or 'Validity'
    /(?:expiry|validity).{0,40}?(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/i,
  ];

  for (const pattern of expiryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const iso = normalizeToIsoDate(match[1].replace(/(st|nd|rd|th)/gi, ""));
      if (iso) {
        return {
          expiryDate: iso,
          detectedKeyword: match[0].trim(),
          confidence: 0.95
        };
      }
    }
  }

  // Fallback scan: Search all dates in text and pick future-most date
  const genericDateRegex = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/g;
  const matches = Array.from(text.matchAll(genericDateRegex));
  const foundDates: string[] = [];

  for (const m of matches) {
    const iso = normalizeToIsoDate(m[1]);
    if (iso && !foundDates.includes(iso)) {
      foundDates.push(iso);
    }
  }

  if (foundDates.length > 0) {
    foundDates.sort();
    const latestDate = foundDates[foundDates.length - 1];
    return {
      expiryDate: latestDate,
      detectedKeyword: "Generic Future Date Analysis",
      confidence: 0.70
    };
  }

  return { expiryDate: null, detectedKeyword: null, confidence: 0 };
};

/**
 * Title extraction heuristic: Extract prominent document headers
 */
const extractDocumentTitle = (text: string): string | null => {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 5);
  const titleKeywords = ["certificate", "approval", "license", "permission", "noc", "report", "accreditation", "fire safety", "aictc", "nba", "naac"];

  for (const line of lines.slice(0, 15)) {
    const lower = line.toLowerCase();
    if (titleKeywords.some(k => lower.includes(k))) {
      return line.slice(0, 60);
    }
  }

  return lines[0]?.slice(0, 50) ?? null;
};

router.use(authenticate);

router.post(
  "/scan",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded for OCR scan" });
    }

    let text = "";
    let totalPages = 1;
    const isImage = req.file.mimetype.startsWith("image/");
    const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");

    try {
      if (isPdf) {
        logger.info({ filename: req.file.originalname, size: req.file.size }, "Starting PDF OCR parse...");
        const parsedPdf = await pdfParse(req.file.buffer);
        totalPages = parsedPdf.numpages;
        text = parsedPdf.text;
      } else if (isImage) {
        logger.info({ filename: req.file.originalname, size: req.file.size }, "Starting Image Tesseract OCR parse...");
        const worker = await createWorker("eng");
        const { data: ocrData } = await worker.recognize(req.file.buffer);
        await worker.terminate();
        text = ocrData.text;
      } else {
        return res.status(400).json({ success: false, error: "Unsupported file format for OCR scan. Use PDF, PNG, or JPEG." });
      }

      logger.info({ totalPages, textLength: text.length, isImage }, "Text extraction completed successfully");

      // Extract expiry date and title
      const { expiryDate, detectedKeyword, confidence } = extractExpiryDateFromText(text);
      const suggestedTitle = extractDocumentTitle(text);

      res.status(200).json({
        success: true,
        data: {
          totalPages,
          textLength: text.length,
          suggestedExpiryDate: expiryDate,
          suggestedTitle: suggestedTitle,
          detectedKeyword,
          confidence,
          textSnippet: text.slice(0, 500)
        }
      });
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : "Unknown" }, "OCR scan failed");
      res.status(500).json({
        success: false,
        error: "Failed to process document with OCR engine"
      });
    }
  })
);

export { router as ocrRoutes };

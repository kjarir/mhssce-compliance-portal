import { Router, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../../core/middleware/auth";
import { authorizeRoles } from "../../core/middleware/rbac";
import { asyncHandler } from "../../core/utils/async-handler";
import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../core/errors/AppError";
import { env } from "../../config/env";
import { logger } from "../../core/utils/logger";

const router = Router();

// Protect all copilot routes: Must be authenticated AND have role 'Admin' or 'Principal'
router.use(authenticate);
router.use(authorizeRoles("Admin", "Principal"));

interface ChatHistoryItem {
  sender: "user" | "copilot";
  text: string;
}

interface QueryRequestBody {
  prompt: string;
  history?: ChatHistoryItem[];
}

// Initialize Gemini AI
const ai = env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes("your_gemini_key")
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  : null;

router.post(
  "/query",
  asyncHandler(async (req: Request<{}, {}, QueryRequestBody>, res: Response) => {
    const { prompt, history = [] } = req.body;

    if (!prompt || typeof prompt !== "string") {
      throw new AppError("Prompt string is required", 400);
    }

    // 1. Fetch live system context from Supabase
    const { data: documents } = await supabaseAdmin
      .from("documents")
      .select("id, document_name, category, responsible_person, expiry_date, status, created_at, institute_id, institutes(name, code)");

    const { data: institutes } = await supabaseAdmin
      .from("institutes")
      .select("id, name, code, created_at");

    const { data: approvals } = await supabaseAdmin
      .from("approvals")
      .select("id, step, status, hod_feedback, principal_feedback, created_at, documents(document_name)");

    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, full_name, role, institute_id, institutes(name, code)");

    const totalDocs = (documents ?? []).length;
    const validDocs = (documents ?? []).filter((d: any) => d.status === "Valid").length;
    const expiringDocs = (documents ?? []).filter((d: any) => d.status !== "Valid").length;

    // 2. Gemini AI RAG Engine
    if (ai) {
      try {
        logger.info({ prompt }, "Sending query to Gemini 2.5 AI with live RAG database context");

        const systemInstruction = `
You are the Compliance Copilot AI for Anjuman's AICP Compliance Portal.
You have direct real-time read access to the institution's PostgreSQL database context provided below.

REAL-TIME SYSTEM DATABASE CONTEXT:
- Total Institutes/Colleges: ${(institutes ?? []).length}
- Institutes List: ${JSON.stringify(institutes, null, 2)}
- Total Documents: ${totalDocs} (${validDocs} Valid, ${expiringDocs} Expiring/Expired)
- Live Documents List: ${JSON.stringify(documents, null, 2)}
- Live Approvals Pipeline: ${JSON.stringify(approvals, null, 2)}
- Total System Users/Staff: ${(users ?? []).length}
- Live Users List: ${JSON.stringify(users, null, 2)}

INSTRUCTIONS:
1. Answer the user's question accurately using ONLY the live database context provided above.
2. Be helpful, professional, conversational, and direct.
3. Use the conversation history to understand context for follow-up questions (e.g. "who uploaded this document?").
`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: { systemInstruction }
        });

        const aiText = response.text;
        if (aiText) {
          return res.json({
            success: true,
            data: {
              answer: aiText,
              highlights: documents ?? [],
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (geminiErr) {
        logger.warn({ error: geminiErr instanceof Error ? geminiErr.message : "Unknown" }, "Gemini API error, falling back to smart database search");
      }
    }

    // 3. Open-Source RAG Memory & Intent Engine
    const queryLower = prompt.toLowerCase();
    let responseText = "";
    let dataHighlights: any[] = [];

    // Combine recent conversation context into full text search
    const conversationContext = history.map((h) => h.text).join(" ").toLowerCase();
    const fullSearchText = `${conversationContext} ${queryLower}`;

    // Contextual entity resolution (e.g., "who uploaded this document?", "what about this file?")
    const isFollowupDocQuery = queryLower.includes("this document") || queryLower.includes("that document") || queryLower.includes("who uploaded") || queryLower.includes("who created") || queryLower.includes("this file") || queryLower.includes("responsible");

    // Match institute from current prompt OR conversation history
    const matchedInst = (institutes ?? []).find((inst: any) => {
      const nameClean = inst.name?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
      const codeClean = inst.code?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
      const searchClean = fullSearchText.replace(/[^a-z0-9]/g, "");
      const words = inst.name?.toLowerCase().split(" ") ?? [];
      const matchWord = words.some((w: string) => w.length > 3 && fullSearchText.includes(w));
      return searchClean.includes(nameClean) || searchClean.includes(codeClean) || matchWord;
    });

    // Match document mentioned in previous turn or current turn
    const matchedDoc = (documents ?? []).find((doc: any) => {
      const docName = doc.document_name?.toLowerCase() ?? "";
      return fullSearchText.includes(docName) || docName.split(" ").some((w: string) => w.length > 3 && fullSearchText.includes(w));
    }) ?? (documents ?? [])[0]; // default to latest doc if context refers to "this document"

    const isUserQuery = (queryLower.includes("user") || queryLower.includes("member") || queryLower.includes("staff") || queryLower.includes("clerk") || queryLower.includes("principal") || queryLower.includes("hod") || queryLower.includes("who")) && !isFollowupDocQuery;
    const isCollegeQuery = (queryLower.includes("college") || queryLower.includes("institute") || queryLower.includes("campus") || queryLower.includes("another") || queryLower.includes("list")) && !isUserQuery && !isFollowupDocQuery;
    const isDocQuery = queryLower.includes("document") || queryLower.includes("cert") || queryLower.includes("file") || queryLower.includes("upload") || queryLower.includes("which") || queryLower.includes("show");
    const isExpiryQuery = queryLower.includes("expir") || queryLower.includes("due") || queryLower.includes("soon") || queryLower.includes("validity") || queryLower.includes("fire");

    // Case A: Follow-up question about a specific document (e.g. "who uploaded this document?")
    if (isFollowupDocQuery && matchedDoc) {
      dataHighlights = [matchedDoc];
      responseText = `For the document **"${matchedDoc.document_name}"** (${matchedDoc.institutes?.name ?? "MHSSCE"}):\n\n` +
        `• **Responsible Person / Uploader:** *${matchedDoc.responsible_person ?? "Assigned Uploader / Clerk"}*\n` +
        `• **Category:** \`${matchedDoc.category ?? "Compliance"}\` | **Status:** **${matchedDoc.status}**\n` +
        `• **Expiration Date:** **${matchedDoc.expiry_date}**`;
    }
    // Case B: User roster query
    else if (isUserQuery) {
      const targetUsers = matchedInst ? (users ?? []).filter((u: any) => u.institute_id === matchedInst.id) : (users ?? []);
      dataHighlights = targetUsers;

      const clerks = targetUsers.filter((u: any) => u.role === "Clerk").length;
      const hods = targetUsers.filter((u: any) => u.role === "HOD").length;
      const principals = targetUsers.filter((u: any) => u.role === "Principal").length;
      const admins = targetUsers.filter((u: any) => u.role === "Admin").length;

      responseText = `I searched your live database. There are **${targetUsers.length} total registered user(s)** ${matchedInst ? `under **${matchedInst.name}**` : "in the portal"}:\n\n` +
        `• **Clerks:** ${clerks} | **HODs:** ${hods} | **Principals:** ${principals} | **Admins:** ${admins}\n\n` +
        `**User Roster:**\n` +
        targetUsers.map((u: any, idx: number) => 
          `**${idx + 1}. ${u.full_name}** — Role: \`${u.role}\` (${u.institutes?.name ?? "All Institutes"})`
        ).join("\n");
    }
    // Intent 2: Colleges & Institutes queries
    else if (isCollegeQuery && !matchedInst) {
      dataHighlights = institutes ?? [];
      responseText = `I searched your live database. There are **${(institutes ?? []).length} registered colleges** in the portal:\n\n` +
        (institutes ?? []).map((inst: any, idx: number) => {
          const instDocs = (documents ?? []).filter((d: any) => d.institute_id === inst.id);
          const validCount = instDocs.filter((d: any) => d.status === "Valid").length;
          const score = instDocs.length > 0 ? Math.round((validCount / instDocs.length) * 100) : 0;
          return `**${idx + 1}. ${inst.name} (${inst.code})**\n` +
            `• Code: \`${inst.code}\` | Tracked Files: **${instDocs.length}** | Compliance Readiness: **${score}%**`;
        }).join("\n\n");
    }
    // Intent 3: Documents queries
    else if (isDocQuery || matchedInst) {
      const targetDocs = matchedInst ? (documents ?? []).filter((d: any) => d.institute_id === matchedInst.id) : (documents ?? []);
      dataHighlights = targetDocs;

      if (targetDocs.length > 0) {
        responseText = `Here are the compliance documents found in the database ${matchedInst ? `for **${matchedInst.name}**` : "across all colleges"}:\n\n` +
          targetDocs.map((d: any, idx: number) => 
            `**${idx + 1}. ${d.document_name}**\n` +
            `• Institution: **${d.institutes?.name ?? matchedInst?.name ?? "MHSSCE"}**\n` +
            `• Category: \`${d.category ?? "General"}\` | Status: **${d.status}**\n` +
            `• Expiry Date: **${d.expiry_date}** | Responsible Person: *${d.responsible_person ?? "Unassigned"}*`
          ).join("\n\n");
      } else {
        responseText = `No compliance documents are currently uploaded ${matchedInst ? `for **${matchedInst.name}**` : "in the system"}.`;
      }
    }
    // Intent 4: Expiration queries
    else if (isExpiryQuery) {
      const expiringDocs = (documents ?? []).filter((d: any) => d.status !== "Valid");
      dataHighlights = expiringDocs;

      if (expiringDocs.length > 0) {
        responseText = `Attention! Found **${expiringDocs.length} certificate(s)** near or past expiration:\n\n` +
          expiringDocs.map((d: any) => 
            `• **${d.document_name}** (${d.institutes?.name ?? "MHSSCE"})\n` +
            `  Expiry: **${d.expiry_date}** | Status: **${d.status}**`
          ).join("\n\n");
      } else {
        responseText = `All registered compliance certificates are currently valid and up to date!`;
      }
    }
    // Fallback General Summary
    else {
      responseText = `Here is a real-time summary of your compliance database:\n\n` +
        `• **Registered Colleges:** ${(institutes ?? []).length}\n` +
        `• **Total Documents:** ${totalDocs} (${validDocs} Valid, ${expiringDocs} Expiring)\n` +
        `• **Active Users/Staff:** ${(users ?? []).length}\n\n` +
        `Ask me anything about your data, e.g.:\n` +
        `- *"How many users are there in this portal?"*\n` +
        `- *"How many colleges are there in this portal, can you name them?"*\n` +
        `- *"Which documents have been uploaded by M.H. Saboo Siddik College of Engineering?"*`;
    }

    res.json({
      success: true,
      data: {
        answer: responseText,
        highlights: dataHighlights,
        timestamp: new Date().toISOString()
      }
    });
  })
);

export { router as copilotRoutes };

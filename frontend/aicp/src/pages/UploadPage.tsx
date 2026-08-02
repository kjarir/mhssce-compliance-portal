import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { CATEGORIES } from "@/data/types";
import { Upload, CheckCircle, AlertCircle, Loader2, Sparkles, FileSearch, Camera, FileText } from "lucide-react";

interface UploadUrlResponse {
  documentId: string;
  uploadUrl: string;
  securePath: string;
}

interface OcrScanResponse {
  totalPages: number;
  textLength: number;
  suggestedExpiryDate: string | null;
  suggestedTitle: string | null;
  detectedKeyword: string | null;
  confidence: number;
}

type UploadStep = "idle" | "generating-url" | "uploading" | "saving" | "done" | "error";

const UploadPage = () => {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [documentName, setDocumentName] = useState("");
  const [category, setCategory] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // OCR Auto-Fill State
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrResultInfo, setOcrResultInfo] = useState<string | null>(null);

  // Upload state
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setOcrResultInfo(null);

    const isSupportedOcrType = file && (
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name)
    );

    if (isSupportedOcrType) {
      setIsOcrScanning(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

        const response = await fetch(`${apiBaseUrl}/api/ocr/scan`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        const json = await response.json();
        if (json.success && json.data) {
          const ocr: OcrScanResponse = json.data;
          
          if (ocr.suggestedExpiryDate) {
            setExpiryDate(ocr.suggestedExpiryDate);
            setOcrResultInfo(
              `⚡ OCR Scanned file: Expiry date (${ocr.suggestedExpiryDate}) automatically detected!`
            );
          } else {
            setOcrResultInfo(
              `ℹ️ OCR Scanned file successfully. Please verify or enter expiry date manually.`
            );
          }

          if (ocr.suggestedTitle && !documentName) {
            setDocumentName(ocr.suggestedTitle);
          }
        }
      } catch (ocrErr) {
        console.warn("OCR Background processing failed, falling back to manual entry:", ocrErr);
      } finally {
        setIsOcrScanning(false);
      }
    }
  };

  const resetForm = () => {
    setDocumentName("");
    setCategory("");
    setResponsiblePerson("");
    setExpiryDate("");
    setSelectedFile(null);
    setUploadStep("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      setErrorMessage("Please select a file to upload.");
      setUploadStep("error");
      return;
    }

    if (!profile?.institute_id) {
      setErrorMessage("Your account is not associated with an institute.");
      setUploadStep("error");
      return;
    }

    try {
      // ── Step 1: Get signed upload URL from Express ──
      setUploadStep("generating-url");

      const { documentId, uploadUrl, securePath } =
        await apiFetch<UploadUrlResponse>("/api/documents/generate-upload-url", {
          method: "POST",
          body: JSON.stringify({
            filename: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
          }),
        });

      // ── Step 2: Upload file directly to Supabase Storage ──
      setUploadStep("uploading");

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type,
        },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("File upload to storage failed.");
      }

      // ── Step 3: Save document metadata to the database via Backend ──
      setUploadStep("saving");

      await apiFetch("/api/documents/confirm-upload", {
        method: "POST",
        body: JSON.stringify({
          documentId,
          documentName,
          category,
          responsiblePerson,
          expiryDate,
          securePath,
        }),
      });

      setUploadStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setUploadStep("error");
    }
  };

  const stepLabel: Record<UploadStep, string> = {
    idle: "",
    "generating-url": "Generating secure upload URL...",
    uploading: "Uploading file to storage...",
    saving: "Saving document metadata...",
    done: "",
    error: "",
  };

  const isSubmitting = ["generating-url", "uploading", "saving"].includes(uploadStep);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Compliance Document</h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Submit new certificates or compliance files for HOD and Principal approval
          </p>
        </div>

        {uploadStep === "done" ? (
          <div className="bg-white border border-gray-200/80 rounded-2xl p-10 text-center shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle size={32} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                Document Successfully Uploaded!
              </h2>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Your compliance file has been safely registered in the system and routed to your HOD for initial approval.
              </p>
            </div>
            <button
              onClick={resetForm}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm transition-all inline-flex items-center gap-2 mt-2"
            >
              Upload Another Document →
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200/80 rounded-2xl p-8 shadow-sm space-y-5"
          >
            {/* Error display */}
            {uploadStep === "error" && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-bold text-xs text-rose-800">Upload Failed</p>
                  <p className="text-xs text-rose-600 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {isSubmitting && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="animate-spin text-[#064E3B]" size={18} />
                <p className="font-bold text-xs text-[#064E3B]">
                  {stepLabel[uploadStep]}
                </p>
              </div>
            )}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                Document Title / Name
              </label>
              <input
                type="text"
                required
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                placeholder="e.g. Fire Safety Certificate 2026"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                  Compliance Category
                </label>
                <select
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                  Target Institute
                </label>
                <input
                  type="text"
                  readOnly
                  value={profile?.institute_id ? "Assigned Institute (Auto)" : "—"}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                  Responsible Officer / Person
                </label>
                <input
                  type="text"
                  required
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                  placeholder="e.g. Dr. Naeem Ansari"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block">
                    Document Expiry Date
                  </label>
                  {isOcrScanning && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full animate-pulse">
                      <Loader2 className="animate-spin" size={12} />
                      OCR Scanning PDF...
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  required
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] transition-all ${
                    ocrResultInfo ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold" : "bg-gray-50/50 border-gray-200"
                  }`}
                />
              </div>
            </div>

            {/* OCR Extracted Result Badge */}
            {ocrResultInfo && (
              <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3.5 flex items-center gap-3">
                <Sparkles className="text-emerald-700 shrink-0" size={18} />
                <p className="text-xs font-semibold text-emerald-900 leading-tight">
                  {ocrResultInfo}
                </p>
              </div>
            )}

            {/* File Upload Region */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                Attachment File
              </label>
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors">
                <Upload className="mx-auto text-gray-400 mb-2" size={32} />
                {selectedFile ? (
                  <p className="font-bold text-xs text-gray-800">
                    {selectedFile.name}{" "}
                    <span className="text-gray-400 font-normal">
                      ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="font-bold text-xs text-gray-800">
                      Choose a compliance file to upload
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Supports PDF, JPEG, PNG formats (Max 10MB)
                    </p>
                  </>
                )}
                {/* Standard file input (PDF/Images) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                />

                {/* Direct Camera Capture input for mobile / laptops */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                />

                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleBrowseClick}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#064E3B] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl transition-all shadow-xs"
                  >
                    <FileText size={14} />
                    {selectedFile ? "Change File" : "Select Document / File"}
                  </button>

                  <button
                    type="button"
                    onClick={handleCameraClick}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#04382B] border border-emerald-900 px-4 py-2 rounded-xl transition-all shadow-xs"
                  >
                    <Camera size={14} />
                    Take Photo
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs w-full py-3 rounded-xl shadow-sm transition-all disabled:opacity-50 mt-2"
            >
              {isSubmitting ? "Uploading Document..." : "Submit for Approval →"}
            </button>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

export default UploadPage;

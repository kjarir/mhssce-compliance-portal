import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { Upload, AlertCircle, Loader2, X } from "lucide-react";

interface RenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  documentId: string;
  documentName: string;
}

interface UploadUrlResponse {
  documentId: string;
  uploadUrl: string;
  securePath: string;
}

type UploadStep = "idle" | "generating-url" | "uploading" | "saving" | "error";

export function RenewModal({ isOpen, onClose, onSuccess, documentId, documentName }: RenewModalProps) {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const resetState = () => {
    setExpiryDate("");
    setSelectedFile(null);
    setUploadStep("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (uploadStep === "generating-url" || uploadStep === "uploading" || uploadStep === "saving") return;
    resetState();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      setErrorMessage("Please select a file to upload.");
      setUploadStep("error");
      return;
    }

    if (!expiryDate) {
      setErrorMessage("Please select a new expiry date.");
      setUploadStep("error");
      return;
    }

    if (!profile?.institute_id) {
      setErrorMessage("Your account is not associated with an institute.");
      setUploadStep("error");
      return;
    }

    try {
      setUploadStep("generating-url");

      const { uploadUrl, securePath } =
        await apiFetch<UploadUrlResponse>("/api/documents/generate-renewal-upload-url", {
          method: "POST",
          body: JSON.stringify({
            filename: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
          }),
        });

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

      setUploadStep("saving");

      const { error: insertError } = await supabase.from("document_renewals").insert({
        document_id: documentId,
        uploader_id: profile.id,
        file_path: securePath,
        expiry_date: expiryDate,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      resetState();
      onSuccess();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setUploadStep("error");
    }
  };

  const isSubmitting = ["generating-url", "uploading", "saving"].includes(uploadStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-gray-200 shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 p-5 bg-emerald-50/50">
          <h2 className="font-bold text-sm text-emerald-950 flex-1 truncate mr-4">
            Renew {documentName}
          </h2>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {uploadStep === "error" && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold text-xs text-rose-800">Upload Failed</p>
                <p className="text-xs text-rose-600 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                New Expiry Date
              </label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                Attachment / Renewal Document File
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
                    <p className="font-bold text-xs text-gray-800">Select renewal file</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Supports PDF, JPEG, PNG formats (Max 10MB)</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="mt-3 text-xs font-bold text-[#064E3B] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-1.5 rounded-xl transition-all"
                >
                  {selectedFile ? "Change File" : "Browse Files"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs w-full py-3 rounded-xl shadow-sm transition-all disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin text-white" size={16} />
                  Processing Renewal...
                </>
              ) : (
                "Submit Renewal for Review →"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

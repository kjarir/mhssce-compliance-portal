import { useState, useEffect } from "react";
import { X, Download, ExternalLink, Calendar, Building2, User, FileText, Loader2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { supabase } from "@/lib/supabase";

interface DocumentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    document_name: string;
    category: string;
    responsible_person: string;
    expiry_date: string;
    file_path: string;
    status: string;
    created_at?: string;
    institutes?: { name: string } | null;
  } | null;
}

export function DocumentDetailModal({ isOpen, onClose, document }: DocumentDetailModalProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !document?.file_path) {
      setFileUrl(null);
      return;
    }

    const fetchSignedUrl = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from("compliance-docs")
          .createSignedUrl(document.file_path, 3600);

        if (error) {
          console.error("Failed to get signed URL:", error);
          setFileUrl(null);
        } else {
          setFileUrl(data.signedUrl);
        }
      } catch (err) {
        console.error("Error creating signed URL:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const isPdf = document.file_path.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 md:p-6">
      <div className="bg-white w-full max-w-5xl h-[88vh] rounded-3xl border border-gray-200/90 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-[#064E3B] flex items-center justify-center shrink-0 border border-emerald-100">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base text-gray-900 truncate">
                {document.document_name}
              </h2>
              <p className="text-xs text-emerald-800 font-semibold truncate">
                {document.institutes?.name ?? "Institutional Document"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left / Top: Document Viewer Preview */}
          <div className="lg:col-span-8 bg-gray-900/95 flex flex-col items-center justify-center p-2 relative h-full min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-emerald-400">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-xs font-semibold text-gray-300">Loading document preview...</span>
              </div>
            ) : fileUrl ? (
              isPdf ? (
                <iframe
                  src={`${fileUrl}#toolbar=0`}
                  className="w-full h-full rounded-xl border-0"
                  title={document.document_name}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img
                    src={fileUrl}
                    alt={document.document_name}
                    className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              )
            ) : (
              <div className="text-center p-6 text-gray-400 space-y-2">
                <FileText size={40} className="mx-auto text-gray-600" />
                <p className="text-xs font-semibold">Unable to load document preview</p>
              </div>
            )}
          </div>

          {/* Right / Side: Metadata Information Card */}
          <div className="lg:col-span-4 bg-white p-6 overflow-y-auto space-y-6 border-l border-gray-100">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 mb-3">
                Status & Compliance
              </h3>
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={
                    document.status === "Valid"
                      ? "valid"
                      : document.status === "Expiring Soon"
                      ? "expiring"
                      : document.status === "Near Expiration"
                      ? "near_expiration"
                      : "expired"
                  }
                />
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-gray-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                Metadata Details
              </h3>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-50 text-gray-500 mt-0.5">
                    <Building2 size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Institute</p>
                    <p className="text-xs font-bold text-gray-900">
                      {document.institutes?.name ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-50 text-gray-500 mt-0.5">
                    <ShieldCheck size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Category</p>
                    <p className="text-xs font-bold text-gray-900">{document.category || "General Compliance"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-50 text-gray-500 mt-0.5">
                    <User size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Responsible Officer</p>
                    <p className="text-xs font-bold text-gray-900">{document.responsible_person || "Designated Clerk"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-50 text-gray-500 mt-0.5">
                    <Calendar size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Expiration Date</p>
                    <p className="text-xs font-bold text-gray-900">
                      {document.expiry_date 
                        ? new Date(document.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                        : "No Expiry Specified"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {fileUrl && (
              <div className="pt-4 border-t border-gray-100">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs py-3 rounded-xl shadow-sm transition-all"
                >
                  <ExternalLink size={14} />
                  Open PDF Fullscreen
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

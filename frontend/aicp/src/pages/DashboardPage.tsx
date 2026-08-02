import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  CheckCircle2,
  FileCheck2,
} from "lucide-react";
import { Link } from "react-router-dom";

interface DocumentRow {
  id: string;
  institute_id: string;
  uploader_id: string | null;
  document_name: string;
  category: string;
  responsible_person: string;
  expiry_date: string;
  file_path: string;
  status: "Valid" | "Expiring Soon" | "Expired";
  created_at: string;
  institutes: { name: string } | null;
}

interface ApprovalRow {
  id: string;
  document_id: string;
  step: "Pending" | "HOD Reviewed" | "Principal Approved" | "Rejected";
  created_at: string;
}

const normalizeStatus = (status: string) => {
  switch (status) {
    case "Valid":
      return "valid";
    case "Expiring Soon":
    case "Near Expiration":
      return "expiring";
    case "Expired":
      return "expired";
    default:
      return status.toLowerCase();
  }
};

const DashboardPage = () => {
  const { profile } = useAuth();
  const userRole = profile?.role ?? "";

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["documents", profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, institutes(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (data as DocumentRow[]) ?? [];

      if (userRole !== "Admin" && profile?.institute_id) {
        return list.filter((d) => d.institute_id === profile.institute_id);
      }

      return list;
    },
  });

  const { data: approvals = [], isLoading: approvalsLoading } = useQuery({
    queryKey: ["approvals", profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("*, documents(institute_id)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (data as any[]) ?? [];

      if (userRole !== "Admin" && profile?.institute_id) {
        return list.filter((a) => {
          const docObj = Array.isArray(a.documents) ? a.documents[0] : a.documents;
          return docObj?.institute_id === profile.institute_id;
        });
      }

      return list;
    },
  });

  const isLoading = docsLoading || approvalsLoading;

  const totalDocs = documents.length;
  const expiring = documents.filter((d) => d.status === "Expiring Soon").length;
  const expired = documents.filter((d) => d.status === "Expired").length;
  const pendingApprovals = approvals.filter(
    (a) => a.step !== "Principal Approved" && a.step !== "Rejected"
  ).length;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <Loader2 className="animate-spin text-[#064E3B] mb-3" size={32} />
          <p className="text-sm font-semibold">Loading dashboard metrics...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Dark Emerald Header Hero Banner */}
        <div className="bg-[#064E3B] text-white rounded-3xl p-8 md:p-10 shadow-lg relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="max-w-xl z-10">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-2">
              Dashboard Overview
            </h1>
            <p className="text-emerald-100 text-sm leading-relaxed mb-4">
              Centralized monitoring of compliance metrics across all registered institutes.
            </p>
            <button
              onClick={() => {
                const instName = documents[0]?.institutes?.name ?? "M.H. Saboo Siddik College of Engineering";
                const userName = profile?.full_name ?? "Compliance Officer";
                import("@/lib/pdfReportGenerator").then((m) => {
                  m.generateQuarterlyPdfReport(instName, documents, userName);
                });
              }}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-[#064E3B] font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all mb-4 cursor-pointer"
            >
              <FileText size={16} />
              Generate Quarterly Report (PDF)
            </button>
            <div className="flex items-center gap-8 border-t border-emerald-700/60 pt-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                  TOTAL DOCUMENTS
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-white">
                    {totalDocs}
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-800/80 text-emerald-200 px-2 py-0.5 rounded-full">
                    +2 this month
                  </span>
                </div>
              </div>

              <div className="h-8 w-[1px] bg-emerald-700/60" />

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                  PENDING APPROVALS
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-white">
                    {pendingApprovals}
                  </span>
                  <span className="text-xs text-emerald-200">
                    All tasks synced
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Banner Metric Cards */}
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto z-10">
            <div className="bg-emerald-800/40 backdrop-blur-md border border-emerald-600/40 rounded-2xl p-5 min-w-[200px]">
              <div className="flex items-center justify-between mb-4">
                <AlertTriangle className="text-amber-300" size={24} />
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded uppercase tracking-wider">
                  PRIORITY
                </span>
              </div>
              <p className="text-4xl font-extrabold text-white mb-1">
                {expiring}
              </p>
              <p className="text-xs font-bold text-white">Expiring Soon</p>
              <p className="text-[11px] text-emerald-200 mt-0.5">Action required</p>
            </div>

            <div className="bg-emerald-800/40 backdrop-blur-md border border-emerald-600/40 rounded-2xl p-5 min-w-[200px]">
              <div className="flex items-center justify-between mb-4">
                <XCircle className="text-rose-300" size={24} />
                <span className="text-[10px] font-bold bg-rose-400/20 text-rose-300 px-2 py-0.5 rounded uppercase tracking-wider">
                  CRITICAL
                </span>
              </div>
              <p className="text-4xl font-extrabold text-white mb-1">
                {expired}
              </p>
              <p className="text-xs font-bold text-white">Expired</p>
              <p className="text-[11px] text-emerald-200 mt-0.5">
                {expired === 0 ? "Clear record" : "Immediate attention"}
              </p>
            </div>
          </div>
        </div>

        {/* Content Section: Document Status Grid + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Document Status Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="text-[#064E3B]" size={20} />
                <h2 className="text-base font-bold text-gray-900">
                  Document Status
                </h2>
              </div>
              <Link
                to="/documents"
                className="text-xs font-bold text-[#064E3B] hover:underline"
              >
                View All Documents
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {documents.slice(0, 6).map((doc) => {
                const status = normalizeStatus(doc.status);
                return (
                  <div
                    key={doc.id}
                    className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-[#064E3B] flex items-center justify-center">
                          {status === "valid" ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <Clock size={18} />
                          )}
                        </div>
                        <span
                          className={
                            status === "valid"
                              ? "bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                              : status === "expiring"
                              ? "bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                              : "bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                          }
                        >
                          {doc.status}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm mb-1 line-clamp-1">
                        {doc.document_name}
                      </h3>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        {doc.institutes?.name ?? "MHSS_COLLEGE"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Col: Recent Activity Timeline */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="text-[#064E3B]" size={20} />
              <h2 className="text-base font-bold text-gray-900">
                Recent Activity
              </h2>
            </div>

            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-6">
              {documents.slice(0, 5).map((doc, idx) => (
                <div key={doc.id} className="flex gap-4 relative">
                  {idx !== documents.slice(0, 5).length - 1 && (
                    <div className="absolute left-4 top-8 bottom-[-24px] w-[2px] bg-gray-100" />
                  )}
                  <div className="w-8 h-8 rounded-full bg-[#064E3B] text-white flex items-center justify-center shrink-0 z-10">
                    <FileText size={15} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-900 font-semibold leading-snug">
                      <span className="font-bold">{doc.document_name}</span>{" "}
                      uploaded by{" "}
                      <span className="font-bold text-[#064E3B]">
                        {doc.institutes?.name ?? "MHSS_college"}
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                      RECENT • {doc.responsible_person || "SYSTEM"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Banner Section */}
        <div className="bg-emerald-100/60 border border-emerald-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-base font-bold text-[#064E3B] mb-1">
              Institutional Health Overview
            </h3>
            <p className="text-xs text-gray-600 max-w-2xl leading-relaxed">
              Your institutes are currently <span className="font-bold text-emerald-800">94% compliant</span> this quarter. Proactive documentation efforts have significantly reduced risks across all active accounts.
            </p>
          </div>
          <Link
            to="/reports"
            className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm transition-all whitespace-nowrap flex items-center gap-2"
          >
            <FileText size={16} />
            Generate Quarterly Report
          </Link>
        </div>
      </div>
    </AppLayout>
  );
};

export default DashboardPage;


import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { CATEGORIES } from "@/data/types";
import { Search, RefreshCw, Trash2, Eye, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { RenewModal } from "@/components/RenewModal";
import { DocumentDetailModal } from "@/components/DocumentDetailModal";
import { TableSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const getDaysUntilExpiry = (expiryDateIso: string) => {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const expiry = new Date(expiryDateIso).getTime();
  return Math.floor((expiry - utcToday) / MS_PER_DAY);
};

// DB row shape
interface DocumentRow {
  id: string;
  institute_id: string;
  document_name: string;
  category: string;
  responsible_person: string;
  expiry_date: string;
  file_path: string;
  status: "Valid" | "Expiring Soon" | "Near Expiration" | "Expired";
  created_at: string;
  institutes: { name: string } | null;
  document_renewals?: { id: string; status: string }[];
}

// Map DB status enum → frontend badge values
const normalizeStatus = (status: string): "valid" | "expiring" | "near_expiration" | "expired" => {
  switch (status) {
    case "Valid":
      return "valid";
    case "Expiring Soon":
      return "expiring";
    case "Near Expiration":
      return "near_expiration";
    case "Expired":
      return "expired";
    default:
      return "valid";
  }
};

const DocumentsPage = () => {
  const { user, profile } = useAuth();
  const isClerk = profile?.role === "Clerk";
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; name: string } | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailDoc, setSelectedDetailDoc] = useState<any | null>(null);

  const queryClient = useQueryClient();

  const handleOpenRenewModal = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDoc({ id, name });
    setRenewModalOpen(true);
  };

  const handleOpenDetailModal = (doc: any) => {
    setSelectedDetailDoc(doc);
    setDetailModalOpen(true);
  };

  const {
    data: documents = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ["documents", profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      // Fetch documents with their active renewals and approvals
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          institutes(name),
          document_renewals(
            id,
            status
          ),
          approvals(
            id,
            step,
            created_at
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (data as any[]) ?? [];

      // Filter: 
      // 1. Must belong to user's institute (unless Admin)
      // 2. Must be approved (if an initial approval entry exists, latest step MUST be 'Principal Approved')
      return list.filter((doc) => {
        if (profile?.role !== "Admin" && profile?.institute_id && doc.institute_id !== profile.institute_id) {
          return false;
        }

        const apprs = doc.approvals || [];
        if (apprs.length > 0) {
          // Sort approvals descending by created_at
          const sorted = [...apprs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const latestStep = sorted[0]?.step;
          // If approval is pending or rejected, hide from official Documents repository
          if (latestStep !== "Principal Approved") {
            return false;
          }
        }

        return true;
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiFetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to completely delete "${name}"? This action cannot be undone and will delete all associated renewals and approvals.`)) {
      deleteMutation.mutate(id);
    }
  };

  const filtered = documents.filter((doc) => {
    const instituteName = doc.institutes?.name ?? "";
    const matchSearch =
      doc.document_name.toLowerCase().includes(search.toLowerCase()) ||
      instituteName.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      categoryFilter === "all" || doc.category === categoryFilter;
    const normalizedStatus = normalizeStatus(doc.status);
    const matchStatus =
      statusFilter === "all" || normalizedStatus === statusFilter;
    return matchSearch && matchCategory && matchStatus;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Documents</h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Manage, filter, and track all institutional compliance certificates and documentation
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              size={16}
            />
            <input
              type="text"
              placeholder="Search documents or institutes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full md:w-56 h-10 px-3.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50 text-gray-700 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-44 h-10 px-3.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50 text-gray-700 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="valid">Valid</option>
            <option value="expiring">Expiring Soon</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* Loading state */}
        {isLoading && <TableSkeleton rows={6} />}

        {/* Error state */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="font-bold text-xs text-rose-700">
              Failed to load documents: {(error as Error).message}
            </p>
          </div>
        )}

        {/* Table Container */}
        {!isLoading && (
          <div className="bg-white border border-gray-200/80 rounded-2xl overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200/80 text-gray-500 text-[11px] font-extrabold uppercase tracking-wider">
                  <th className="px-4 sm:px-6 py-4">Document Details</th>
                  <th className="px-4 sm:px-6 py-4 hidden md:table-cell">Institute</th>
                  <th className="px-4 sm:px-6 py-4 hidden lg:table-cell">Category</th>
                  <th className="px-4 sm:px-6 py-4">Expiry Date</th>
                  <th className="px-4 sm:px-6 py-4">Status</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                {filtered.map((doc) => {
                  const status = normalizeStatus(doc.status);
                  const daysToExpiry = getDaysUntilExpiry(doc.expiry_date);
                  const isRenewable = daysToExpiry <= 90;
                  
                  const pendingRenewal = doc.document_renewals?.find(
                    (r) => r.status === "Pending HOD" || r.status === "Pending Principal"
                  );

                  return (
                    <tr
                      key={doc.id}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenDetailModal(doc);
                        }
                      }}
                      onClick={() => handleOpenDetailModal(doc)}
                      className="hover:bg-emerald-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 text-sm mb-0.5 group-hover:text-[#064E3B] transition-colors">{doc.document_name}</p>
                          <Eye size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <p className="text-[11px] text-gray-400 font-semibold uppercase">
                          {doc.responsible_person}
                        </p>
                      </td>
                      <td className="px-4 sm:px-6 py-4 hidden md:table-cell font-semibold text-gray-800">
                        {doc.institutes?.name ?? "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 hidden lg:table-cell text-gray-600">
                        {doc.category}
                      </td>
                      <td className="px-4 sm:px-6 py-4 font-semibold text-gray-700 whitespace-nowrap">
                        {doc.expiry_date}
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {isClerk && isRenewable && (
                          pendingRenewal ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 uppercase">
                              Renewal Pending
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleOpenRenewModal(doc.id, doc.document_name, e)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all"
                            >
                              <RefreshCw size={12} strokeWidth={2.5} />
                              Renew
                            </button>
                          )
                        )}
                        {!isClerk && isRenewable && pendingRenewal && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-lg px-2.5 py-1 uppercase">
                            Submitted
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.id, doc.document_name);
                          }}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center gap-1 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-all"
                          title="Delete Document"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && !isLoading && (
              <div className="text-center py-12 text-gray-400 font-semibold text-xs space-y-3">
                <p>No documents found matching your filter criteria.</p>
                {(search || categoryFilter !== "all" || statusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setCategoryFilter("all");
                      setStatusFilter("all");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#064E3B] bg-emerald-50 hover:bg-emerald-100 px-3.5 py-1.5 rounded-xl border border-emerald-200 transition-all"
                  >
                    <RotateCcw size={13} />
                    Reset All Filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedDoc && (
        <RenewModal
          isOpen={renewModalOpen}
          onClose={() => setRenewModalOpen(false)}
          onSuccess={() => {
            setRenewModalOpen(false);
            refetch();
          }}
          documentId={selectedDoc.id}
          documentName={selectedDoc.name}
        />
      )}

      {selectedDetailDoc && (
        <DocumentDetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          document={selectedDetailDoc}
        />
      )}
    </AppLayout>
  );
};

export default DocumentsPage;

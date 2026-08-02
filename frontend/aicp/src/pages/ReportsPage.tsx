import { AppLayout } from '@/components/AppLayout';
import { BrutalCard } from '@/components/BrutalCard';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIES } from '@/data/types';
import { Loader2, FileText, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface DocumentRow {
  id: string;
  institute_id: string;
  document_name: string;
  category: string;
  responsible_person?: string;
  expiry_date?: string;
  status: 'Valid' | 'Expiring Soon' | 'Expired';
  institutes: { name: string; code: string } | null;
}

const ReportsPage = () => {
  const { profile } = useAuth();

  const {
    data: documents = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['documents-reports', profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, institute_id, document_name, category, responsible_person, expiry_date, status, institutes(name, code)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data as unknown as DocumentRow[]) ?? [];

      if (profile?.role !== 'Admin' && profile?.institute_id) {
        return list.filter((d) => d.institute_id === profile.institute_id);
      }

      return list;
    },
  });

  const total = documents.length;
  const valid = documents.filter((d) => d.status === 'Valid').length;
  const expiring = documents.filter((d) => d.status === 'Expiring Soon').length;
  const expired = documents.filter((d) => d.status === 'Expired').length;

  // Category breakdown
  const categoryStats = CATEGORIES.map((cat) => {
    const docs = documents.filter((d) => d.category === cat);
    return {
      category: cat,
      total: docs.length,
      valid: docs.filter((d) => d.status === 'Valid').length,
      expiring: docs.filter((d) => d.status === 'Expiring Soon').length,
      expired: docs.filter((d) => d.status === 'Expired').length,
    };
  }).filter((c) => c.total > 0);

  // Institute health (group by institute)
  const instituteMap = new Map<
    string,
    { name: string; code: string; total: number; valid: number }
  >();

  for (const doc of documents) {
    const instId = doc.institute_id;
    const instName = doc.institutes?.name ?? 'Unknown';
    const instCode = doc.institutes?.code ?? '???';

    if (!instituteMap.has(instId)) {
      instituteMap.set(instId, { name: instName, code: instCode, total: 0, valid: 0 });
    }

    const entry = instituteMap.get(instId)!;
    entry.total++;
    if (doc.status === 'Valid') {
      entry.valid++;
    }
  }

  const instituteHealth = Array.from(instituteMap.values()).map((inst) => ({
    ...inst,
    complianceScore: inst.total > 0 ? Math.round((inst.valid / inst.total) * 100) : 0,
  }));

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin" size={24} />
            <p className="text-lg font-mono font-bold uppercase">Loading reports...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Analytics & Reports</h1>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Comprehensive audit readiness, category distribution, and institute health scorecards
            </p>
          </div>
          <button
            onClick={() => {
              const instName = documents[0]?.institutes?.name ?? "M.H. Saboo Siddik College of Engineering";
              const userName = profile?.full_name ?? "Compliance Officer";
              import("@/lib/pdfReportGenerator").then((m) => {
                m.generateQuarterlyPdfReport(instName, documents as any, userName);
              });
            }}
            className="inline-flex items-center gap-2 bg-[#064E3B] hover:bg-[#04382B] text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
          >
            <Download size={15} />
            Generate Quarterly Report (PDF)
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="font-bold text-xs text-rose-700">
              Failed to load reports: {(error as Error).message}
            </p>
          </div>
        )}

        {/* Overall Summary */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6">
          <h2 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Overall Compliance Summary</h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900">{total}</p>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">Total Records</p>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-700">{valid}</p>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-800 mt-0.5">Valid</p>
            </div>
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-extrabold text-amber-700">{expiring}</p>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-800 mt-0.5">Expiring Soon</p>
            </div>
            <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-extrabold text-rose-700">{expired}</p>
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-rose-800 mt-0.5">Expired</p>
            </div>
          </div>

          {/* Visual Bar */}
          {total > 0 && (
            <div className="space-y-2">
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${(valid / total) * 100}%` }} />
                <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${(expiring / total) * 100}%` }} />
                <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${(expired / total) * 100}%` }} />
              </div>
              <div className="flex flex-wrap justify-between items-center text-[11px] sm:text-xs font-semibold text-gray-600 gap-2 pt-1">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {Math.round((valid / total) * 100)}% Valid</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> {Math.round((expiring / total) * 100)}% Expiring</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> {Math.round((expired / total) * 100)}% Expired</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Institute Health */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Institute Health Scorecard</h2>
            <div className="divide-y divide-gray-100">
              {instituteHealth.length === 0 && (
                <p className="text-gray-400 font-semibold text-xs py-4 text-center">No institute data available.</p>
              )}
              {instituteHealth.map((inst) => (
                <div key={inst.code} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{inst.code}</p>
                    <p className="text-xs text-gray-400">{inst.name}</p>
                  </div>
                  <div className="flex items-center gap-3 w-44">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          inst.complianceScore >= 80
                            ? 'bg-emerald-500'
                            : inst.complianceScore >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${inst.complianceScore}%` }}
                      />
                    </div>
                    <span className="font-bold text-xs text-gray-700 w-9 text-right">
                      {inst.complianceScore}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Category Breakdown</h2>
            <div className="divide-y divide-gray-100">
              {categoryStats.length === 0 && (
                <p className="text-gray-400 font-semibold text-xs py-4 text-center">No category data available.</p>
              )}
              {categoryStats.map((cat) => (
                <div key={cat.category} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{cat.category}</p>
                    <div className="flex gap-1.5 mt-1">
                      {cat.valid > 0 && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">{cat.valid} valid</span>
                      )}
                      {cat.expiring > 0 && (
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">{cat.expiring} expiring</span>
                      )}
                      {cat.expired > 0 && (
                        <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">{cat.expired} expired</span>
                      )}
                    </div>
                  </div>
                  <span className="font-bold text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200/60">
                    {cat.total} docs
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ReportsPage;

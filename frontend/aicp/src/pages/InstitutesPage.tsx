import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { BrutalCard } from '@/components/BrutalCard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Building2, Plus, Loader2 } from 'lucide-react';

interface InstituteStats {
  id: string;
  name: string;
  code: string;
  totalDocuments: number;
  validDocuments: number;
  complianceScore: number;
}

const InstitutesPage = () => {
  const queryClient = useQueryClient();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch institute stats
  const {
    data: stats = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['institute-stats'],
    queryFn: () => apiFetch<InstituteStats[]>('/api/institutes/stats'),
  });

  // Create institute mutation
  const createMutation = useMutation({
    mutationFn: (payload: { name: string; code: string }) =>
      apiFetch('/api/institutes', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institute-stats'] });
      setNewName('');
      setNewCode('');
      setShowForm(false);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newName.trim() || !newCode.trim()) {
      setFormError('Name and code are required.');
      return;
    }

    createMutation.mutate({ name: newName.trim(), code: newCode.trim().toUpperCase() });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Institutes Overview</h1>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Manage compliance tracking and document health across {stats.length} registered institutes
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center justify-center gap-2 bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all shrink-0"
          >
            <Plus size={16} />
            {showForm ? 'Close Form' : 'Add Institute'}
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Register New Institute</h2>

            {formError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-rose-700">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                  Institute Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. M.H. Saboo Siddik"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">
                  Institute Code
                </label>
                <input
                  type="text"
                  required
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. MHSSCE"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                />
              </div>
              <div className="flex items-end sm:col-span-2 md:col-span-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs w-full py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Register Institute →'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin text-[#064E3B] mb-2" size={28} />
            <p className="text-xs font-semibold">Loading institutes data...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <p className="font-bold text-xs text-rose-700">
              Failed to load institutes: {(error as Error).message}
            </p>
          </div>
        )}

        {/* Data Table */}
        {!isLoading && stats.length > 0 && (
          <div className="bg-white border border-gray-200/80 rounded-2xl overflow-x-auto shadow-sm">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200/80 text-gray-500 text-[11px] font-extrabold uppercase tracking-wider">
                  <th className="px-4 sm:px-6 py-4">Institute</th>
                  <th className="px-4 sm:px-6 py-4">Code</th>
                  <th className="px-4 sm:px-6 py-4 text-center hidden sm:table-cell">Total Docs</th>
                  <th className="px-4 sm:px-6 py-4 text-center hidden sm:table-cell">Valid Docs</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-medium text-gray-700">
                {stats.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#064E3B] flex items-center justify-center font-bold shrink-0">
                          <Building2 size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{inst.name}</p>
                          <p className="text-[10px] text-gray-400 font-semibold sm:hidden">{inst.validDocuments}/{inst.totalDocuments} Valid Docs</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-semibold text-gray-600 uppercase tracking-wider">
                      {inst.code}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center font-bold text-gray-900 text-sm hidden sm:table-cell">
                      {inst.totalDocuments}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center font-bold text-emerald-700 text-sm hidden sm:table-cell">
                      {inst.validDocuments}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center justify-center gap-2 sm:gap-3 max-w-xs mx-auto">
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
                        <span className="font-bold text-xs text-gray-800 w-8 sm:w-10 text-right">
                          {inst.complianceScore}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && stats.length === 0 && !error && (
          <div className="bg-white border border-gray-200/80 rounded-2xl text-center py-16">
            <Building2 className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="font-bold text-xs text-gray-500 uppercase">
              No institutes found
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Add Institute" to register your first college.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default InstitutesPage;

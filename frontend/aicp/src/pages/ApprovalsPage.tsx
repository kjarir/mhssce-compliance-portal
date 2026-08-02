import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { BrutalCard } from '@/components/BrutalCard';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, MessageSquare, CheckCircle, XCircle, FileClock, ExternalLink, Eye } from 'lucide-react';
import { DocumentDetailModal } from '@/components/DocumentDetailModal';

const WORKFLOW_STEPS = ['Clerk Upload', 'HOD Review', 'Principal Approval', 'Approved'];
const RENEWAL_STEPS = ['Renewal Uploaded', 'HOD Review', 'Principal Approval', 'Valid'];

interface ApprovalRow {
  id: string;
  document_id: string;
  reviewer_id: string | null;
  feedback: string | null;
  step: string;
  created_at: string;
  documents: {
    id: string;
    document_name: string;
    institute_id: string;
    uploader_id: string | null;
    status: string;
    file_path: string;
    institutes: { name: string } | null;
  } | null;
  users: { full_name: string } | null;
}

interface RenewalRow {
  id: string;
  document_id: string;
  uploader_id: string;
  status: string;
  file_path: string;
  hod_feedback: string | null;
  principal_feedback: string | null;
  created_at: string;
  documents: {
    document_name: string;
    institute_id: string;
    file_path: string;
    institutes: { name: string } | null;
  } | null;
  users: { full_name: string } | null;
}

// Map step to a badge-compatible status
const stepToStatus = (step: string) => {
  switch (step) {
    case 'Principal Approved':
      return 'valid';
    case 'Rejected':
      return 'expired';
    default:
      return 'expiring';
  }
};

const ApprovalsPage = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const userRole = profile?.role ?? '';

  // Feedback state per document
  const [activeTab, setActiveTab] = useState<'initial' | 'renewals'>('initial');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  // Detail preview modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailDoc, setSelectedDetailDoc] = useState<any | null>(null);

  // Fetch approvals from Supabase (RLS will auto-scope by institute)
  const {
    data: approvals = [],
    isLoading,
  } = useQuery({
    queryKey: ['approvals', profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('*, documents(id, document_name, category, responsible_person, expiry_date, institute_id, uploader_id, status, file_path, institutes(name)), users:reviewer_id(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data as unknown as ApprovalRow[]) ?? [];

      // Filter by institute unless user is Super Admin
      if (userRole !== 'Admin' && profile?.institute_id) {
        return list.filter((a: any) => {
          const docObj = Array.isArray(a.documents) ? a.documents[0] : a.documents;
          return docObj?.institute_id === profile.institute_id;
        });
      }

      return list;
    },
  });

  const {
    data: renewals = [],
    isLoading: isRenewalsLoading,
  } = useQuery({
    queryKey: ['renewals', profile?.id, profile?.institute_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_renewals')
        .select('*, documents:document_id(id, document_name, category, responsible_person, expiry_date, institute_id, file_path, institutes(name)), users:uploader_id(full_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (data as unknown as RenewalRow[]) ?? [];

      // Filter: Only show pending renewals (status !== 'Approved' && status !== 'Rejected') & match institute unless user is Super Admin
      return list.filter((r: any) => {
        if (r.status === 'Approved' || r.status === 'Rejected') return false;
        if (userRole !== 'Admin' && profile?.institute_id) {
          const docObj = Array.isArray(r.documents) ? r.documents[0] : r.documents;
          return docObj?.institute_id === profile.institute_id;
        }
        return true;
      });
    },
  });

  // Submit approval/feedback mutation
  const submitMutation = useMutation({
    mutationFn: (payload: { documentId: string; feedback: string; action: string }) =>
      apiFetch('/api/approvals', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setFeedbackMap({});
      setExpandedDoc(null);
    },
    onError: (err: any) => {
      alert(err instanceof Error ? err.message : 'Failed to submit approval review');
    },
  });

  const reviewRenewalMutation = useMutation({
    mutationFn: (payload: { renewalId: string; action: 'approve' | 'reject'; feedback?: string }) =>
      apiFetch(`/api/documents/renewals/${payload.renewalId}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: payload.action, feedback: payload.feedback }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setFeedbackMap({});
      setExpandedDoc(null);
    },
    onError: (err: any) => {
      alert(err instanceof Error ? err.message : 'Failed to review document renewal');
    },
  });

  const handleAction = (documentId: string, action: 'feedback' | 'approve' | 'reject') => {
    const fb = feedbackMap[documentId]?.trim() || (action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Reviewed');

    submitMutation.mutate({
      documentId,
      feedback: fb,
      action,
    });
  };

  const handleRenewalAction = (renewalId: string, action: 'approve' | 'reject') => {
    const fb = feedbackMap[renewalId];
    if (userRole === 'HOD' && !fb?.trim()) {
       // Only strictly require feedback if HOD rejects, but let's enforce if we want
    }

    reviewRenewalMutation.mutate({
      renewalId,
      action,
      feedback: fb?.trim(),
    });
  };

  const handleViewDocument = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("compliance-docs")
        .createSignedUrl(filePath, 60 * 60); // 1 hour

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (err) {
      alert("Failed to open document: " + (err as Error).message);
    }
  };

  // Group approvals by document for better display
  const uniqueDocIds = new Set<string>();
  const latestPerDoc: ApprovalRow[] = [];

  for (const approval of approvals) {
    if (!uniqueDocIds.has(approval.document_id)) {
      uniqueDocIds.add(approval.document_id);
      latestPerDoc.push(approval);
    }
  }

  // Get all feedback for a specific document
  const getFeedbackForDoc = (docId: string) => {
    return approvals.filter((a) => a.document_id === docId && a.feedback);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals & Workflow</h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            {userRole === 'Admin'
              ? 'Overview of all document approvals and review pipelines across institutes'
              : 'Track, review, and process compliance document approvals'}
          </p>
        </div>

        {/* Tabs & Workflow Pipeline */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap gap-2 sm:gap-3 border-b border-gray-100 pb-3">
            <button
              onClick={() => setActiveTab('initial')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'initial'
                  ? 'bg-[#064E3B] text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Initial Approvals
            </button>
            <button
              onClick={() => setActiveTab('renewals')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'renewals'
                  ? 'bg-[#064E3B] text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileClock size={15} />
              Renewals Pipeline
            </button>
          </div>

          {/* Workflow Pipeline Progress */}
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex items-center gap-2 sm:gap-3 min-w-max">
              {(activeTab === 'initial' ? WORKFLOW_STEPS : RENEWAL_STEPS).map((step, idx) => (
                <div key={step} className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-emerald-50 text-[#064E3B] border border-emerald-200 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap">
                    {step}
                  </div>
                  {idx < (activeTab === 'initial' ? WORKFLOW_STEPS.length : RENEWAL_STEPS.length) - 1 && (
                    <ArrowRight className="text-gray-300 shrink-0" size={14} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {(isLoading || isRenewalsLoading) && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin text-[#064E3B] mb-2" size={28} />
            <p className="text-xs font-semibold">Loading approval queue...</p>
          </div>
        )}

        {/* Approvals List */}
        {!isLoading && activeTab === 'initial' && (
          <div className="space-y-4">
            {latestPerDoc.length === 0 && (
              <div className="bg-white border border-gray-200/80 rounded-2xl text-center py-16 text-xs text-gray-400 font-semibold uppercase">
                No pending initial approvals found.
              </div>
            )}

            {latestPerDoc.filter(a => a.step !== 'Principal Approved' && a.step !== 'Rejected').map((approval: any) => {
              const docObj = Array.isArray(approval.documents) ? approval.documents[0] : approval.documents;
              const instObj = docObj?.institutes;
              const instName = Array.isArray(instObj) ? instObj[0]?.name : instObj?.name;
              const docName = docObj?.document_name ?? 'Compliance Document';
              const displayInst = instName ?? 'M.H. Saboo Siddik College of Engineering';
              const reviewerName = (Array.isArray(approval.users) ? approval.users[0]?.full_name : approval.users?.full_name) ?? 'Clerk';
              const isExpanded = expandedDoc === approval.document_id;
              const docFeedback = getFeedbackForDoc(approval.document_id);
              const feedbackText = feedbackMap[approval.document_id] ?? '';

              return (
                <div key={approval.id} className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div 
                      className="flex-1 min-w-0 cursor-pointer group"
                      onClick={() => {
                        if (docObj) {
                          setSelectedDetailDoc({
                            ...docObj,
                            document_name: docName,
                            institutes: { name: displayInst }
                          });
                          setDetailModalOpen(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 text-sm mb-0.5 truncate group-hover:text-[#064E3B] transition-colors">{docName}</h3>
                        <Eye size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-xs font-semibold text-emerald-800 truncate">{displayInst}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Last reviewed by <span className="font-bold text-gray-700">{reviewerName}</span> on{' '}
                        {new Date(approval.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <StatusBadge status={stepToStatus(approval.step) as 'valid' | 'expiring' | 'expired'} />

                      {(userRole === 'HOD' || userRole === 'Principal' || userRole === 'Admin') && (
                        <div className="flex gap-2">
                          {docObj?.file_path && (
                            <button
                              className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-all"
                              onClick={() => {
                                setSelectedDetailDoc({
                                  ...docObj,
                                  document_name: docName,
                                  institutes: { name: displayInst }
                                });
                                setDetailModalOpen(true);
                              }}
                            >
                              <Eye size={14} />
                              View Details
                            </button>
                          )}
                          {approval.step !== 'Principal Approved' && approval.step !== 'Rejected' && (
                            <button
                              className="inline-flex items-center gap-1 text-xs font-bold bg-[#064E3B] hover:bg-[#04382B] text-white px-3.5 py-2 rounded-xl transition-all shadow-sm"
                              onClick={() =>
                                setExpandedDoc(isExpanded ? null : approval.document_id)
                              }
                            >
                              <MessageSquare size={14} />
                              {isExpanded ? 'Close' : 'Review'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Review Panel */}
                  {isExpanded && (
                    <div className="mt-5 border-t border-gray-100 pt-5 space-y-4">
                      {/* Previous Feedback */}
                      {docFeedback.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                            Audit Trail & Feedback
                          </h4>
                          <div className="space-y-2">
                            {docFeedback.map((fb) => (
                              <div
                                key={fb.id}
                                className="bg-gray-50 border border-gray-200/60 rounded-xl p-3"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-bold text-gray-900">
                                    {fb.users?.full_name ?? 'Reviewer'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-semibold">
                                    {new Date(fb.created_at).toLocaleDateString()} · {fb.step}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed">{fb.feedback}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Feedback Input */}
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                          Reviewer Comments
                        </label>
                        <textarea
                          value={feedbackText}
                          onChange={(e) =>
                            setFeedbackMap((prev) => ({
                              ...prev,
                              [approval.document_id]: e.target.value,
                            }))
                          }
                          placeholder="Provide review notes or decision details..."
                          rows={3}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap pt-1">
                        {userRole === 'HOD' && (
                          approval.step === 'HOD Reviewed' ? (
                            <div className="bg-emerald-100 text-emerald-800 font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                              <CheckCircle size={15} /> Approved by HOD (Pending Principal Review)
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleAction(approval.document_id, 'approve')}
                                disabled={submitMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                              >
                                <CheckCircle size={14} /> Approve to Principal
                              </button>
                              <button
                                onClick={() => handleAction(approval.document_id, 'reject')}
                                disabled={submitMutation.isPending}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )
                        )}

                        {(userRole === 'Principal' || userRole === 'Admin') && (
                          <>
                            <button
                              onClick={() => handleAction(approval.document_id, 'approve')}
                              disabled={submitMutation.isPending || !feedbackText.trim()}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              <CheckCircle size={14} />
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(approval.document_id, 'reject')}
                              disabled={submitMutation.isPending || !feedbackText.trim()}
                              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Renewals List */}
        {!isRenewalsLoading && activeTab === 'renewals' && (
          <div className="space-y-4">
            {renewals.length === 0 && (
              <div className="bg-white border border-gray-200/80 rounded-2xl text-center py-16 text-xs text-gray-400 font-semibold uppercase">
                No active document renewals pending.
              </div>
            )}

            {renewals.map((renewal: any) => {
              const docObj = Array.isArray(renewal.documents) ? renewal.documents[0] : renewal.documents;
              const instObj = docObj?.institutes;
              const instName = Array.isArray(instObj) ? instObj[0]?.name : instObj?.name;
              const docName = docObj?.document_name ?? 'Compliance Document';
              const displayInst = instName ?? 'M.H. Saboo Siddik College of Engineering';
              const uploaderName = (Array.isArray(renewal.users) ? renewal.users[0]?.full_name : renewal.users?.full_name) ?? 'Clerk';
              const isExpanded = expandedDoc === renewal.id;
              const feedbackText = feedbackMap[renewal.id] ?? '';

              return (
                <div key={renewal.id} className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div 
                      className="flex-1 cursor-pointer group"
                      onClick={() => {
                        if (docObj) {
                          setSelectedDetailDoc({
                            ...docObj,
                            document_name: `${docName} (Renewal)`,
                            file_path: renewal.file_path,
                            expiry_date: renewal.expiry_date || docObj.expiry_date,
                            institutes: { name: displayInst }
                          });
                          setDetailModalOpen(true);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 text-sm mb-0.5 group-hover:text-[#064E3B] transition-colors">{docName} <span className="text-amber-700 italic text-xs">(Renewal)</span></h3>
                        <Eye size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-xs font-semibold text-emerald-800">{displayInst}</p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Uploaded by <span className="font-bold text-gray-700">{uploaderName}</span> on{' '}
                        {new Date(renewal.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <StatusBadge status={
                        renewal.status === 'Approved' ? 'approved' :
                        renewal.status === 'Rejected' ? 'rejected' : 'pending_review'
                      } />

                      {(userRole === 'HOD' || userRole === 'Principal' || userRole === 'Admin') && (
                        <div className="flex gap-2">
                          <button
                            className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl transition-all"
                            onClick={() => {
                              setSelectedDetailDoc({
                                ...docObj,
                                document_name: `${docName} (Renewal)`,
                                file_path: renewal.file_path,
                                expiry_date: renewal.expiry_date || docObj.expiry_date,
                                institutes: { name: displayInst }
                              });
                              setDetailModalOpen(true);
                            }}
                          >
                            <Eye size={14} />
                            View Details
                          </button>
                          {renewal.status !== 'Approved' && renewal.status !== 'Rejected' && (
                            <button
                              className="inline-flex items-center gap-1 text-xs font-bold bg-[#064E3B] hover:bg-[#04382B] text-white px-4 py-2 rounded-xl transition-all shadow-sm"
                              onClick={() => setExpandedDoc(isExpanded ? null : renewal.id)}
                            >
                              <MessageSquare size={14} />
                              {isExpanded ? 'Close' : 'Review'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-5 border-t border-gray-100 pt-5 space-y-4">
                      {/* Audit Trail & HOD Feedback for Renewals */}
                      {renewal.hod_feedback && (
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                            Audit Trail & HOD Feedback
                          </h4>
                          <div className="space-y-2">
                            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                  <CheckCircle size={14} className="text-emerald-600" />
                                  HOD Review & Recommendation
                                </span>
                                <span className="text-[10px] text-emerald-700 font-semibold uppercase">
                                  Passed to Principal
                                </span>
                              </div>
                              <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                                "{renewal.hod_feedback}"
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                          Review Findings
                        </label>
                        <textarea
                          value={feedbackText}
                          onChange={(e) =>
                            setFeedbackMap((prev) => ({
                              ...prev,
                              [renewal.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional review notes..."
                          rows={3}
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-gray-50/50"
                        />
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {userRole === 'HOD' ? (
                          renewal.status === 'Pending Principal' || renewal.hod_feedback ? (
                            <div className="bg-emerald-100 text-emerald-800 font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                              <CheckCircle size={15} /> Approved by HOD (Pending Principal Review)
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleRenewalAction(renewal.id, 'approve')}
                                disabled={reviewRenewalMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                              >
                                <CheckCircle size={14} /> Approve to Principal
                              </button>
                              <button
                                onClick={() => handleRenewalAction(renewal.id, 'reject')}
                                disabled={reviewRenewalMutation.isPending}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )
                        ) : (userRole === 'Principal' || userRole === 'Admin') ? (
                          <>
                            <button
                              onClick={() => handleRenewalAction(renewal.id, 'approve')}
                              disabled={reviewRenewalMutation.isPending}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                            >
                              <CheckCircle size={14} /> Final Approve
                            </button>
                            <button
                              onClick={() => handleRenewalAction(renewal.id, 'reject')}
                              disabled={reviewRenewalMutation.isPending}
                              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-1.5"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {selectedDetailDoc && (
          <DocumentDetailModal
            isOpen={detailModalOpen}
            onClose={() => setDetailModalOpen(false)}
            document={selectedDetailDoc}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default ApprovalsPage;

import { DocumentStatus, ApprovalStatus } from '@/data/types';

type BadgeStatus = DocumentStatus | ApprovalStatus;

interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

const STATUS_CONFIG: Record<
  BadgeStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  valid: {
    label: "Valid",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
  },
  expiring: {
    label: "Expiring Soon",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
  },
  near_expiration: {
    label: "Near Expiration",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
  },
  expired: {
    label: "Expired",
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
  },
  pending_review: {
    label: "Pending Review",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200/80",
    dot: "bg-blue-500",
  },
  pending_approval: {
    label: "Pending Approval",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200/80",
    dot: "bg-blue-500",
  },
  pending_verification: {
    label: "Pending Verification",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200/80",
    dot: "bg-blue-500",
  },
  approved: {
    label: "Approved",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
  },
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.valid;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-tight uppercase ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
}

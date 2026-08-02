import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const VARIANT_STYLES: Record<string, string> = {
  default: 'bg-white text-gray-900',
  success: 'bg-emerald-50/70 text-emerald-900 border-emerald-200/80',
  warning: 'bg-amber-50/70 text-amber-900 border-amber-200/80',
  danger: 'bg-rose-50/70 text-rose-900 border-rose-200/80',
};

export function StatCard({ label, value, icon, variant = 'default' }: StatCardProps) {
  return (
    <div
      className={`${VARIANT_STYLES[variant]} border border-gray-200/80 rounded-2xl p-5 flex items-start justify-between shadow-sm`}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="text-3xl font-extrabold text-gray-900 mt-1">{value}</p>
      </div>
      <div className="text-emerald-700 p-2.5 rounded-xl bg-gray-50 border border-gray-100">{icon}</div>
    </div>
  );
}

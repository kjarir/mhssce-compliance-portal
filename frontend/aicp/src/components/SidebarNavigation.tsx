import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  Building2,
  Upload,
  CheckSquare,
  BarChart3,
  LogOut,
  Menu,
  X,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Institutes", path: "/institutes", icon: Building2, roles: ["Admin"] },
  { label: "Documents", path: "/documents", icon: FileText },
  { label: "Upload", path: "/upload", icon: Upload, roles: ["Clerk"] },
  { label: "Approvals", path: "/approvals", icon: CheckSquare, roles: ["Admin", "HOD", "Principal"] },
  { label: "Reports", path: "/reports", icon: BarChart3 },
];

export function SidebarNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const userRole = profile?.role ?? "User";

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return item.roles.includes(userRole);
    });
  }, [userRole]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile Menu Toggle Button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#064E3B] text-white p-2.5 rounded-xl shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-[#064E3B] text-white flex flex-col h-[100dvh] shrink-0 transition-transform duration-200 ease-in-out overflow-y-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-emerald-800/60 flex items-center gap-3.5 shrink-0">
          <Link to="/dashboard" className="block shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-white p-1.5 flex items-center justify-center shadow-md border border-emerald-100 transition-transform hover:scale-105">
              <img
                src="/logo1.png"
                alt="Anjuman-I-Islam Logo"
                className="max-h-full max-w-full object-contain filter drop-shadow-xs"
              />
            </div>
          </Link>
          <div className="min-w-0">
            <h1 className="font-extrabold text-sm tracking-tight text-white leading-tight">
              Anjuman's
            </h1>
            <p className="text-[10px] font-extrabold text-emerald-200 uppercase tracking-widest mt-0.5">
              Compliance Portal
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3.5 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-150 ${
                  isActive
                    ? "bg-white text-[#064E3B] shadow-sm font-bold"
                    : "text-emerald-100/90 hover:bg-emerald-800/60 hover:text-white"
                }`}
              >
                <item.icon size={18} className={isActive ? "text-[#064E3B]" : "text-emerald-300"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer User Profile & Logout */}
        <div className="p-4 m-4 shrink-0 rounded-2xl bg-emerald-800/50 border border-emerald-700/50 flex items-center justify-between gap-3 sticky bottom-4 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-600">
              <UserCheck size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {profile?.full_name ?? "User"}
              </p>
              <p className="text-[10px] font-bold text-emerald-200/80 uppercase tracking-wider truncate">
                {userRole}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="p-2 text-emerald-200 hover:text-white hover:bg-rose-600/80 bg-emerald-900/40 rounded-xl transition-colors shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

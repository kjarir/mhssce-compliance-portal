import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  Building2,
  Upload,
  CheckSquare,
  BarChart3,
  LogOut,
  UserCheck,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "./NotificationBell";
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

export function TopNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

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
    <header className="bg-white border-b border-gray-200/80 sticky top-0 z-40 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-[#064E3B] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              AICP
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-tight text-gray-900 leading-none">
                AICP
              </span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                COMPLIANCE
              </span>
            </div>
          </Link>

          {/* Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-gray-100/80 p-1 rounded-full border border-gray-200/50">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 ${
                    isActive
                      ? "bg-[#064E3B] text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
                  }`}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right User Actions */}
        <div className="flex items-center gap-4">
          <NotificationBell />

          <div className="h-5 w-[1px] bg-gray-200 hidden sm:block" />

          {/* User Profile Info */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-900 leading-snug">
                {profile?.full_name ?? "User"}
              </p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {userRole} ACCESS
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#064E3B] flex items-center justify-center font-bold text-xs border border-emerald-300">
              <UserCheck size={16} />
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <nav className="flex md:hidden items-center justify-around mt-3 pt-2 border-t border-gray-100 overflow-x-auto gap-1">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${
                isActive
                  ? "bg-[#064E3B] text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

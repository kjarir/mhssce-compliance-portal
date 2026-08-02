import { ReactNode, useState } from 'react';
import { SidebarNavigation } from './SidebarNavigation';
import { NotificationBell } from './NotificationBell';
import { Bot } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CopilotModal } from './CopilotModal';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { profile } = useAuth();
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const isSuperAdminOrPrincipal = profile?.role === 'Admin' || profile?.role === 'Principal';

  return (
    <div className="h-screen bg-[#F4F6F5] flex w-full overflow-hidden relative">
      <SidebarNavigation />
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
          {/* Top Bar for Bell */}
          <div className="px-8 pt-6 pb-4 flex justify-end shrink-0 max-w-7xl w-full mx-auto">
            <NotificationBell />
          </div>

          {/* Main Page Container */}
          <main className="flex-1 px-6 pb-6 md:px-8 md:pb-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

      {/* Floating Robot Icon Button (Bottom Right) */}
      {isSuperAdminOrPrincipal && (
        <button
          onClick={() => setIsCopilotOpen(true)}
          title="Ask Compliance Copilot AI"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-[#064E3B] hover:bg-[#04382B] text-white flex items-center justify-center shadow-2xl hover:shadow-emerald-950/40 border-2 border-emerald-400/50 transition-all transform hover:scale-110 active:scale-95"
        >
          <Bot size={26} />
        </button>
      )}

      {/* Copilot Modal Popup */}
      <CopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
      />
    </div>
  );
}



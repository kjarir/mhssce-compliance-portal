import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Sparkles, Send, Bot, User, ShieldAlert, Loader2, RefreshCw } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  highlights?: any[];
}

const CopilotPage = () => {
  const { profile } = useAuth();
  const userRole = profile?.role ?? "";
  const isSuperAdminOrPrincipal = userRole === "Admin" || userRole === "Principal";

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      sender: "copilot",
      text: `Hello **${profile?.full_name ?? "Executive"}**! I am your **Compliance Copilot AI** assistant.\n\nI have direct read access to your real-time database documents, expiration trackers, and NAAC/NBA readiness scores across all institutes.\n\nHere are some questions you can ask me:`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input.trim();
    if (!promptToSend || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => !m.id.startsWith("welcome"))
        .map((m) => ({
          sender: m.sender,
          text: m.text,
        }));

      const response = await apiFetch<{
        answer: string;
        highlights?: any[];
        timestamp: string;
      }>("/api/copilot/query", {
        method: "POST",
        body: JSON.stringify({
          prompt: promptToSend,
          history,
        }),
      });

      const botMessage: Message = {
        id: `msg-bot-${Date.now()}`,
        sender: "copilot",
        text: response.answer,
        highlights: response.highlights,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: `msg-err-${Date.now()}`,
        sender: "copilot",
        text: `⚠️ **Error Processing Query:** ${err instanceof Error ? err.message : "Failed to connect to Compliance Copilot engine."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    "Which departments are below 70% readiness for NAAC?",
    "Show me all fire safety certs expiring this semester",
    "List all pending document approvals requiring Principal review",
    "Give me an executive compliance health summary across all colleges",
  ];

  if (!isSuperAdminOrPrincipal) {
    return (
      <AppLayout>
        <div className="max-w-md mx-auto my-12 bg-white border border-rose-200 rounded-3xl p-8 text-center shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Restricted Access</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            The **Compliance Copilot AI** assistant is exclusively restricted to **Super Admin** and **Principal** accounts for enterprise data security.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-4 pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#064E3B] text-white flex items-center justify-center shadow-sm">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Compliance Copilot AI
                <span className="text-[10px] font-extrabold bg-emerald-100 text-[#064E3B] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Super Admin
                </span>
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Ask natural language queries over your live PostgreSQL compliance database
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              setMessages([
                {
                  id: "welcome-reset",
                  sender: "copilot",
                  text: "Chat context reset. How can I assist you with your compliance records?",
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                },
              ])
            }
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
            title="Reset Chat"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Chat Messages Container */}
        <div className="flex-1 bg-white border border-gray-200/80 rounded-3xl p-6 overflow-y-auto shadow-sm space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-4 ${
                msg.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-xs font-bold ${
                  msg.sender === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-[#064E3B] text-white"
                }`}
              >
                {msg.sender === "user" ? <User size={16} /> : <Bot size={18} />}
              </div>

              <div
                className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-[#064E3B] text-white font-medium rounded-tr-none"
                    : "bg-gray-50 border border-gray-200/70 text-gray-800 rounded-tl-none space-y-3"
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">
                  {msg.text.split("\n").map((paragraph, idx) => (
                    <p key={idx} className={idx > 0 ? "mt-2" : ""}>
                      {paragraph.split("**").map((part, pIdx) =>
                        pIdx % 2 === 1 ? (
                          <strong key={pIdx} className={msg.sender === "user" ? "font-bold text-emerald-200" : "font-bold text-gray-900"}>
                            {part}
                          </strong>
                        ) : (
                          part
                        )
                      )}
                    </p>
                  ))}
                </div>

                {/* Direct Sample Suggestions on welcome */}
                {msg.id.startsWith("welcome") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {samplePrompts.map((prompt, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => handleSend(prompt)}
                        className="text-left bg-white hover:bg-emerald-50 border border-gray-200/80 hover:border-emerald-200 p-2.5 rounded-xl text-gray-700 hover:text-[#064E3B] font-semibold text-[11px] transition-all shadow-xs"
                      >
                        "{prompt}"
                      </button>
                    ))}
                  </div>
                )}

                <p
                  className={`text-[9px] font-bold uppercase tracking-wider text-right mt-1.5 ${
                    msg.sender === "user" ? "text-emerald-200/70" : "text-gray-400"
                  }`}
                >
                  {msg.timestamp}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4">
              <div className="w-9 h-9 rounded-2xl bg-[#064E3B] text-white flex items-center justify-center shrink-0">
                <Bot size={18} />
              </div>
              <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4 text-xs font-semibold text-gray-500 flex items-center gap-2">
                <Loader2 className="animate-spin text-[#064E3B]" size={16} />
                Analyzing database & querying compliance engine...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="pt-4 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-3 bg-white border border-gray-200/90 rounded-2xl p-2 shadow-sm"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot (e.g., 'show me fire safety certs expiring soon' or 'readiness below 70%')..."
              disabled={loading}
              className="flex-1 px-4 py-2 text-xs font-semibold focus:outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all disabled:opacity-40 flex items-center gap-2"
            >
              <span>Ask Copilot</span>
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
};

export default CopilotPage;

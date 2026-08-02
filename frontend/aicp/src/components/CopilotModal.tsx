import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { Sparkles, Send, Bot, User, Loader2, RefreshCw, X } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
}

interface CopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CopilotModal = ({ isOpen, onClose }: CopilotModalProps) => {
  const { profile } = useAuth();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      sender: "copilot",
      text: `Hello **${profile?.full_name ?? "Executive"}**! I am your **Compliance Copilot AI** assistant.\n\nAsk me anything about your documents, colleges, staff users, or expiring certificates!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isOpen]);

  if (!isOpen) return null;

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
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: `msg-err-${Date.now()}`,
        sender: "copilot",
        text: `⚠️ **Error:** ${err instanceof Error ? err.message : "Failed to query Copilot engine."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    "How many colleges are there in this portal?",
    "Show documents for Saboo Siddik",
    "How many users are registered?",
    "Show certificates expiring soon",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-4 sm:p-6 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200/90 rounded-3xl w-full max-w-lg h-[90vh] sm:h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#064E3B] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700/60 text-emerald-200 flex items-center justify-center border border-emerald-600">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="font-bold text-sm flex items-center gap-2 text-white">
                Compliance Copilot AI
                <span className="text-[9px] bg-emerald-100 text-[#064E3B] font-extrabold px-2 py-0.5 rounded-full uppercase">
                  Super Admin
                </span>
              </h2>
              <p className="text-[11px] text-emerald-200/90 font-medium">
                Live PostgreSQL database assistant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setMessages([
                  {
                    id: "welcome-reset",
                    sender: "copilot",
                    text: "Chat context reset. How can I assist you?",
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  },
                ])
              }
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-xl transition-all"
              title="Reset Chat"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-xl transition-all"
              title="Close Copilot"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${
                msg.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                  msg.sender === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-[#064E3B] text-white"
                }`}
              >
                {msg.sender === "user" ? <User size={14} /> : <Bot size={15} />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-[#064E3B] text-white font-medium rounded-tr-none"
                    : "bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-xs space-y-2"
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">
                  {msg.text.split("\n").map((paragraph, idx) => (
                    <p key={idx} className={idx > 0 ? "mt-1.5" : ""}>
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

                {msg.id.startsWith("welcome") && (
                  <div className="flex flex-col gap-1.5 pt-2">
                    {samplePrompts.map((prompt, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => handleSend(prompt)}
                        className="text-left bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl text-[#064E3B] font-semibold text-[11px] transition-all"
                      >
                        "{prompt}"
                      </button>
                    ))}
                  </div>
                )}

                <p
                  className={`text-[9px] font-bold uppercase tracking-wider text-right mt-1 ${
                    msg.sender === "user" ? "text-emerald-200/70" : "text-gray-400"
                  }`}
                >
                  {msg.timestamp}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-xl bg-[#064E3B] text-white flex items-center justify-center shrink-0">
                <Bot size={15} />
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 text-xs font-semibold text-gray-500 flex items-center gap-2 shadow-xs">
                <Loader2 className="animate-spin text-[#064E3B]" size={14} />
                Analyzing database...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-gray-200 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Copilot..."
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white p-2.5 rounded-xl font-bold transition-all disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

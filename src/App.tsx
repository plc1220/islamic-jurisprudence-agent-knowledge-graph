import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Network,
  BookOpen,
  Compass,
  Send,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  Lock,
  Globe,
  BarChart3,
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
  X,
  RefreshCw,
} from "lucide-react";

import {
  AppTab,
  ChatMessage,
  FeedbackAnalytics,
  FeedbackRecord,
  FeedbackReviewStatus,
  KnowledgeNode,
  KnowledgeLink,
  PersistedAppState,
} from "./types";
import { OFFICIAL_SOURCES, PRESET_QUESTIONS, INITIAL_NODES, INITIAL_LINKS } from "./data";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { SourceCard } from "./components/SourceCard";
import { CrawlerPanel } from "./components/CrawlerPanel";
import { ChatMarkdownRenderer } from "./components/ChatMarkdownRenderer";
import { RelevantGraphSnippet } from "./components/RelevantGraphSnippet";

const createWelcomeMessage = (): ChatMessage => ({
  id: "welcome",
  role: "model",
  content: "Assalamualaikum rukun ilmuwan. Saya adalah Ejen Pakar Syariah Islam berpandukan Mazhab Syafi'i dan rujukan berautoriti Malaysia (seperti JAKIM & Jabatan Mufti WP). Sila tanyakan kemusykilan hukum fiqh, hadis, fatwa semasa, atau soalan sejarah Islam anda di bawah.",
  timestamp: new Date(),
});

function reviveChatMessages(messages: any): ChatMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => {
      const timestamp = new Date(message.timestamp);
      return {
        ...message,
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
      } as ChatMessage;
    });
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const [graphSubTab, setGraphSubTab] = useState<"visualize" | "ingest">("visualize");
  const [isAgentInfoOpen, setIsAgentInfoOpen] = useState(false);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  const [pendingSelectedNodeId, setPendingSelectedNodeId] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage()]);
  const [userInput, setUserInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [feedbackRecords, setFeedbackRecords] = useState<FeedbackRecord[]>([]);
  const [feedbackAnalytics, setFeedbackAnalytics] = useState<FeedbackAnalytics>({
    total: 0,
    thumbsUp: 0,
    thumbsDown: 0,
    downRate: 0,
    newItems: 0,
    queuedImprovements: 0,
    draftedImprovements: 0,
  });
  const [feedbackModal, setFeedbackModal] = useState<{
    message: ChatMessage;
    question: string;
  } | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);

  // Active Knowledge Graph data state
  const [nodes, setNodes] = useState<KnowledgeNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<KnowledgeLink[]>(INITIAL_LINKS);
  
  // Custom states
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Chat scroll container
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const persistSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: chatMessages.length > 1 || isChatLoading ? "smooth" : "auto",
    });
  }, [chatMessages, isChatLoading]);

  const refreshFeedback = async () => {
    try {
      const response = await fetch("/api/feedback");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal membaca maklum balas.");
      }
      setFeedbackRecords(data.records || []);
      if (data.analytics) setFeedbackAnalytics(data.analytics);
    } catch (err: any) {
      console.error("Gagal membaca maklum balas:", err);
      setGlobalError(err.message || "Gagal membaca maklum balas.");
    }
  };

  useEffect(() => {
    refreshFeedback();
  }, []);

  const getFeedbackForMessage = (messageId: string) =>
    feedbackRecords.find((record) => record.messageId === messageId);

  const submitFeedback = async (payload: {
    message: ChatMessage;
    question: string;
    rating: "up" | "down";
    comment?: string;
  }) => {
    setIsFeedbackSaving(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: payload.message.id,
          rating: payload.rating,
          question: payload.question,
          answer: payload.message.content,
          comment: payload.comment || "",
          citations: payload.message.citations || [],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal menyimpan maklum balas.");
      }
      await refreshFeedback();
      setSuccessNotice(
        payload.rating === "up"
          ? "Terima kasih. Jawapan ini ditanda membantu."
          : "Maklum balas dihantar ke Review Bench untuk semakan."
      );
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menyimpan maklum balas.");
    } finally {
      setIsFeedbackSaving(false);
    }
  };

  const handleThumbsDownSubmit = async () => {
    if (!feedbackModal) return;
    await submitFeedback({
      message: feedbackModal.message,
      question: feedbackModal.question,
      rating: "down",
      comment: feedbackComment,
    });
    setFeedbackModal(null);
    setFeedbackComment("");
  };

  const updateFeedbackRecord = async (
    record: FeedbackRecord,
    patch: Partial<Pick<FeedbackRecord, "reviewStatus" | "reviewerNote" | "pipelineStatus" | "improvementPlan">>
  ) => {
    try {
      const response = await fetch(`/api/feedback/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mengemas kini Review Bench.");
      await refreshFeedback();
    } catch (err: any) {
      setGlobalError(err.message || "Gagal mengemas kini Review Bench.");
    }
  };

  const draftImprovementPlan = async (record: FeedbackRecord) => {
    try {
      const response = await fetch(`/api/feedback/${record.id}/improvement`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membina pelan penambahbaikan.");
      await refreshFeedback();
      setSuccessNotice("Pelan penambahbaikan telah didraf untuk semakan reviewer.");
    } catch (err: any) {
      setGlobalError(err.message || "Gagal membina pelan penambahbaikan.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      try {
        const response = await fetch("/api/session");
        if (!response.ok) return;

        const data = await response.json();
        const state = (data.state || {}) as PersistedAppState;
        if (cancelled) return;

        if (
          state.activeTab === "chat" ||
          state.activeTab === "graph" ||
          state.activeTab === "sources" ||
          state.activeTab === "analytics" ||
          state.activeTab === "review"
        ) {
          setActiveTab(state.activeTab);
        }
        if (state.graphSubTab) setGraphSubTab(state.graphSubTab);
        if (typeof state.isAgentInfoOpen === "boolean") setIsAgentInfoOpen(state.isAgentInfoOpen);
        if (typeof state.userInput === "string") setUserInput(state.userInput);

        const restoredMessages = reviveChatMessages(state.chatMessages);
        if (restoredMessages.length > 0) {
          setChatMessages(restoredMessages);
        }

        if (state.selectedNodeId !== undefined) {
          setPendingSelectedNodeId(state.selectedNodeId);
          const matchingNode = nodes.find((node) => node.id === state.selectedNodeId);
          if (matchingNode) {
            setSelectedNode(matchingNode);
          } else if (state.selectedNodeId === null) {
            setSelectedNode(null);
          }
        }
      } catch (err) {
        console.error("Gagal memulihkan sesi aplikasi:", err);
      } finally {
        if (!cancelled) setIsSessionHydrated(true);
      }
    };

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSessionHydrated) return;

    if (persistSessionTimerRef.current) {
      clearTimeout(persistSessionTimerRef.current);
    }

    const payload: PersistedAppState = {
      activeTab,
      graphSubTab,
      isAgentInfoOpen,
      selectedNodeId: selectedNode?.id ?? null,
      userInput,
      chatMessages,
    };

    persistSessionTimerRef.current = setTimeout(() => {
      fetch("/api/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error("Gagal menyimpan sesi aplikasi:", err);
      });
    }, 450);

    return () => {
      if (persistSessionTimerRef.current) {
        clearTimeout(persistSessionTimerRef.current);
      }
    };
  }, [activeTab, graphSubTab, isAgentInfoOpen, selectedNode, userInput, chatMessages, isSessionHydrated]);

  // Keep the selected detail panel aligned with refreshed or restored graph data.
  useEffect(() => {
    if (nodes.length === 0) {
      setSelectedNode(null);
      return;
    }

    if (pendingSelectedNodeId) {
      const pendingNode = nodes.find((node) => node.id === pendingSelectedNodeId);
      if (pendingNode) {
        setSelectedNode(pendingNode);
        setPendingSelectedNodeId(null);
        return;
      }
    }

    setSelectedNode((current) => {
      if (!current) return nodes[0];
      return nodes.find((node) => node.id === current.id) || nodes[0];
    });
  }, [nodes, pendingSelectedNodeId]);

  // Send message to Express chat endpoint with BigQuery/Knowledge Catalog grounding
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || userInput;
    if (!textToSend.trim() || isChatLoading) return;

    setUserInput("");
    setChatError(null);
    setIsChatLoading(true);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date()
    };
    const botMessageId = `bot-${Date.now()}`;
    const pendingBotMsg: ChatMessage = {
      id: botMessageId,
      role: "model",
      content: "Menyediakan konteks rujukan...",
      timestamp: new Date()
    };

    setStreamingMessageId(botMessageId);
    setChatMessages((prev) => [...prev, userMsg, pendingBotMsg]);

    try {
      // Package conversation history to keep context
      const serverHistory = chatMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const headers: Record<string, string> = { "Content-Type": "application/json" };

      const response = await fetch("/api/chat?stream=true", {
        method: "POST",
        headers: {
          ...headers,
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ message: textToSend, history: serverHistory })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.needsAdc) {
          throw new Error("Konfigurasi ADC / Vertex AI belum lengkap untuk akaun perkhidmatan Cloud Run.");
        }
        throw new Error(data.error || "Gagal menghubungi ejen Syariah.");
      }

      if (!response.body) {
        throw new Error("Pelayar tidak menyokong penstriman respons.");
      }

      let streamedText = "";
      let citations: ChatMessage["citations"] = [];
      let relevantGraph: ChatMessage["relevantGraph"];

      const updateBotMessage = (patch: Partial<ChatMessage>) => {
        setChatMessages((prev) =>
          prev.map((message) =>
            message.id === botMessageId ? { ...message, ...patch } : message
          )
        );
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleStreamEvent = (event: any) => {
        if (event.type === "metadata") {
          citations = Array.isArray(event.citations) ? event.citations : [];
          relevantGraph = event.relevantGraph;
        } else if (event.type === "text") {
          streamedText += event.text || "";
          updateBotMessage({ content: streamedText, citations, relevantGraph });
        } else if (event.type === "done") {
          streamedText = streamedText || event.text || "Maaf, tiada jawapan dijana.";
          updateBotMessage({ content: streamedText, citations, relevantGraph });
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const event = JSON.parse(line);
          handleStreamEvent(event);
        }
      }

      if (buffer.trim()) {
        handleStreamEvent(JSON.parse(buffer));
      }

      if (!streamedText) {
        updateBotMessage({ content: "Maaf, tiada jawapan dijana.", citations, relevantGraph });
      }
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || "Something went wrong.");
      
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "system",
        content: `Error: ${err.message || "Gagal mendapatkan maklum balas daripada pelayan."}`,
        timestamp: new Date()
      };
      setChatMessages((prev) => [
        ...prev.filter((message) => message.id !== botMessageId),
        errMsg,
      ]);
    } finally {
      setIsChatLoading(false);
      setStreamingMessageId(null);
    }
  };

  // Reusable graph refresh function
  const refreshGraph = async () => {
    try {
      const response = await fetch("/api/get-graph");
      const data = await response.json();
      if (response.ok && data.nodes && data.links) {
        setNodes(data.nodes);
        setLinks(data.links);
        setSelectedNode((current) => {
          if (!data.nodes.length) return null;
          if (!current) return data.nodes[0];
          return data.nodes.find((node: KnowledgeNode) => node.id === current.id) || data.nodes[0];
        });
      }
    } catch (err) {
      console.error("Gagal mendapatkan graf daripada pelayan:", err);
    }
  };

  // Load the persisted Knowledge Graph on mount
  useEffect(() => {
    refreshGraph();
  }, []);

  // Reset the Knowledge Graph back to pristine original Shafi'i ontology
  const handleResetGraph = async () => {
    try {
      const response = await fetch("/api/reset-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (response.ok && data.nodes && data.links) {
        setNodes(data.nodes);
        setLinks(data.links);
        setPendingSelectedNodeId(null);
        if (data.nodes.length > 0) {
          setSelectedNode(data.nodes[0]);
        }
      } else {
        setPendingSelectedNodeId(null);
        setNodes(INITIAL_NODES);
        setLinks(INITIAL_LINKS);
        setSelectedNode(INITIAL_NODES[0]);
      }
    } catch (err) {
      console.error("Gagal menetapkan semula graf di pelayan, menetapkan semula secara lokal:", err);
      setPendingSelectedNodeId(null);
      setNodes(INITIAL_NODES);
      setLinks(INITIAL_LINKS);
      setSelectedNode(INITIAL_NODES[0]);
    }
    setSuccessNotice("Berjaya mengembalikan sistem ontologi fekah kepada struktur asas Mazhab Syafi'i.");
  };

  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#3D3B36] font-sans islamic-grid antialiased selection:bg-[#5A634A]/20 flex flex-col">
      
      {/* Visual top border line */}
      <div className="h-1 bg-gradient-to-r from-[#5A634A] via-[#8B9474] to-[#A48F68]" />

      {/* Header section (strictly literal and compliant, no telemetry bloat) */}
      <header className="border-b border-[#E5E1D8] bg-[#F9F7F2]/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#5A634A] flex items-center justify-center shadow-md shadow-[#5A634A]/10 ring-1 ring-[#5A634A]/10">
              <Compass className="w-5 h-5 text-[#FDFBF7] animate-pulse" />
            </div>
            <div className="text-left">
              <h1 className="font-serif text-xl font-bold text-[#2D2B26]">
                Mursyid AI <span className="text-sm font-sans font-normal text-[#8A8478] ml-2 italic">| Gerbang Ilmu Syariah</span>
              </h1>
              <p className="text-[10px] uppercase font-sans tracking-widest text-[#8A8478]">
                Hubungan Ontologi & Carian Terbimbing Berautoriti • Bahasa Melayu
              </p>
            </div>
          </div>

          {/* Quick source link counts to make header intuitive */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-sans font-semibold text-[#6D685E] bg-[#EAE7DF] border border-[#D4D0C6] px-3 py-1 rounded-full">
              MAZHAB UTAMA: <span className="text-[#5A634A] font-bold">SYAFI'I</span>
            </span>
            <span className="text-[10px] font-sans font-semibold text-[#6D685E] bg-[#EAE7DF] border border-[#D4D0C6] px-3 py-1 rounded-full">
              SUMBER BERSEPADU: <span className="text-[#A48F68] font-bold">10 PORTAL RASMI</span>
            </span>
            <div className="flex items-center gap-1.5 bg-[#EAE7DF]/60 border border-[#D4D0C6] px-3 py-1 rounded-full shadow-inner">
              <Lock className="w-3 h-3 text-[#5A634A]" />
              <span className="text-[10px] font-sans font-semibold text-[#6D685E]">
                GEMINI: <span className="text-[#5A634A] font-bold">ADC</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
        
        {/* Navigation Tabs bar */}
        <div className="flex flex-wrap p-1 rounded-xl bg-[#F9F7F2] border border-[#E5E1D8] gap-1 shadow-sm">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "chat"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            Ejen Halaqah Syariah (Sembang)
          </button>
          
          <button
            onClick={() => setActiveTab("graph")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "graph"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <Network className="w-4 h-4 shrink-0" />
            Graf Pengetahuan & Pembina Ontologi (D3)
          </button>
          
          <button
            onClick={() => setActiveTab("sources")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "sources"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            Saranan & Katalog Dokumen Sahih
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            Analytic
          </button>

          <button
            onClick={() => setActiveTab("review")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "review"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            Review Bench
          </button>

        </div>

        {/* Global warning if ADC / Vertex AI is not configured */}
        {chatError?.includes("ADC") && (
          <div className="p-4 rounded-xl border border-amber-950 bg-amber-950/15 text-amber-300 flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs text-left leading-relaxed space-y-1">
              <h4 className="font-semibold text-amber-200">Konfigurasi ADC / Vertex AI Diperlukan</h4>
              <p>
                Sistem menggunakan Application Default Credentials melalui akaun perkhidmatan Cloud Run. Pastikan projek, lokasi Gemini, dan akses Vertex AI telah dikonfigurasikan.
              </p>
            </div>
          </div>
        )}

        {/* Success / Status Notices popups */}
        {successNotice && (
          <div className="p-3 bg-emerald-950/45 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs text-left flex items-center gap-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
            {successNotice}
          </div>
        )}

        {globalError && (
          <div className="p-3 bg-rose-950/45 border border-rose-500/30 text-rose-300 rounded-lg text-xs text-left flex items-center justify-between gap-2 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{globalError}</span>
            </div>
            <button 
              onClick={() => setGlobalError(null)} 
              className="text-[10px] text-rose-400 hover:text-rose-200 cursor-pointer font-semibold underline px-1 shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Dynamic Tab Panel Stage with motion animations (compliant with framework rules) */}
        <div className="flex-1 bg-white rounded-2xl border border-[#E5E1D8] min-h-[500px] p-4 sm:p-6 overflow-hidden relative shadow-sm">
          
          <>
            
            {/* TAB 1: Chat Companion (Halaqah Fiqh) */}
            {activeTab === "chat" && (
              <motion.div
                key="chat-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full"
              >
                {/* Side presets & resource instructions */}
                <div className="lg:col-span-1 space-y-4 text-left">
                  <div className="rounded-lg bg-[#F7F4ED] px-3 py-2 shadow-sm ring-1 ring-[#E5E1D8]">
                    <button
                      type="button"
                      onClick={() => setIsAgentInfoOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold text-[#4D5F49] cursor-pointer"
                      aria-expanded={isAgentInfoOpen}
                    >
                      <span className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-[#0F766E]" />
                        Arahan Ejen Fiqh
                      </span>
                      <span className="text-[11px] text-[#8A8478]">
                        {isAgentInfoOpen ? "Tutup" : "Info"}
                      </span>
                    </button>

                    {isAgentInfoOpen && (
                      <div className="mt-3 space-y-3 border-t border-[#E5E1D8] pt-3">
                        <p className="text-[12px] text-[#5A564E] leading-relaxed">
                          Kecerdasan Buatan menggunakan model <strong>Gemini 3.1-Flash-Lite</strong> bersepadu dengan
                          <strong> Google Search Grounding</strong>. Jawapan dipautkan kepada 10 domain rujukan rasmi.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[11px] text-[#3D3B36] bg-white px-2 py-1 rounded-full ring-1 ring-[#E5E1D8]">
                            Imam Al-Shafi'i
                          </span>
                          <span className="text-[11px] text-[#3D3B36] bg-white px-2 py-1 rounded-full ring-1 ring-[#E5E1D8]">
                            Adab Melayu
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preset Questions selection */}
                  <div className="space-y-2">
                    <span className="text-[12px] font-semibold text-[#4F4A43] block">
                      Cadangan Persoalan Hukum
                    </span>
                    <div className="flex flex-col gap-2">
                      {PRESET_QUESTIONS.map((pq, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(pq.question)}
                          disabled={isChatLoading}
                          className="group rounded-2xl bg-[#F7F4ED] px-3 py-2.5 text-left text-xs text-[#3D3B36] shadow-sm ring-1 ring-[#E5E1D8] transition-colors hover:bg-white hover:ring-[#0F766E]/45 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                        >
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="rounded-full bg-[#E5F2EE] px-2 py-0.5 text-[10px] font-semibold text-[#0F766E]">
                              {pq.category}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-[12px] leading-relaxed text-[#5A564E] group-hover:text-[#2D2B26]">
                            {pq.question}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Central Chat panel */}
                <div className="lg:col-span-3 flex flex-col h-[620px] bg-white rounded-xl overflow-hidden shadow-sm ring-1 ring-[#E5E1D8]">
                  
                  {/* Messages Scroll Area */}
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#F9F7F2]/40">
                    <AnimatePresence initial={false}>
                      {chatMessages.map((msg, msgIndex) => {
                        const previousUserQuestion = [...chatMessages]
                          .slice(0, msgIndex)
                          .reverse()
                          .find((candidate) => candidate.role === "user")?.content || "";
                        const feedback = msg.role === "model" ? getFeedbackForMessage(msg.id) : undefined;

                        return (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.role === "user" ? "justify-end" : "justify-start animate-fade-in"
                          }`}
                        >
                          <div
                            className={`max-w-[88%] rounded-2xl p-4 text-left leading-relaxed ${
                              msg.role === "user"
                                ? "bg-[#2F6F63] text-white rounded-br-none shadow-sm"
                                : msg.role === "system"
                                ? "bg-rose-50 border border-rose-200 text-rose-700 rounded-bl-none"
                                : "bg-white border border-[#E5E1D8] text-[#3D3B36] rounded-bl-none shadow-sm"
                            }`}
                          >
                            {/* Role label & timestamp */}
                            <div className={`flex items-center justify-between gap-6 mb-2 text-[10px] font-semibold ${msg.role === "user" ? "text-emerald-50" : "text-[#8A8478]"}`}>
                              <span className="font-serif uppercase">
                                {msg.role === "user" ? "SAYA" : msg.role === "system" ? "PENGGERA SISTEM" : "EJEN ALIM PERUNDANGAN"}
                              </span>
                              <span className="text-[9px] font-mono opacity-80">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Main content body */}
                            {msg.role === "user" ? (
                              <p className="whitespace-pre-wrap text-sm leading-6 text-white/95">
                                {msg.content}
                              </p>
                            ) : (
                              <ChatMarkdownRenderer content={msg.content} />
                            )}

                            {msg.role === "model" && msg.relevantGraph?.nodes?.length > 0 && (
                              <RelevantGraphSnippet
                                nodes={msg.relevantGraph.nodes}
                                links={msg.relevantGraph.links || []}
                              />
                            )}

                            {/* Citations/Links block (Grounding display - explicit, no bloat) */}
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-[#E5E1D8] space-y-1.5 text-left">
                                <span className="text-[9px] font-bold text-[#5A634A] uppercase tracking-wider block">
                                  Rujukan Grounded Rasmi (JAKIM/Mufti):
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.citations.map((cite, cIdx) => (
                                    <a
                                      key={cIdx}
                                      href={cite.url}
                                      target="_blank"
                                      referrerPolicy="no-referrer"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-[#E5E1D8] hover:border-[#5A634A] text-[10px] text-[#5A564E] hover:text-[#5A634A] transition-colors"
                                    >
                                      <ExternalLink className="w-3 h-3 text-[#5A634A]" />
                                      {cite.title.length > 25 ? `${cite.title.substring(0, 25)}...` : cite.title}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {msg.role === "model" && msg.id !== "welcome" && msg.id !== streamingMessageId && (
                              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E1D8] pt-2.5">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A8478]">
                                  Maklum balas jawapan
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isFeedbackSaving}
                                    onClick={() =>
                                      submitFeedback({
                                        message: msg,
                                        question: previousUserQuestion,
                                        rating: "up",
                                      })
                                    }
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                                      feedback?.rating === "up"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-[#E5E1D8] bg-white text-[#6D685E] hover:border-emerald-300 hover:text-emerald-700"
                                    }`}
                                    title="Jawapan membantu"
                                    aria-label="Jawapan membantu"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isFeedbackSaving}
                                    onClick={() => {
                                      setFeedbackModal({ message: msg, question: previousUserQuestion });
                                      setFeedbackComment(feedback?.comment || "");
                                    }}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${
                                      feedback?.rating === "down"
                                        ? "border-rose-200 bg-rose-50 text-rose-700"
                                        : "border-[#E5E1D8] bg-white text-[#6D685E] hover:border-rose-300 hover:text-rose-700"
                                    }`}
                                    title="Perlu diperbaiki"
                                    aria-label="Perlu diperbaiki"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                      })}
                    </AnimatePresence>

                    {/* Chat loading state representation */}
                    {isChatLoading && !streamingMessageId && (
                      <div className="flex justify-start">
                        <div className="bg-[#F9F7F2] border border-[#E5E1D8] rounded-2xl rounded-bl-none p-4 max-w-[80%] text-left shadow-sm">
                          <span className="text-[10px] text-[#5A634A] font-bold block mb-2">EJEN ALIM SEDANG MENYEMAK HUJAH...</span>
                          <div className="flex gap-1.5 items-center">
                            <span className="w-2.5 h-2.5 bg-[#5A634A] rounded-full animate-bounce delay-100" />
                            <span className="w-2.5 h-2.5 bg-[#8B9474] rounded-full animate-bounce delay-200" />
                            <span className="w-2.5 h-2.5 bg-[#A48F68] rounded-full animate-bounce delay-300" />
                            <span className="text-xs text-[#8A8478] ml-2 italic font-sans">Menyusuri lembaran Syariah Mufti WP...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="p-3 border-t border-[#E5E1D8] bg-[#F9F7F2]/60 flex gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Tulis soalan Syariah anda di sini (cthnya: Apakah rujukan hukum melabur emas secara ansuran?)..."
                      className="flex-1 px-3 py-3 rounded-lg border border-[#E5E1D8] bg-white text-sm text-[#3D3B36] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E] selection:bg-[#0F766E]/20"
                      disabled={isChatLoading}
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading || !userInput.trim()}
                      className="p-3 rounded-lg bg-[#0F766E] hover:bg-[#0B615A] disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-[#FDFBF7] transition-colors cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* TAB 2: Knowledge Graph (D3 visualizer + Dynamic parser simulator) */}
            {activeTab === "graph" && (
              <motion.div
                key="graph-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Inner sub-tab navigation header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E1D8] pb-4 text-left">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#2D2B26]">
                      Graf Pengetahuan Syariah
                    </h3>
                    <p className="text-xs text-[#8A8478]">
                      Teroka visualisasi ontologi fiqh atau imbas portal rasmi untuk mengemas kini graf.
                    </p>
                  </div>
                  
                  <div className="flex p-0.5 rounded-lg bg-[#F1F0EC] border border-[#D4D0C6] self-start md:self-auto shrink-0 shadow-sm">
                    <button
                      onClick={() => setGraphSubTab("visualize")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all cursor-pointer ${
                        graphSubTab === "visualize"
                          ? "bg-white text-[#5A634A] shadow-sm ring-1 ring-[#D4D0C6]/50 font-extrabold"
                          : "text-[#6D685E] hover:text-[#5A634A]"
                      }`}
                    >
                      <Network className="w-3.5 h-3.5 shrink-0" />
                      Teroka Graf
                    </button>
                    <button
                      onClick={() => setGraphSubTab("ingest")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all cursor-pointer ${
                        graphSubTab === "ingest"
                          ? "bg-white text-[#5A634A] shadow-sm ring-1 ring-[#D4D0C6]/50 font-extrabold"
                          : "text-[#6D685E] hover:text-[#5A634A]"
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      Imbas Portal
                    </button>
                  </div>
                </div>

                <>
                  {/* SUB-TAB 1: Visualize / Explore Ontologi */}
                  {graphSubTab === "visualize" && (
                    <motion.div
                      key="subtab-visualize"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                    >
                      {/* Left component: Interactive Graph Canvas (Takes 2 span cols) */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            <h4 className="font-serif font-semibold text-[#2D2B26] flex items-center gap-1.5">
                              Visualisasi Graf (D3)
                            </h4>
                            <p className="text-[11px] text-[#8A8478]">
                              Susun nod dengan mengheret, skrol untuk zoom, klik nod untuk maklumat lanjut.
                            </p>
                          </div>
                        </div>

                        <KnowledgeGraph
                          nodes={nodes}
                          links={links}
                          onNodeSelect={(node) => {
                            setPendingSelectedNodeId(null);
                            setSelectedNode(node);
                          }}
                          selectedNodeId={selectedNode?.id}
                          onResetGraph={handleResetGraph}
                        />
                      </div>

                      {/* Right side details panels */}
                      <div className="space-y-4 text-left">
                        <div>
                          <h4 className="font-serif font-semibold text-[#2D2B26] mb-3 block">
                            Maklumat Entiti
                          </h4>
                          
                          <AnimatePresence mode="wait">
                            {selectedNode ? (
                              <motion.div
                                key={selectedNode.id}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="rounded-xl bg-[#F9F7F2]/80 p-5 shadow-sm ring-1 ring-[#E5E1D8] space-y-5"
                              >
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[#E5F2EE] px-2.5 py-1 text-[10px] font-bold text-[#0F766E]">
                                      {selectedNode.type === "Artikkel" ? "Artikel" : selectedNode.type}
                                    </span>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-mono font-semibold text-[#6D685E] ring-1 ring-[#E5E1D8]">
                                      #{selectedNode.id.replace(/_/g, "-").toLowerCase()}
                                    </span>
                                  </div>
                                  <h5 className="font-serif font-bold text-[#2D2B26] text-lg leading-snug">
                                    {selectedNode.label}
                                  </h5>
                                </div>

                                <div className="space-y-4 text-sm">
                                  <div className="grid grid-cols-[88px_1fr] gap-3">
                                    <span className="text-[11px] font-semibold text-[#8A8478]">Kategori</span>
                                    <span className="text-[#3D3B36]">
                                      {selectedNode.type === "Artikkel" ? "Artikel" : selectedNode.type}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-[88px_1fr] gap-3">
                                    <span className="text-[11px] font-semibold text-[#8A8478]">Ringkasan</span>
                                    <p className="text-[#5A564E] leading-6">
                                      {selectedNode.description}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-[88px_1fr] gap-3">
                                    <span className="text-[11px] font-semibold text-[#8A8478]">Rujukan</span>
                                    <p className="text-[#5A564E] leading-6">
                                      Bersandar kepada hubungan langsung dalam graf semasa.
                                    </p>
                                  </div>
                                </div>

                                <div className="rounded-lg bg-white/75 px-3 py-2 text-[12px] leading-5 text-[#5A564E] ring-1 ring-[#E5E1D8]">
                                  Kesan rujukan syarak akan berubah mengikut nod yang bersambung dengan entiti ini.
                                </div>
                              </motion.div>
                            ) : (
                              <div className="p-5 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/30 text-[#8A8478] text-xs">
                                Klik nod di sebelah kiri untuk melihat penerangan hukum Syariah.
                              </div>
                            )}
                          </AnimatePresence>
                        </div>

                      </div>
                    </motion.div>
                  )}

                  {/* SUB-TAB 2: Web Ingestor & Crawler */}
                  {graphSubTab === "ingest" && (
                    <motion.div
                      key="subtab-ingest"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-6"
                    >
                      <CrawlerPanel
                        onIndexComplete={refreshGraph}
                        setError={setGlobalError}
                      />
                    </motion.div>
                  )}
                </>
              </motion.div>
            )}

            {/* TAB 3: Sources Catalog */}
            {activeTab === "sources" && (
              <motion.div
                key="sources-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-left max-w-3xl">
                  <h3 className="font-serif font-bold text-xl text-[#2D2B26]">
                    Senarai 10 Portal & Sumber Rujukan Utama Syariah Islam di Malaysia
                  </h3>
                  <p className="text-xs text-[#5A564E] leading-relaxed mt-1 font-sans">
                    Aplikasi ini mengikat saringan rujukan hadis dan fatwa kepada domain-domain yang diisytiharkan sahih oleh penguasa tempatan demi menjamin ketepatan maklumat:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {OFFICIAL_SOURCES.map((src) => (
                    <SourceCard
                      key={src.id}
                      source={src}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* TAB 4: Feedback Analytics */}
            {activeTab === "analytics" && (
              <motion.div
                key="analytics-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 text-left"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E1D8] pb-4">
                  <div>
                    <h3 className="font-serif font-bold text-xl text-[#2D2B26]">Analytic Maklum Balas</h3>
                    <p className="text-xs text-[#5A564E] mt-1">
                      Pantau kualiti jawapan berdasarkan thumbs up/down dan status pipeline penambahbaikan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshFeedback}
                    className="inline-flex items-center gap-2 self-start rounded-lg border border-[#D4D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#5A634A] hover:bg-[#F7F4ED]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Segar Semula
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    ["Jumlah Rating", feedbackAnalytics.total],
                    ["Thumbs Up", feedbackAnalytics.thumbsUp],
                    ["Thumbs Down", feedbackAnalytics.thumbsDown],
                    ["Down Rate", `${feedbackAnalytics.downRate}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#E5E1D8] bg-[#F9F7F2]/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8478]">{label}</p>
                      <p className="mt-2 text-3xl font-bold text-[#2D2B26]">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8478]">Item Baharu</p>
                    <p className="mt-2 text-2xl font-bold text-[#A48F68]">{feedbackAnalytics.newItems}</p>
                  </div>
                  <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8478]">Queued Improvement</p>
                    <p className="mt-2 text-2xl font-bold text-[#0F766E]">{feedbackAnalytics.queuedImprovements}</p>
                  </div>
                  <div className="rounded-lg border border-[#E5E1D8] bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A8478]">Drafted Plan</p>
                    <p className="mt-2 text-2xl font-bold text-[#5A634A]">{feedbackAnalytics.draftedImprovements}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E5E1D8] bg-[#F7F4ED] p-4 text-sm leading-6 text-[#5A564E]">
                  Pipeline auto-improvement direka sebagai human-in-the-loop: thumbs-down mencipta isu semakan,
                  Review Bench mendraf pelan, kemudian reviewer menandakan sama ada perubahan prompt, sumber RAG,
                  atau fine-tuning patut dibuat.
                </div>
              </motion.div>
            )}

            {/* TAB 5: Human Review Bench */}
            {activeTab === "review" && (
              <motion.div
                key="review-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5 text-left"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E5E1D8] pb-4">
                  <div>
                    <h3 className="font-serif font-bold text-xl text-[#2D2B26]">Review Bench</h3>
                    <p className="text-xs text-[#5A564E] mt-1">
                      Semak maklum balas pengguna dan pilih tindakan penambahbaikan sebelum pipeline diterapkan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshFeedback}
                    className="inline-flex items-center gap-2 self-start rounded-lg border border-[#D4D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#5A634A] hover:bg-[#F7F4ED]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Segar Semula
                  </button>
                </div>

                {feedbackRecords.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#D4D0C6] bg-[#F9F7F2]/60 p-8 text-center text-sm text-[#8A8478]">
                    Belum ada maklum balas untuk disemak.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {feedbackRecords.map((record) => (
                      <div key={record.id} className="rounded-lg border border-[#E5E1D8] bg-white p-4 shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                record.rating === "up"
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                              }`}>
                                {record.rating === "up" ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                                {record.rating === "up" ? "Thumbs Up" : "Thumbs Down"}
                              </span>
                              <span className="rounded-full bg-[#F1F0EC] px-2.5 py-1 text-[10px] font-semibold text-[#6D685E]">
                                {record.reviewStatus}
                              </span>
                              <span className="rounded-full bg-[#E5F2EE] px-2.5 py-1 text-[10px] font-semibold text-[#0F766E]">
                                pipeline: {record.pipelineStatus}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#8A8478]">
                              Dikemas kini {new Date(record.updatedAt).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={record.reviewStatus}
                              onChange={(event) =>
                                updateFeedbackRecord(record, {
                                  reviewStatus: event.target.value as FeedbackReviewStatus,
                                })
                              }
                              className="rounded-lg border border-[#D4D0C6] bg-white px-2 py-2 text-xs text-[#3D3B36]"
                            >
                              <option value="new">new</option>
                              <option value="reviewing">reviewing</option>
                              <option value="resolved">resolved</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => draftImprovementPlan(record)}
                              className="rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0B615A]"
                            >
                              Draft Pipeline
                            </button>
                            <button
                              type="button"
                              onClick={() => updateFeedbackRecord(record, { pipelineStatus: "applied", reviewStatus: "resolved" })}
                              className="rounded-lg border border-[#D4D0C6] bg-white px-3 py-2 text-xs font-semibold text-[#5A634A] hover:bg-[#F7F4ED]"
                            >
                              Mark Applied
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                          <div className="rounded-lg bg-[#F9F7F2]/70 p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8A8478]">Soalan Pengguna</p>
                            <p className="line-clamp-5 leading-6 text-[#3D3B36]">{record.question || "Tiada soalan disimpan."}</p>
                          </div>
                          <div className="rounded-lg bg-[#F9F7F2]/70 p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#8A8478]">Pandangan Pengguna</p>
                            <p className="whitespace-pre-wrap leading-6 text-[#3D3B36]">{record.comment || "Tiada ulasan."}</p>
                          </div>
                        </div>

                        <details className="mt-3 rounded-lg border border-[#E5E1D8] bg-[#FDFBF7] p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[#5A634A]">Lihat jawapan dan pelan</summary>
                          <div className="mt-3 space-y-3 text-sm leading-6 text-[#5A564E]">
                            <p className="whitespace-pre-wrap">{record.answer}</p>
                            {record.improvementPlan && (
                              <pre className="whitespace-pre-wrap rounded-lg bg-[#2D2B26] p-3 text-xs leading-5 text-[#FDFBF7]">
                                {record.improvementPlan}
                              </pre>
                            )}
                          </div>
                        </details>

                        <textarea
                          defaultValue={record.reviewerNote}
                          onBlur={(event) => updateFeedbackRecord(record, { reviewerNote: event.target.value })}
                          placeholder="Nota reviewer..."
                          className="mt-3 min-h-20 w-full rounded-lg border border-[#D4D0C6] bg-white p-3 text-sm text-[#3D3B36] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

          </>

        </div>
        
      </main>

      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2B26]/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#E5E1D8] bg-white p-5 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2D2B26]">Apa yang perlu diperbaiki?</h3>
                <p className="mt-1 text-xs leading-5 text-[#5A564E]">
                  Maklum balas ini akan masuk ke Review Bench untuk disemak sebelum pipeline penambahbaikan diterapkan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFeedbackModal(null);
                  setFeedbackComment("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E1D8] text-[#6D685E] hover:bg-[#F7F4ED]"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg bg-[#F9F7F2]/70 p-3 text-xs leading-5 text-[#5A564E]">
              <span className="font-semibold text-[#3D3B36]">Soalan:</span>{" "}
              {feedbackModal.question || "Tiada soalan pengguna ditemui untuk jawapan ini."}
            </div>

            <textarea
              value={feedbackComment}
              onChange={(event) => setFeedbackComment(event.target.value)}
              placeholder="Contoh: jawapan tidak cukup sumber, tersalah hukum, perlu nyatakan khilaf, atau bahasa kurang jelas..."
              className="mt-4 min-h-32 w-full rounded-lg border border-[#D4D0C6] bg-white p-3 text-sm text-[#3D3B36] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25"
              autoFocus
            />

            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFeedbackModal(null);
                  setFeedbackComment("");
                }}
                className="rounded-lg border border-[#D4D0C6] bg-white px-4 py-2 text-xs font-semibold text-[#5A564E] hover:bg-[#F7F4ED]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isFeedbackSaving}
                onClick={handleThumbsDownSubmit}
                className="rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B615A] disabled:opacity-60"
              >
                Hantar ke Review Bench
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sincere literal Footer */}
      <footer className="border-t border-[#E5E1D8] bg-[#5A564E] text-[#FDFBF7] py-6 px-8 text-center mt-12 text-[10px] font-sans tracking-wide leading-relaxed shadow-inner">
        APLIKASI INTEGRASI PINTAR ISLAM • BAHASA MELAYU • REKAAN UNTUK STANDARD MAZHAB SYAFI'I DI MALAYSIA<br />
        RUJUKAN SECARA LANGSUNG KEPADA JAKIM, JABATAN MUFTI WP, HARIAN METRO, BERITA HARIAN & WAKTUSOLAT.DIGITAL
      </footer>

    </div>
  );
}

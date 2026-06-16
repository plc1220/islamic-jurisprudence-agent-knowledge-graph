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
  Brain,
  CheckCircle2,
  Lock,
  Globe,
} from "lucide-react";

import { ChatMessage, KnowledgeNode, KnowledgeLink, SourceWebsite, PresetQuestion } from "./types";
import { OFFICIAL_SOURCES, PRESET_QUESTIONS, INITIAL_NODES, INITIAL_LINKS } from "./data";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { SourceCard } from "./components/SourceCard";
import { ArchitectureExplainer } from "./components/ArchitectureExplainer";
import { CrawlerPanel } from "./components/CrawlerPanel";
import { ChatMarkdownRenderer } from "./components/ChatMarkdownRenderer";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"chat" | "graph" | "sources" | "engineering">("chat");
  const [graphSubTab, setGraphSubTab] = useState<"visualize" | "ingest">("visualize");
  const [isAgentInfoOpen, setIsAgentInfoOpen] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content: "Assalamualaikum rukun ilmuwan. Saya adalah Ejen Pakar Syariah Islam berpandukan Mazhab Syafi'i dan rujukan berautoriti Malaysia (seperti JAKIM & Jabatan Mufti WP). Sila tanyakan kemusykilan hukum fiqh, hadis, fatwa semasa, atau soalan sejarah Islam anda di bawah.",
      timestamp: new Date()
    }
  ]);
  const [userInput, setUserInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Active Knowledge Graph data state
  const [nodes, setNodes] = useState<KnowledgeNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<KnowledgeLink[]>(INITIAL_LINKS);
  
  // Custom states
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Chat scroll container
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: chatMessages.length > 1 || isChatLoading ? "smooth" : "auto",
    });
  }, [chatMessages, isChatLoading]);

  // Set default selected node for display details
  useEffect(() => {
    if (nodes.length > 0 && !selectedNode) {
      setSelectedNode(nodes[0]);
    }
  }, [nodes]);

  // Send message to Express chat endpoint with live web search grounding
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

    setChatMessages((prev) => [...prev, userMsg]);

    try {
      // Package conversation history to keep context
      const serverHistory = chatMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const headers: Record<string, string> = { "Content-Type": "application/json" };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: textToSend, history: serverHistory })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsAdc) {
          throw new Error("Konfigurasi ADC / Vertex AI belum lengkap untuk akaun perkhidmatan Cloud Run.");
        }
        throw new Error(data.error || "Gagal menghubungi ejen Syariah.");
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "model",
        content: data.text,
        timestamp: new Date(),
        citations: data.citations
      };

      setChatMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error(err);
      setChatError(err.message || "Something went wrong.");
      
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "system",
        content: `Error: ${err.message || "Gagal mendapatkan maklum balas daripada pelayan."}`,
        timestamp: new Date()
      };
      setChatMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsChatLoading(false);
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
        if (data.nodes.length > 0) {
          setSelectedNode(data.nodes[0]);
        }
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
        if (data.nodes.length > 0) {
          setSelectedNode(data.nodes[0]);
        }
      } else {
        setNodes(INITIAL_NODES);
        setLinks(INITIAL_LINKS);
        setSelectedNode(INITIAL_NODES[0]);
      }
    } catch (err) {
      console.error("Gagal menetapkan semula graf di pelayan, menetapkan semula secara lokal:", err);
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
            onClick={() => setActiveTab("engineering")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeTab === "engineering"
                ? "bg-[#5A634A] text-white shadow-sm"
                : "text-[#5A564E] hover:text-[#5A634A] hover:bg-[#EAE7DF]/50"
            }`}
          >
            <Brain className="w-4 h-4 shrink-0" />
            Analisis Senibina Indeksasi (KG vs RAG)
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
                          Kecerdasan Buatan menggunakan model <strong>Gemini 3.5-Flash</strong> bersepadu dengan
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
                      {chatMessages.map((msg) => (
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
                          </div>
                        </div>
                      ))}
                    </AnimatePresence>

                    {/* Chat loading state representation */}
                    {isChatLoading && (
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
                          onNodeSelect={(node) => setSelectedNode(node)}
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

                        <div className="p-4 rounded-xl border border-[#D4D0C6] bg-[#EAE7DF]/70 space-y-2">
                          <h5 className="text-xs font-bold text-[#5A634A] flex items-center gap-1 font-serif">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Kelebihan Graf
                          </h5>
                          <p className="text-[10px] text-[#5A564E] leading-relaxed">
                            Sistem menyusuri hujah mazhab setempat secara formal bagi menjamin kesahihan keputusan tanpa mencampurkan data rawak luar.
                          </p>
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

            {/* TAB 4: Indexing Engineering Explainer */}
            {activeTab === "engineering" && (
              <motion.div
                key="engineering-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ArchitectureExplainer />
              </motion.div>
            )}

          </>

        </div>
        
      </main>

      {/* Sincere literal Footer */}
      <footer className="border-t border-[#E5E1D8] bg-[#5A564E] text-[#FDFBF7] py-6 px-8 text-center mt-12 text-[10px] font-sans tracking-wide leading-relaxed shadow-inner">
        APLIKASI INTEGRASI PINTAR ISLAM • BAHASA MELAYU • REKAAN UNTUK STANDARD MAZHAB SYAFI'I DI MALAYSIA<br />
        RUJUKAN SECARA LANGSUNG KEPADA JAKIM, JABATAN MUFTI WP, HARIAN METRO, BERITA HARIAN & WAKTUSOLAT.DIGITAL
      </footer>

    </div>
  );
}

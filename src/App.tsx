import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Network,
  BookOpen,
  Compass,
  Send,
  HelpCircle,
  FileText,
  AlertTriangle,
  RotateCcw,
  Book,
  ExternalLink,
  Brain,
  Sparkles,
  Search,
  CheckCircle2,
  Lock,
  Key,
  Globe,
} from "lucide-react";

import { ChatMessage, KnowledgeNode, KnowledgeLink, SourceWebsite, PresetQuestion } from "./types";
import { OFFICIAL_SOURCES, PRESET_QUESTIONS, INITIAL_NODES, INITIAL_LINKS } from "./data";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { SourceCard } from "./components/SourceCard";
import { ArchitectureExplainer } from "./components/ArchitectureExplainer";
import { ParserSimulator } from "./components/ParserSimulator";
import { CrawlerPanel } from "./components/CrawlerPanel";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"chat" | "graph" | "sources" | "engineering">("chat");
  const [localApiKey, setLocalApiKey] = useState<string>(localStorage.getItem("mursyid_gemini_api_key") || "");

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
  const [graphLoading, setGraphLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Chat scroll container
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      if (localApiKey) {
        headers["Authorization"] = `Bearer ${localApiKey}`;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: textToSend, history: serverHistory })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsApiKey) {
          throw new Error("Sila pasangkan API key anda bagi Gemini API di panel Secrets dalam Google AI Studio!");
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

  // Handle graph parse outcome
  const handleGraphExtracted = (newNodes: KnowledgeNode[], newLinks: KnowledgeLink[]) => {
    setNodes(newNodes);
    setLinks(newLinks);
    if (newNodes.length > 0) {
      setSelectedNode(newNodes[0]);
    }
  };

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
              <Key className="w-3 h-3 text-[#5A634A]" />
              <input
                type="password"
                placeholder="Gemini API Key..."
                value={localApiKey}
                onChange={(e) => {
                  setLocalApiKey(e.target.value);
                  localStorage.setItem("mursyid_gemini_api_key", e.target.value);
                }}
                className="bg-transparent border-none text-[10px] text-[#2D2B26] focus:outline-none w-28 placeholder:text-[#8A8478]/70 font-sans"
              />
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

        {/* Global Key warning if api key missing from server environment */}
        {!process.env.GEMINI_API_KEY && chatError?.includes("Secrets") && (
          <div className="p-4 rounded-xl border border-amber-950 bg-amber-950/15 text-amber-300 flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs text-left leading-relaxed space-y-1">
              <h4 className="font-semibold text-amber-200">Ketiadaan Kunci API Gemini (Secret Key Missing)</h4>
              <p>
                Sistem mengesan kunci <strong>GEMINI_API_KEY</strong> belum ditetapkan dalam profil AI Studio anda. Sila tambah kunci rahsia anda di bawah bahagian <strong>Settings &gt; Secrets</strong> di sidebar kiri atau tetingkap panel AI Studio untuk memulakan integrasi ejen pintar secara langsung.
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
          
          <AnimatePresence mode="wait">
            
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
                  <div className="p-4 rounded-xl bg-[#F9F7F2] border border-[#E5E1D8] space-y-3">
                    <h4 className="font-serif text-xs font-semibold uppercase tracking-wider text-[#5A634A] flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5 text-[#5A634A]" />
                      Arahan Ejen Fiqh
                    </h4>
                    <p className="text-[11px] text-[#5A564E] leading-relaxed">
                      Kecerdasan Buatan menggunakan model <strong>Gemini 3.5-Flash</strong> bersepadu dengan 
                      <strong> Google Search Grounding</strong>. Jawapan yang dihasilkan dipautkan terus kepada data web dari 10 domain rujukan yang diiktiraf.
                    </p>
                    <div className="border-t border-[#E5E1D8] pt-2.5 space-y-1.5">
                      <span className="text-[10px] text-[#8A8478] font-bold uppercase block">Spesifikasi Mazhab:</span>
                      <span className="text-[11px] text-[#3D3B36] block bg-[#EAE7DF] px-2 py-1 rounded border border-[#D4D0C6]">
                        • Imam Al-Shafi'i (Utama)
                      </span>
                      <span className="text-[11px] text-[#3D3B36] block bg-[#EAE7DF] px-2 py-1 rounded border border-[#D4D0C6]">
                        • Penyelarasan Adab Melayu
                      </span>
                    </div>
                  </div>

                  {/* Preset Questions selection */}
                  <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-[#6D685E] font-serif block">
                      Cadangan Persoalan Hukum:
                    </span>
                    <div className="flex flex-col gap-2">
                      {PRESET_QUESTIONS.map((pq, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(pq.question)}
                          disabled={isChatLoading}
                          className="p-3 text-left bg-[#F9F7F2] border border-[#E5E1D8] hover:border-[#5A634A] rounded-lg text-xs hover:bg-[#EAE7DF]/40 transition-all text-[#3D3B36] hover:text-[#5A634A] space-y-1.5 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[#A48F68] font-semibold px-1.5 py-0.5 rounded bg-[#EAE7DF] border border-[#D4D0C6]">
                              {pq.category}
                            </span>
                            <span className="text-[9px] font-mono text-[#8A8478] font-semibold uppercase">PILIH ➔</span>
                          </div>
                          <p className="line-clamp-2 leading-relaxed text-[11px] text-[#5A564E] group-hover:text-[#3D3B36]">
                            {pq.question}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Central Chat panel */}
                <div className="lg:col-span-3 flex flex-col h-[520px] bg-white border border-[#E5E1D8] rounded-xl overflow-hidden shadow-sm">
                  
                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#F9F7F2]/40">
                    <AnimatePresence initial={false}>
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.role === "user" ? "justify-end" : "justify-start animate-fade-in"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-4 text-xs text-left leading-relaxed ${
                              msg.role === "user"
                                ? "bg-[#5A634A] text-white rounded-br-none shadow-sm"
                                : msg.role === "system"
                                ? "bg-rose-50 border border-rose-200 text-rose-700 rounded-bl-none"
                                : "bg-white border border-[#E5E1D8] text-[#3D3B36] rounded-bl-none shadow-sm"
                            }`}
                          >
                            {/* Role label & timestamp */}
                            <div className={`flex items-center justify-between gap-6 mb-1 text-[10px] font-semibold ${msg.role === "user" ? "text-emerald-100" : "text-[#8A8478]"}`}>
                              <span className="font-serif uppercase">
                                {msg.role === "user" ? "SAYA" : msg.role === "system" ? "PENGGERA SISTEM" : "EJEN ALIM PERUNDANGAN"}
                              </span>
                              <span className="text-[9px] font-mono opacity-80">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* Main content body */}
                            <p className="whitespace-pre-wrap">{msg.content}</p>

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
                      className="flex-1 px-3 py-2.5 rounded-lg border border-[#E5E1D8] bg-white text-xs text-[#3D3B36] focus:outline-none focus:ring-1 focus:ring-[#5A634A] focus:border-[#5A634A] selection:bg-[#5A634A]/20"
                      disabled={isChatLoading}
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading || !userInput.trim()}
                      className="p-2.5 rounded-lg bg-[#5A634A] hover:bg-[#5A634A]/90 disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-[#FDFBF7] transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left component: Interactive Graph Canvas (Takes 2 span cols) */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <h4 className="font-serif font-semibold text-[#2D2B26] flex items-center gap-1.5">
                          <Network className="w-4.5 h-4.5 text-[#5A634A]" />
                          Kanvas Graf Pengetahuan Fiqh Kontemporari (D3)
                        </h4>
                        <p className="text-[11px] text-[#8A8478]">
                          Sila heret nod untuk menyusun, gunakan tatal tetikus untuk fungsi zoom, dan klik nod untuk memaparkan ulasan ontology.
                        </p>
                      </div>

                      {/* Reset back to pristine default */}
                      <button
                        onClick={handleResetGraph}
                        className="px-3 py-1.5 rounded bg-[#F9F7F2] hover:bg-[#EAE7DF] border border-[#D4D0C6] text-[10px] text-[#5A634A] hover:text-[#2D2B26] flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                        title="Kembalikan format asal"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Kembalikan Asal
                      </button>
                    </div>

                    <KnowledgeGraph
                      nodes={nodes}
                      links={links}
                      onNodeSelect={(node) => setSelectedNode(node)}
                      selectedNodeId={selectedNode?.id}
                    />
                  </div>

                  {/* Right side details panels */}
                  <div className="space-y-4 text-left">
                    <div>
                      <h4 className="font-serif font-semibold text-[#2D2B26] mb-3 block">
                        Detail Maklumat Ontologi
                      </h4>
                      
                      <AnimatePresence mode="wait">
                        {selectedNode ? (
                          <motion.div
                            key={selectedNode.id}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="p-5 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/60 space-y-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-[#E5E1D8] pb-3">
                              <div>
                                <span className="inline-block px-2 py-0.5 rounded bg-[#EAE7DF] border border-[#D4D0C6] text-[9px] uppercase font-sans font-bold text-[#5A634A]">
                                  {selectedNode.type}
                                </span>
                                <h5 className="font-serif font-bold text-[#2D2B26] text-lg mt-1">
                                  {selectedNode.label}
                                </h5>
                              </div>
                              <span className="text-[10px] font-mono text-[#8A8478] font-bold uppercase shrink-0">
                                #{selectedNode.id.toUpperCase()}
                              </span>
                            </div>

                            <p className="text-xs text-[#5A564E] leading-relaxed bg-white p-3 rounded-lg border border-[#E5E1D8] font-sans">
                              {selectedNode.description}
                            </p>

                            <div className="space-y-1 text-[11px] text-[#5A564E]">
                              <span className="font-semibold text-[#8A8478] uppercase text-[9px] block">Rantai Keputusan Hukum terkait:</span>
                              <p className="bg-[#FDFBF7] p-2 rounded border border-[#E5E1D8]">
                                Sebarang perubahan pada nod ini memberi kesan bergilir (cascade effect) kepada entiti rujukan syarak yang bersandar kepadanya secara langsung.
                              </p>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="p-5 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/30 text-[#8A8478] text-xs">
                            Sila klik mana-mana nod di sebelah kiri untuk melihat penerangan hukum Syariah yang kaya konteks.
                          </div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="p-4 rounded-xl border border-[#D4D0C6] bg-[#EAE7DF]/70 space-y-2.5">
                      <h5 className="text-xs font-bold text-[#5A634A] flex items-center gap-1 font-serif">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mengapa Tiada Kehilangan Konteks?
                      </h5>
                      <p className="text-[10px] text-[#5A564E] leading-relaxed">
                        Graf Pengetahun memelihara peta hubungan teologi secara formal. Melalui kaedah ini, enjin carian menyusuri garis lurus rukun Syariah, mengikut hujah mazhab setempat tanpa mencampurkan data rawak yang boleh mengelirukan kesahihan perundangan.
                      </p>
                    </div>
                  </div>

                </div>

                {/* Crawler and Batch Indexer Panel */}
                <div className="border-t border-[#E5E1D8] pt-6 pb-2">
                  <div className="text-left mb-4">
                    <h4 className="font-serif font-semibold text-[#2D2B26] flex items-center gap-1.5">
                      <Globe className="w-4.5 h-4.5 text-[#5A634A]" />
                      Sistem Perayap Laman Web & Saluran Ingestasi (Knowledge Graph Ingestion)
                    </h4>
                    <p className="text-[11px] text-[#8A8478]">
                      Gunakan enjin ini untuk merayap dan mengindeks kandungan fatwa kontemporari secara real-time dari pangkalan web rasmi agensi Malaysia.
                    </p>
                  </div>

                  <CrawlerPanel
                    apiKey={localApiKey}
                    onIndexComplete={refreshGraph}
                    setError={setGlobalError}
                  />
                </div>

                {/* Parser Simulator panel at the bottom for interaction */}
                <div className="border-t border-[#E5E1D8] pt-6">
                  <div className="text-left mb-4">
                    <h4 className="font-serif font-semibold text-[#2D2B26] flex items-center gap-1.5">
                      <Sparkles className="w-4.5 h-4.5 text-[#5A634A]" />
                      Pembina Graf Pengetahuan Fiqh Kontemporari (Ekstraktor AI)
                    </h4>
                    <p className="text-[11px] text-[#8A8478]">
                      Bahagian simulasi ini menterjemahkan teks fatwa atau kemusykilan am di Malaysia ke bentuk struktur nod visual dalam sekelip mata.
                    </p>
                  </div>

                  <ParserSimulator
                    onGraphExtracted={handleGraphExtracted}
                    isLoading={graphLoading}
                    setIsLoading={setGraphLoading}
                    setError={setGlobalError}
                  />
                </div>
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

          </AnimatePresence>

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

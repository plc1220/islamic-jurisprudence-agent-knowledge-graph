import React, { useState, useEffect, useRef } from "react";
import { 
  Globe, 
  Play, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Activity, 
  FileText, 
  ExternalLink,
  ChevronRight,
  Database,
  Layers,
  Sparkles,
  Server
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CrawlerPanelProps {
  apiKey?: string;
  onIndexComplete?: () => void;
  setError: (error: string | null) => void;
}

interface IngestStats {
  title: string;
  chunksCount: number;
  nodesCount: number;
  linksCount: number;
}

interface CrawlLog {
  url: string;
  title: string;
  status: string;
  log: string;
  time: string;
}

const PRIMARY_PORTALS = [
  { name: "Mufti WP - Irsyad Hukum", url: "https://muftiwp.gov.my/ms/artikel/irsyad-hukum", category: "Fatwa & Hukum" },
  { name: "Mufti WP - Bayan Linnas", url: "https://muftiwp.gov.my/ms/artikel/bayan-linnas", category: "Isu Semasa" },
  { name: "Mufti WP - Al-Kafi li al-Fatawi", url: "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi", category: "Soal Jawab" },
  { name: "Takwim Waktu Solat Digital", url: "https://www.waktusolat.digital", category: "Falak & Ibadah" },
  { name: "JAKIM - Portal MyHadith", url: "https://myhadith.islam.gov.my", category: "Hadis & Sanad" },
  { name: "JAKIM - Portal i-Fiqh", url: "https://i-fiqh.islam.gov.my/portal/", category: "Muamalat & Fiqh" }
];

export function CrawlerPanel({ apiKey, onIndexComplete, setError }: CrawlerPanelProps) {
  const [singleUrl, setSingleUrl] = useState("");
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [singleStats, setSingleStats] = useState<IngestStats | null>(null);
  const [singleSuccessMsg, setSingleSuccessMsg] = useState<string | null>(null);

  const [isBatchCrawling, setIsBatchCrawling] = useState(false);
  const [crawlLogs, setLogs] = useState<CrawlLog[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll crawl logs from backend
  const fetchCrawlLogs = async () => {
    try {
      const res = await fetch("/api/crawl-logs");
      if (!res.ok) throw new Error("Gagal mengambil log crawler.");
      const data = await res.json();
      
      setIsBatchCrawling(data.isCrawling);
      setLogs(data.logs || []);

      // If active crawl finished, trigger parent callback to update D3 canvas
      if (isBatchCrawling && !data.isCrawling) {
        if (onIndexComplete) {
          onIndexComplete();
        }
        setSuccessMsg("Proses rangkakan batch (batch indexing) telah berjaya selesai!");
      }
    } catch (err: any) {
      console.error("Crawl logs polling error:", err);
    }
  };

  // Set up polling when batch crawling is active
  useEffect(() => {
    if (isBatchCrawling) {
      pollIntervalRef.current = setInterval(fetchCrawlLogs, 2000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isBatchCrawling]);

  // Initial logs check on mount
  useEffect(() => {
    fetchCrawlLogs();
  }, []);

  const handleSingleCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUrl.trim() || isSingleLoading) return;

    setIsSingleLoading(true);
    setError(null);
    setSingleSuccessMsg(null);
    setSingleStats(null);

    try {
      const localKey = apiKey || localStorage.getItem("mursyid_gemini_api_key") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localKey) {
        headers["Authorization"] = `Bearer ${localKey}`;
      }

      const response = await fetch("/api/ingest-url", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: singleUrl.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal melaksanakan proses crawler pada URL ini.");
      }

      setSingleStats(data.stats);
      setSingleSuccessMsg(data.message);
      setSingleUrl("");
      
      if (onIndexComplete) {
        onIndexComplete(); // Refresh graph visualization
      }
    } catch (err: any) {
      setError(err.message || "Ralat berlaku ketika merayap URL.");
    } finally {
      setIsSingleLoading(false);
    }
  };

  const handleBatchCrawl = async () => {
    if (isBatchCrawling) return;

    setError(null);
    setSuccessMsg(null);
    setIsBatchCrawling(true);

    try {
      const localKey = apiKey || localStorage.getItem("mursyid_gemini_api_key") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localKey) {
        headers["Authorization"] = `Bearer ${localKey}`;
      }

      const response = await fetch("/api/ingest-batch", {
        method: "POST",
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Gagal mengaktifkan crawler batch.");
      }

      setSuccessMsg(data.message);
      // Immediately start polling
      fetchCrawlLogs();
    } catch (err: any) {
      setError(err.message || "Ralat memulakan batch crawl.");
      setIsBatchCrawling(false);
    }
  };

  // Calculate batch progress
  const completedCount = crawlLogs.filter(log => log.status === "SUCCESS" || log.status === "FAILED").length;
  const runningUrl = crawlLogs.find(log => log.status === "RUNNING")?.url || "";

  return (
    <div className="space-y-6 text-left">
      
      {/* Banner / Intro */}
      <div className="bg-[#EAE7DF]/30 p-4 rounded-xl border border-[#D4D0C6] text-xs text-[#5A564E] leading-relaxed shadow-sm">
        <span className="text-[#5A634A] font-bold uppercase font-mono text-[10px] block mb-1">
          Pengendalian Agen Crawler & Indeksasi Automatik
        </span>
        Enjin rujukan Mursyid AI disokong oleh saluran paip (<span className="text-[#A48F68] font-medium font-serif">Data Ingestion Pipeline</span>) 
        yang mengindeks artikel, fatwa, dan panduan syarak secara terus dari laman web rasmi agensi agama Malaysia. 
        Teks penuh akan dicleanse menggunakan model <span className="font-semibold text-[#5A634A]">gemini-2.0-flash-lite</span>, disegmenkan mengikut 
        paragraf ke dalam <span className="font-semibold">pgvector</span>, manakala hubungan ontologi akan diekstrak ke dalam <span className="font-semibold">Apache AGE</span>.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Manual URL Indexing & Batch Action (Takes 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Section 1: Single URL Crawler Form */}
          <div className="p-5 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/40 backdrop-blur-md shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-1.5 border-b border-[#E5E1D8] pb-2">
              <Globe className="w-4 h-4 text-[#5A634A]" />
              Indeks Laman Web Tunggal (Real-time Crawl)
            </h5>
            
            <form onSubmit={handleSingleCrawl} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-semibold text-[#8A8478] font-serif block">
                  Masukkan URL Artikel / Fatwa Fiqh:
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://muftiwp.gov.my/... / https://example.com"
                    className="flex-1 px-3 py-2 rounded-lg border border-[#E5E1D8] bg-white text-xs text-[#3D3B36] focus:outline-none focus:ring-1 focus:ring-[#5A634A] focus:border-[#5A634A]"
                    disabled={isSingleLoading}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isSingleLoading || !singleUrl.trim()}
                    className="px-3 py-2 bg-[#5A634A] hover:bg-[#5A634A]/90 disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-[#FDFBF7] text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {isSingleLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Indeks
                  </button>
                </div>
              </div>
            </form>

            <AnimatePresence mode="wait">
              {singleSuccessMsg && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs leading-relaxed space-y-2 text-left"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{singleSuccessMsg}</span>
                  </div>
                  {singleStats && (
                    <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-emerald-100 text-[10px] font-mono text-[#5A564E]">
                      <div className="bg-emerald-100/40 p-1.5 rounded border border-emerald-200/50">
                        <span className="block font-bold text-[#5A634A] text-xs">{singleStats.chunksCount}</span>
                        Vector Chunks
                      </div>
                      <div className="bg-emerald-100/40 p-1.5 rounded border border-emerald-200/50">
                        <span className="block font-bold text-[#A48F68] text-xs">{singleStats.nodesCount}</span>
                        Graph Nodes
                      </div>
                      <div className="bg-emerald-100/40 p-1.5 rounded border border-emerald-200/50">
                        <span className="block font-bold text-slate-600 text-xs">{singleStats.linksCount}</span>
                        Graph Edges
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Section 2: Batch Indexing Action Card */}
          <div className="p-5 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/40 backdrop-blur-md shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-1.5 border-b border-[#E5E1D8] pb-2">
              <Layers className="w-4 h-4 text-[#A48F68]" />
              Ingestasi Berpusat (Batch Crawling Engine)
            </h5>
            <p className="text-[11px] text-[#5A564E] leading-relaxed">
              Mula menterjemah dan memadankan seluruh tatanan 6 portal rasmi perundangan Islam di Malaysia secara automatik. Proses ini berjalan secara asynchronous di pelayan awan untuk mengelak sekatan masa (timeout limit).
            </p>

            <button
              onClick={handleBatchCrawl}
              disabled={isBatchCrawling}
              className={`w-full py-2.5 rounded-lg text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                isBatchCrawling 
                  ? "bg-[#EAE7DF] text-[#8A8478] cursor-not-allowed border border-[#D4D0C6]" 
                  : "bg-[#5A634A] hover:bg-[#5A634A]/90 text-white border border-transparent"
              }`}
            >
              {isBatchCrawling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#8A8478]" />
                  Batch Crawling Sedang Aktif...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-emerald-100 shrink-0" />
                  MULA MERANGKAK BATCH (SEQUENTIAL)
                </>
              )}
            </button>

            {/* Ingress status progress */}
            {isBatchCrawling && (
              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-[#E5E1D8] text-xs">
                <div className="flex justify-between font-semibold text-[10px] text-[#8A8478] uppercase">
                  <span>Status Kemajuan:</span>
                  <span>{completedCount} / 6 Selesai</span>
                </div>
                <div className="w-full h-1.5 bg-[#EAE7DF] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#5A634A] to-[#A48F68] transition-all duration-500" 
                    style={{ width: `${(completedCount / 6) * 100}%` }}
                  />
                </div>
                {runningUrl && (
                  <p className="text-[10px] text-[#8A8478] mt-1 italic truncate">
                    Merayap: <span className="text-[#5A634A] font-semibold">{runningUrl}</span>
                  </p>
                )}
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] leading-relaxed text-left flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Portal Directories & Live Log Monitor (Takes 7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Top of Right Column: Directory of Registered Portals */}
          <div className="p-4 rounded-xl border border-[#E5E1D8] bg-white shadow-sm space-y-2.5">
            <h5 className="font-serif font-bold text-xs uppercase tracking-wider text-[#8A8478] flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#5A634A]" />
              Direktori Portal Berdaftar untuk Rujukan Grounding
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {PRIMARY_PORTALS.map((portal, idx) => (
                <div 
                  key={idx} 
                  className="p-2 bg-[#F9F7F2]/60 rounded-lg border border-[#E5E1D8]/60 flex items-center justify-between text-xs hover:border-[#5A634A]/50 transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <span className="text-[8px] font-bold uppercase text-[#A48F68] px-1 py-0.5 rounded bg-[#EAE7DF] border border-[#D4D0C6] inline-block mb-1">
                      {portal.category}
                    </span>
                    <h6 className="font-semibold text-[#2D2B26] truncate">{portal.name}</h6>
                    <p className="text-[9px] text-[#8A8478] truncate font-mono">{portal.url}</p>
                  </div>
                  <a 
                    href={portal.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="p-1 hover:bg-[#EAE7DF] rounded text-[#8A8478] hover:text-[#5A634A] transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom of Right Column: Real-time Live Logs Console */}
          <div className="flex-1 p-4 rounded-xl border border-[#E5E1D8] bg-[#1E1C18] text-[#FDFBF7] shadow-lg flex flex-col min-h-[250px]">
            <div className="flex items-center justify-between border-b border-[#3D3831] pb-2.5 mb-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full inline-block ${isBatchCrawling ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <h5 className="font-serif font-bold text-xs text-[#E5E1D8] flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  Log Konsol Pengindeksan (Live Terminal Monitor)
                </h5>
              </div>
              <span className="text-[9px] font-mono text-[#8A8478] bg-[#2D2821] border border-[#3D3831] px-2 py-0.5 rounded">
                STATUS: {isBatchCrawling ? "CRAWLING" : "IDLE"}
              </span>
            </div>

            {/* Console Log Lines */}
            <div className="flex-1 overflow-y-auto space-y-2.5 font-mono text-[10px] leading-relaxed custom-scrollbar max-h-[300px] text-left pr-1">
              {crawlLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[#8A8478] italic">
                  Konsol sedia. Cetusan rangkakan batch di sebelah kiri untuk melihat maklumat terperinci penganalisisan.
                </div>
              ) : (
                crawlLogs.map((log, index) => (
                  <div key={index} className="p-2 rounded bg-[#2D2821] border border-[#3D3831] space-y-1">
                    <div className="flex justify-between items-center text-[9px] border-b border-[#3D3831] pb-1 text-[#8A8478]">
                      <span className="truncate max-w-[70%] font-semibold text-[#E5E1D8]">{log.title}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span>{log.time}</span>
                        {log.status === "RUNNING" && (
                          <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-bold animate-pulse">RUNNING</span>
                        )}
                        {log.status === "SUCCESS" && (
                          <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-bold">SUCCESS</span>
                        )}
                        {log.status === "FAILED" && (
                          <span className="px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[8px] font-bold">FAILED</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[#C5C0B7] break-all">{log.url}</p>
                    <p className="text-[#8B9474] font-sans text-[11px] leading-normal">{log.log}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

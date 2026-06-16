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
  onIndexComplete?: () => void;
  setError: (error: string | null) => void;
}

interface IngestStats {
  title: string;
  chunksCount: number;
  nodesCount: number;
  linksCount: number;
  documentsCount?: number;
  crawler?: string;
  gcsStatus?: string;
  bigQueryStatus?: string;
  knowledgeCatalogStatus?: string;
  metadataCatalogPath?: string;
  gcsRawUris?: string[];
}

interface CrawlLog {
  sourceId?: number;
  sourceName?: string;
  url: string;
  title: string;
  status: string;
  log: string;
  time: string;
  pagesCount?: number;
  chunksCount?: number;
  nodesCount?: number;
  linksCount?: number;
  crawler?: string;
  gcsStatus?: string;
  bigQueryStatus?: string;
  knowledgeCatalogStatus?: string;
}

const PRIMARY_PORTALS = [
  { name: "Waktu Solat Digital", url: "https://www.waktusolat.digital", category: "Falak & Ibadah" },
  { name: "Berita Harian - Agama", url: "https://www.bharian.com.my/rencana/agama", category: "Rencana Agama" },
  { name: "Harian Metro - Addin", url: "https://www.hmetro.com.my/addin", category: "Bimbingan Harian" },
  { name: "JAKIM - Portal i-Fiqh", url: "https://i-fiqh.islam.gov.my/portal/", category: "Muamalat & Fiqh" },
  { name: "JAKIM - Portal MyHadith", url: "https://myhadith.islam.gov.my", category: "Hadis & Sanad" },
  { name: "JAKIM - e-Khutbah", url: "https://www.islam.gov.my/ms/e-khutbah", category: "Khutbah" },
  { name: "Mufti WP - Bayan Linnas", url: "https://muftiwp.gov.my/ms/artikel/bayan-linnas", category: "Isu Semasa" },
  { name: "Mufti WP - Irsyad Hukum", url: "https://muftiwp.gov.my/ms/artikel/irsyad-hukum", category: "Fatwa & Hukum" },
  { name: "Mufti WP - Irsyad Al-Hadith", url: "https://muftiwp.gov.my/ms/artikel/irsyad-al-hadith", category: "Hadis" },
  { name: "Mufti WP - Al-Kafi li al-Fatawi", url: "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi", category: "Soal Jawab" }
];

export function CrawlerPanel({ onIndexComplete, setError }: CrawlerPanelProps) {
  const [singleUrl, setSingleUrl] = useState("");
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [singleStats, setSingleStats] = useState<IngestStats | null>(null);
  const [singleSuccessMsg, setSingleSuccessMsg] = useState<string | null>(null);

  const [isBatchCrawling, setIsBatchCrawling] = useState(false);
  const [crawlLogs, setLogs] = useState<CrawlLog[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [totalSources, setTotalSources] = useState(PRIMARY_PORTALS.length);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll crawl logs from backend
  const fetchCrawlLogs = async () => {
    try {
      const res = await fetch("/api/crawl-logs");
      if (!res.ok) throw new Error("Gagal mengambil log crawler.");
      const data = await res.json();
      
      setIsBatchCrawling(data.isCrawling);
      setLogs(data.logs || []);
      if (typeof data.total === "number") {
        setTotalSources(data.total);
      }

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };

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
  const progressPercent = totalSources > 0 ? (completedCount / totalSources) * 100 : 0;

  return (
    <div className="space-y-6 text-left">
      
      {/* Banner / Intro */}
      <div className="p-4 rounded-2xl border border-[#E5E1D8] bg-[#F9F7F2]/50 text-xs text-[#5A564E] leading-relaxed shadow-inner flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#5A634A]/10 flex items-center justify-center shrink-0 mt-0.5 border border-[#5A634A]/15">
          <Database className="w-4 h-4 text-[#5A634A]" />
        </div>
        <div>
          <span className="text-[#5A634A] font-serif font-bold uppercase tracking-wider text-[10px] block mb-0.5">
            Crawl4AI, BigQuery & Knowledge Catalog
          </span>
          Sistem merayap 10 portal rujukan, menyimpan snapshot Markdown ke Cloud Storage, mengisi BigQuery Vector Search, dan menerbitkan konteks ke Knowledge Catalog.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Manual URL Indexing & Batch Action (Takes 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Section 1: Single URL Crawler Form */}
          <div className="p-5 rounded-2xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2 border-b border-[#E5E1D8]/60 pb-3">
              <Globe className="w-4 h-4 text-[#5A634A]" />
              Indeks URL Tunggal
            </h5>
            
            <form onSubmit={handleSingleCrawl} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[#8A8478] font-serif block">
                  URL Artikel / Fatwa Fiqh:
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://muftiwp.gov.my/..."
                    className="flex-1 px-3 py-2 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2]/30 text-xs text-[#3D3B36] focus:outline-none focus:ring-1 focus:ring-[#5A634A] focus:border-[#5A634A] transition-all"
                    disabled={isSingleLoading}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isSingleLoading || !singleUrl.trim()}
                    className="px-4 py-2 bg-[#5A634A] hover:bg-[#5A634A]/90 disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-[#FDFBF7] text-xs font-bold rounded-xl shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
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
                  className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs leading-relaxed space-y-2.5 text-left"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{singleSuccessMsg}</span>
                  </div>
                  {singleStats && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-100 text-[9px] font-mono text-[#5A564E] font-bold">
                        <div className="bg-[#FDFBF7] p-2 rounded-lg border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#5A634A] text-sm mb-0.5">{singleStats.documentsCount || 1}</span>
                          Dokumen
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-lg border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#5A634A] text-sm mb-0.5">{singleStats.chunksCount}</span>
                          Chunks
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-lg border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#A48F68] text-sm mb-0.5">{singleStats.nodesCount}</span>
                          Nodes
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-lg border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-slate-600 text-sm mb-0.5">{singleStats.linksCount}</span>
                          Edges
                        </div>
                      </div>
                      <p className="text-[10px] text-emerald-700 font-mono">
                        Crawler: {singleStats.crawler || "crawl4ai"} | BQ: {singleStats.bigQueryStatus || "SKIPPED_NOT_CONFIGURED"} | Catalog: {singleStats.knowledgeCatalogStatus || "SKIPPED_NOT_CONFIGURED"} | GCS: {singleStats.gcsStatus || "SKIPPED_NOT_CONFIGURED"}
                      </p>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Section 2: Batch Indexing Action Card */}
          <div className="p-5 rounded-2xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2 border-b border-[#E5E1D8]/60 pb-3">
              <Layers className="w-4 h-4 text-[#A48F68]" />
              Ingestasi Batch
            </h5>
            <p className="text-[11px] text-[#5A564E] leading-relaxed">
              Memproses 10 portal rujukan secara berjujukan di pelayan latar belakang supaya tapak luar tidak dibanjiri permintaan.
            </p>

            <button
              onClick={handleBatchCrawl}
              disabled={isBatchCrawling}
              className={`w-full py-3 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                isBatchCrawling 
                  ? "bg-[#EAE7DF] text-[#8A8478] cursor-not-allowed border border-[#D4D0C6]" 
                  : "bg-[#5A634A] hover:bg-[#5A634A]/90 text-white border border-transparent hover:shadow active:scale-[0.99]"
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
                  MULA CRAWL4AI BATCH
                </>
              )}
            </button>

            {/* Ingress status progress */}
            {isBatchCrawling && (
              <div className="space-y-2 bg-[#F9F7F2] p-3.5 rounded-xl border border-[#E5E1D8] text-xs">
                <div className="flex justify-between font-bold text-[9px] text-[#8A8478] uppercase tracking-wider">
                  <span>Status Kemajuan:</span>
                  <span>{completedCount} / {totalSources} Selesai</span>
                </div>
                <div className="w-full h-2 bg-[#EAE7DF] rounded-full overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-gradient-to-r from-[#5A634A] via-[#8B9474] to-[#A48F68] transition-all duration-500 rounded-full" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {runningUrl && (
                  <p className="text-[10px] text-[#8A8478] mt-1 italic truncate">
                    Sedang merayap: <span className="text-[#5A634A] font-semibold">{runningUrl}</span>
                  </p>
                )}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] leading-relaxed text-left flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{successMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Portal Directories & Live Log Monitor (Takes 7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Top of Right Column: Directory of Registered Portals */}
          <div className="p-4 rounded-2xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-3">
            <h5 className="font-serif font-bold text-xs uppercase tracking-wider text-[#8A8478] flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#5A634A]" />
              Direktori 10 Portal Berdaftar
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {PRIMARY_PORTALS.map((portal, idx) => (
                <div 
                  key={idx} 
                  className="p-2.5 bg-[#F9F7F2]/50 rounded-xl border border-[#E5E1D8]/60 flex items-center justify-between text-xs hover:border-[#5A634A]/50 hover:bg-white hover:shadow-sm transition-all"
                >
                  <div className="min-w-0 pr-2 space-y-0.5">
                    <span className="text-[8px] font-extrabold uppercase text-[#A48F68] px-2 py-0.5 rounded-full bg-[#EAE7DF] border border-[#D4D0C6] inline-block">
                      {portal.category}
                    </span>
                    <h6 className="font-bold text-[#2D2B26] truncate">{portal.name}</h6>
                    <p className="text-[9px] text-[#8A8478] truncate font-mono">{portal.url}</p>
                  </div>
                  <a 
                    href={portal.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="p-2 hover:bg-[#EAE7DF] rounded-xl text-[#8A8478] hover:text-[#5A634A] transition-colors shrink-0 border border-transparent hover:border-[#D4D0C6]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom of Right Column: Real-time Live Logs Console */}
          <div className="flex-1 p-4 rounded-2xl border border-[#3D3831] bg-[#141413] text-[#FDFBF7] shadow-xl flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#2C2822] pb-3 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full inline-block ${isBatchCrawling ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <h5 className="font-serif font-bold text-xs text-[#E5E1D8] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  Konsol Terminal Live
                </h5>
              </div>
              <span className="text-[8px] font-mono text-[#8A8478] bg-[#22201B] border border-[#3D3831] px-2.5 py-1 rounded-full font-bold">
                STATUS: {isBatchCrawling ? "CRAWLING" : "IDLE"}
              </span>
            </div>

            {/* Console Log Lines */}
            <div className="flex-1 overflow-y-auto space-y-2.5 font-mono text-[10px] leading-relaxed custom-scrollbar max-h-[280px] text-left pr-1">
              {crawlLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[#8A8478] italic text-xs">
                  Sedia. Cetusan batch crawling untuk melihat maklumat penganalisisan.
                </div>
              ) : (
                crawlLogs.map((log, index) => (
                  <div key={index} className="p-3 rounded-xl bg-[#1C1B18] border border-[#2D2821] space-y-1.5 shadow-inner">
                    <div className="flex justify-between items-center text-[9px] border-b border-[#2D2821] pb-1.5 text-[#8A8478]">
                      <span className="truncate max-w-[70%] font-bold text-[#E5E1D8]">{log.sourceName || log.title}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span>{log.time}</span>
                        {log.status === "RUNNING" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[7px] font-extrabold animate-pulse">RUNNING</span>
                        )}
                        {log.status === "SUCCESS" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[7px] font-extrabold">SUCCESS</span>
                        )}
                        {log.status === "FAILED" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[7px] font-extrabold font-mono">FAILED</span>
                        )}
                      </div>
                    </div>
                    {log.sourceName && (
                      <p className="text-[#E5E1D8] font-sans text-[11px] leading-relaxed">{log.title}</p>
                    )}
                    <p className="text-[#A48F68] break-all opacity-90 select-all">{log.url}</p>
                    <p className="text-[#D4D0C6] font-sans text-xs leading-relaxed opacity-95">{log.log}</p>
                    {(log.pagesCount || log.crawler || log.bigQueryStatus || log.knowledgeCatalogStatus || log.gcsStatus) && (
                      <div className="flex flex-wrap gap-1.5 pt-1 text-[8px] uppercase tracking-wider font-extrabold">
                        {log.pagesCount && (
                          <span className="px-2 py-1 rounded-full bg-[#22201B] text-[#E5E1D8] border border-[#3D3831]">{log.pagesCount} dokumen</span>
                        )}
                        {log.crawler && (
                          <span className="px-2 py-1 rounded-full bg-[#22201B] text-[#A48F68] border border-[#3D3831]">{log.crawler}</span>
                        )}
                        {log.bigQueryStatus && (
                          <span className="px-2 py-1 rounded-full bg-[#22201B] text-sky-300 border border-[#3D3831]">BigQuery {log.bigQueryStatus}</span>
                        )}
                        {log.knowledgeCatalogStatus && (
                          <span className="px-2 py-1 rounded-full bg-[#22201B] text-emerald-300 border border-[#3D3831]">Catalog {log.knowledgeCatalogStatus}</span>
                        )}
                        {log.gcsStatus && (
                          <span className="px-2 py-1 rounded-full bg-[#22201B] text-amber-300 border border-[#3D3831]">GCS {log.gcsStatus}</span>
                        )}
                      </div>
                    )}
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

import React, { useState, useEffect, useRef } from "react";
import { 
  Globe, 
  Play, 
  Loader2, 
  CheckCircle2, 
  ExternalLink,
  Layers,
  Sparkles,
  Search,
  RefreshCw,
  AlertCircle,
  Clock3
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

type PortalIndexStatus = "indexed" | "crawling" | "failed" | "waiting";

function isStoredStatus(status?: string) {
  if (!status) return false;
  return !status.toUpperCase().startsWith("SKIPPED") && !status.toUpperCase().includes("NOT_CONFIGURED");
}

function statusTone(status: PortalIndexStatus) {
  switch (status) {
    case "indexed":
      return {
        dot: "bg-emerald-500",
        ring: "ring-emerald-100",
        text: "text-emerald-700",
        label: "Indexed"
      };
    case "crawling":
      return {
        dot: "bg-amber-400 animate-pulse",
        ring: "ring-amber-100",
        text: "text-amber-700",
        label: "Crawling"
      };
    case "failed":
      return {
        dot: "bg-rose-500",
        ring: "ring-rose-100",
        text: "text-rose-700",
        label: "Failed"
      };
    default:
      return {
        dot: "bg-[#C8C2B5]",
        ring: "ring-[#EAE7DF]",
        text: "text-[#8A8478]",
        label: "Waiting"
      };
  }
}

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
  const indexedCount = crawlLogs.filter(log => log.status === "SUCCESS").length;
  const failedCount = crawlLogs.filter(log => log.status === "FAILED").length;
  const latestLogs = [...crawlLogs].slice(-4).reverse();

  const getPortalLog = (portalUrl: string) => {
    const normalizedPortalUrl = portalUrl.replace(/\/$/, "");
    return [...crawlLogs].reverse().find((log) => {
      const normalizedLogUrl = log.url.replace(/\/$/, "");
      return normalizedLogUrl === normalizedPortalUrl || normalizedLogUrl.startsWith(normalizedPortalUrl);
    });
  };

  const getPortalStatus = (portalUrl: string): PortalIndexStatus => {
    const log = getPortalLog(portalUrl);
    if (!log) return "waiting";
    if (log.status === "RUNNING") return "crawling";
    if (log.status === "FAILED") return "failed";
    return "indexed";
  };

  return (
    <div className="space-y-5 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8478]">Indexed</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          </div>
          <p className="mt-2 text-2xl font-serif font-bold text-[#2D2B26]">{indexedCount}</p>
          <p className="text-[11px] text-[#8A8478]">of {totalSources} portals</p>
        </div>
        <div className="rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8478]">Status</span>
            <span className={`w-2.5 h-2.5 rounded-full ring-4 ${isBatchCrawling ? "bg-amber-400 ring-amber-100 animate-pulse" : "bg-[#C8C2B5] ring-[#EAE7DF]"}`} />
          </div>
          <p className="mt-2 text-2xl font-serif font-bold text-[#2D2B26]">{isBatchCrawling ? "Active" : "Idle"}</p>
          <p className="text-[11px] text-[#8A8478]">{completedCount} completed</p>
        </div>
        <div className="rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8478]">Issues</span>
            <AlertCircle className={`w-4 h-4 ${failedCount ? "text-rose-600" : "text-[#C8C2B5]"}`} />
          </div>
          <p className="mt-2 text-2xl font-serif font-bold text-[#2D2B26]">{failedCount}</p>
          <p className="text-[11px] text-[#8A8478]">failed crawls</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#5A634A]" />
              Indeks URL Tunggal
            </h5>
            
            <form onSubmit={handleSingleCrawl} className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://muftiwp.gov.my/..."
                    className="min-w-0 flex-1 px-3 py-2.5 rounded-lg border border-[#E5E1D8] bg-white text-xs text-[#3D3B36] focus:outline-none focus:ring-1 focus:ring-[#5A634A] focus:border-[#5A634A] transition-all"
                    disabled={isSingleLoading}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isSingleLoading || !singleUrl.trim()}
                    className="px-3 py-2.5 bg-[#5A634A] hover:bg-[#5A634A]/90 disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-[#FDFBF7] text-xs font-bold rounded-lg shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                    title="Index URL"
                  >
                    {isSingleLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
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
                  className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs leading-relaxed space-y-2.5 text-left"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{singleSuccessMsg}</span>
                  </div>
                  {singleStats && (
                    <>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-100 text-[9px] font-mono text-[#5A564E] font-bold">
                        <div className="bg-[#FDFBF7] p-2 rounded-md border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#5A634A] text-sm mb-0.5">{singleStats.documentsCount || 1}</span>
                          Dokumen
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-md border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#5A634A] text-sm mb-0.5">{singleStats.chunksCount}</span>
                          Chunks
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-md border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-[#A48F68] text-sm mb-0.5">{singleStats.nodesCount}</span>
                          Nodes
                        </div>
                        <div className="bg-[#FDFBF7] p-2 rounded-md border border-emerald-200/50 text-center shadow-inner">
                          <span className="block font-extrabold text-slate-600 text-sm mb-0.5">{singleStats.linksCount}</span>
                          Edges
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                        <span className={`px-2 py-1 rounded-full ${isStoredStatus(singleStats.bigQueryStatus) ? "bg-emerald-100 text-emerald-700" : "bg-[#EAE7DF] text-[#8A8478]"}`}>BigQuery</span>
                        <span className={`px-2 py-1 rounded-full ${isStoredStatus(singleStats.knowledgeCatalogStatus) ? "bg-emerald-100 text-emerald-700" : "bg-[#EAE7DF] text-[#8A8478]"}`}>Catalog</span>
                        <span className={`px-2 py-1 rounded-full ${isStoredStatus(singleStats.gcsStatus) ? "bg-emerald-100 text-emerald-700" : "bg-[#EAE7DF] text-[#8A8478]"}`}>Storage</span>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4 rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-4">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#A48F68]" />
              Ingestasi Batch
            </h5>

            <button
              onClick={handleBatchCrawl}
              disabled={isBatchCrawling}
              className={`w-full py-3 rounded-lg text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
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

            <div className="space-y-2">
              <div className="flex justify-between font-bold text-[10px] text-[#8A8478] uppercase tracking-wider">
                <span>Kemajuan</span>
                <span>{completedCount} / {totalSources}</span>
              </div>
              <div className="w-full h-2 bg-[#EAE7DF] rounded-full overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-[#5A634A] transition-all duration-500 rounded-full" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {runningUrl && (
                <p className="text-[10px] text-[#8A8478] truncate">
                  <span className="text-[#5A634A] font-semibold">Aktif:</span> {runningUrl}
                </p>
              )}
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] leading-relaxed text-left flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{successMsg}</span>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="p-4 rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-3">
            <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#5A634A]" />
              Portal Berdaftar
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
              {PRIMARY_PORTALS.map((portal, idx) => {
                const log = getPortalLog(portal.url);
                const portalStatus = getPortalStatus(portal.url);
                const tone = statusTone(portalStatus);

                return (
                <div 
                  key={idx} 
                  className="p-3 bg-white rounded-lg border border-[#E5E1D8]/80 flex items-center justify-between text-xs hover:border-[#5A634A]/50 hover:shadow-sm transition-all"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ring-4 shrink-0 ${tone.dot} ${tone.ring}`} />
                      <h6 className="font-bold text-[#2D2B26] truncate">{portal.name}</h6>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-[#A48F68] bg-[#F5F1E9] px-1.5 py-0.5 rounded">
                        {portal.category}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${tone.text}`}>
                        {tone.label}
                      </span>
                      {log?.status === "SUCCESS" && (
                        <>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isStoredStatus(log.bigQueryStatus) ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F0EC] text-[#8A8478]"}`}>BQ</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isStoredStatus(log.knowledgeCatalogStatus) ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F0EC] text-[#8A8478]"}`}>Catalog</span>
                        </>
                      )}
                    </div>
                  </div>
                  <a 
                    href={portal.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="p-2 hover:bg-[#EAE7DF] rounded-lg text-[#8A8478] hover:text-[#5A634A] transition-colors shrink-0 border border-transparent hover:border-[#D4D0C6]"
                    title="Open portal"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )})}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E5E1D8] bg-[#FDFBF7] shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-serif font-bold text-sm text-[#2D2B26] flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 text-[#5A634A] ${isBatchCrawling ? "animate-spin" : ""}`} />
                Aktiviti Terkini
              </h5>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8478]">
                {crawlLogs.length} rekod
              </span>
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              {latestLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#D4D0C6] bg-[#F9F7F2]/70 p-5 text-center text-xs text-[#8A8478]">
                  Tiada aktiviti lagi.
                </div>
              ) : (
                latestLogs.map((log, index) => {
                  const logStatus: PortalIndexStatus =
                    log.status === "RUNNING" ? "crawling" : log.status === "FAILED" ? "failed" : "indexed";
                  const tone = statusTone(logStatus);

                  return (
                  <div key={index} className="rounded-lg border border-[#E5E1D8] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ring-4 shrink-0 ${tone.dot} ${tone.ring}`} />
                          <h6 className="font-bold text-xs text-[#2D2B26] truncate">{log.sourceName || log.title}</h6>
                        </div>
                        <p className="mt-1 pl-6 text-[10px] text-[#8A8478] truncate">{log.url}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[#8A8478]">
                        <Clock3 className="w-3.5 h-3.5" />
                        {log.time}
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-[#5A564E] leading-relaxed">{log.log}</p>
                    {(log.pagesCount || log.bigQueryStatus || log.knowledgeCatalogStatus || log.gcsStatus) && (
                      <div className="flex flex-wrap gap-1.5 pt-2 text-[9px] uppercase tracking-wider font-bold">
                        {log.pagesCount && (
                          <span className="px-2 py-1 rounded-full bg-[#F5F1E9] text-[#6D685E]">{log.pagesCount} dokumen</span>
                        )}
                        {log.bigQueryStatus && (
                          <span className={`px-2 py-1 rounded-full ${isStoredStatus(log.bigQueryStatus) ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F0EC] text-[#8A8478]"}`}>BigQuery</span>
                        )}
                        {log.knowledgeCatalogStatus && (
                          <span className={`px-2 py-1 rounded-full ${isStoredStatus(log.knowledgeCatalogStatus) ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F0EC] text-[#8A8478]"}`}>Catalog</span>
                        )}
                        {log.gcsStatus && (
                          <span className={`px-2 py-1 rounded-full ${isStoredStatus(log.gcsStatus) ? "bg-emerald-50 text-emerald-700" : "bg-[#F1F0EC] text-[#8A8478]"}`}>Storage</span>
                        )}
                      </div>
                    )}
                  </div>
                )})
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { Sparkles, Library, FileText, Check, AlertCircle, RefreshCw } from "lucide-react";
import { KnowledgeNode, KnowledgeLink } from "../types";

interface ParserSimulatorProps {
  onGraphExtracted: (nodes: KnowledgeNode[], links: KnowledgeLink[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const MEMO_EXAMPLES = [
  {
    title: "Fatwa Pelaburan Mata Wang Kripto (Muamalat)",
    text: "Keputusan Jawatankuasa Fatwa Kebangsaan JAKIM memutuskan bahawa pelaburan dan perdagangan mata wang kripto (Cryptocurrency) adalah HARAM sekiranya ia berunsurkan Riba, Gharar (ketidakpastian) dan Judi. Walau bagaimanapun, penggunaan teknologi rantaian blok (Blockchain) adalah HARUS kerana memberi manfaat kepada sistem kewangan Islam global."
  },
  {
    title: "Irsyad Hadis Palsu Media Sosial (Sumber)",
    text: "Pejabat Mufti Wilayah Persekutuan memperingatkan melalui Irsyad Al-Hadith bahawa penyebaran hadis palsu berhubung malam Nisfu Sya'ban di aplikasi WhatsApp adalah HARAM. Umat Islam dinasihatkan menyemak kesahihan sanad melalui pangkalan data MyHadith JAKIM untuk mengelakkan takhrij yang dilarang oleh Mazhab Syafi'i."
  },
  {
    title: "Ketetapan Kaedah Falak Waktu Solat (Ibadah)",
    text: "Mengikut persetujuan takwim waktusolat.digital bersama Jabatan Mufti, kaedah hisab (astronomi falak) berasaskan pencerapan altitud matahari 18 darjah di bawah ufuk digunakan untuk menentukan waktu Subuh rasmi di Malaysia. Kaedah Falak ini disokong secara ijmak oleh Majlis Raja-Raja."
  }
];

export function ParserSimulator({
  onGraphExtracted,
  isLoading,
  setIsLoading,
  setError,
}: ParserSimulatorProps) {
  const [text, setText] = useState(MEMO_EXAMPLES[0].text);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<any | null>(null);

  const handleExtract = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    setRawOutput(null);

    try {
      const localKey = localStorage.getItem("mursyid_gemini_api_key") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (localKey) {
        headers["Authorization"] = `Bearer ${localKey}`;
      }

      const response = await fetch("/api/extract-graph", {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsApiKey) {
          throw new Error("Sila pasangkan API key anda bagi Gemini API di panel Secrets dalam Google AI Studio!");
        }
        throw new Error(data.error || "Gagal melaksanakan carian pengekstrakan graf.");
      }

      if (data.nodes && data.links) {
        onGraphExtracted(data.nodes, data.links);
        setRawOutput(data);
        setSuccessMsg(
          `Berjaya mengekstrak ${data.nodes.length} nod entiti Syariah dan ${data.links.length} hubungan eksplisit ke dalam kanvas D3!`
        );
      } else {
        throw new Error("Struktur hasil carian tidak sah. Tiada rekod hubungan ditemui.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during graph extraction.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-left">
      {/* Explanation banner */}
      <div className="bg-[#EAE7DF]/30 p-4 rounded-xl border border-[#D4D0C6] text-xs text-[#5A564E] leading-relaxed shadow-sm">
        <span className="text-[#5A634A] font-bold uppercase font-mono text-[10px] block mb-1">
          Simulasi Hubungan Pengetahuan
        </span>
        Masukkan mana-mana artikel fatwa, perbincangan hukum, atau dalil dalam Bahasa Melayu. Model 
        kecerdasan buatan akan melakukan proses pengecaman entiti bertatatingkat (<span className="text-[#A48F68] font-medium font-serif">Named Entity Recognition</span>) 
        dan membina tatanan tiga-serangkai (Ontological Triples) untuk dimuatkan terus ke dalam visualisasi graf pengetahuan interaktif.
      </div>

      {/* Preset Examples Selection */}
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider font-semibold text-[#8A8478] font-serif flex items-center gap-1.5">
          <Library className="w-3.5 h-3.5 text-[#5A634A]" />
          Pilih Artikel Contoh (Persoalan Kontemporari):
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MEMO_EXAMPLES.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => {
                setText(ex.text);
                setSuccessMsg(null);
                setRawOutput(null);
              }}
              className={`p-2.5 rounded-lg border text-xs text-left transition-all cursor-pointer ${
                text === ex.text
                  ? "border-[#5A634A] bg-[#F9F7F2] text-[#2D2B26] shadow-sm"
                  : "border-[#E5E1D8] bg-white text-[#56524A] hover:border-[#5A634A] hover:text-[#2D2B26] hover:bg-[#F9F7F2]/30"
              }`}
            >
              <div className="font-semibold flex items-center gap-1">
                <FileText className="w-3 h-3 shrink-0" />
                {ex.title.replace(" (Muamalat)", "").replace(" (Sumber)", "").replace(" (Ibadah)", "")}
              </div>
              <p className="text-[10px] text-[#8A8478] mt-1 line-clamp-1">{ex.text}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Text Input */}
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider font-semibold text-[#8A8478] font-serif">
          Teks Fatwah / Dalil / Pertanyaan Untuk Digraf:
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Isi teks hukum keagamaan di sini..."
          className="w-full p-3 rounded-lg border border-[#E5E1D8] bg-white text-xs text-[#3D3B36] focus:outline-none focus:ring-1 focus:ring-[#5A634A] focus:border-[#5A634A] custom-scrollbar resize-none"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <button
          onClick={handleExtract}
          disabled={isLoading || !text.trim()}
          id="extract-kg-btn"
          className="px-4 py-2.5 rounded-lg bg-[#5A634A] hover:bg-[#5A634A]/90 disabled:bg-[#EAE7DF] disabled:text-[#8A8478] text-xs font-semibold text-[#FDFBF7] flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white/80" />
          ) : (
            <Sparkles className="w-4 h-4 text-white/80" />
          )}
          Ekstrak Graf Pengetahuan Islam (AI)
        </button>

        <button
          onClick={() => {
            setText("");
            setSuccessMsg(null);
            setRawOutput(null);
          }}
          className="px-4 py-2.5 rounded-lg border border-[#D4D0C6] text-xs font-semibold text-[#8A8478] hover:bg-[#F9F7F2]/40 transition-all cursor-pointer"
        >
          Kosongkan Input
        </button>
      </div>

      {/* Output Status Banner */}
      {successMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-start gap-2 animate-fade-in text-left">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Show JSON structure preview to provide developer transparency (Literal design) */}
      {rawOutput && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#8A8478]">
            <span>PREVIEW DATA ONTOLOGI (TRIPLES JSON):</span>
            <span className="text-[#5A634A] font-bold">STANDAR RDF / GRAPH COMPLIANT</span>
          </div>
          <pre className="p-3 rounded-lg bg-[#FDFBF7] border border-[#E5E1D8] font-mono text-[9px] text-[#5A564E] overflow-x-auto max-h-40 custom-scrollbar">
            {JSON.stringify(rawOutput, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

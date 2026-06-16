import React, { useState } from "react";
import { Network, Database, Link, AlertTriangle, CheckCircle, ArrowRight, Share2, Search, Check } from "lucide-react";

export function ArchitectureExplainer() {
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    setExported(true);
    setTimeout(() => {
      setExported(false);
    }, 4000);
  };

  return (
    <div className="space-y-6 text-[#5A564E]">
      {/* Header card explaining the dilemma */}
      <div className="p-6 rounded-2xl bg-[#F9F7F2] border border-[#E5E1D8] shadow-sm">
        <h3 className="font-serif text-lg font-bold text-[#2D2B26] flex items-center gap-2">
          <Network className="w-5 h-5 text-[#5A634A]" />
          Mengapa Fiqh Berautoriti Memerlukan Graf Pengetahuan (Knowledge Graph)?
        </h3>
        <p className="mt-2 text-sm text-[#5A564E] leading-relaxed">
          Dalam perundangan Islam (Fiqh), setiap keputusan hukum (<span className="text-[#A48F68] italic font-semibold">Hukum Taklifi</span>) 
          tidak boleh dinilai secara terasing semata-mata berdasarkan padanan perkataan (keyword cosine similarity) yang biasa dilakukan 
          oleh enjin carian vektor (RAG tradisional). Pendekatan tersebut sering kali memusnahkan konteks bersyarat, memisahkan rujukan 
          Hadis daripada syarah sanadnya, atau mencampuradukkan fatwa berlainan mazhab.
        </p>
      </div>

      {/* Side-by-side Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: Traditional Vector Search issues */}
        <div className="p-5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h4 className="font-serif font-bold text-[#2D2B26]">Enjin Carian Vektor Tradisional (RAG)</h4>
          </div>
          <p className="text-xs text-[#5A564E] leading-relaxed">
            Menukarkan dokumen fatwa ke dalam bentuk serpihan teks kecil (chunks) dan mewakilinya sebagai vektor koordinat matematik.
          </p>
          <ul className="space-y-2.5 text-xs text-[#5A564E]">
            <li className="flex gap-2 items-start">
              <span className="text-rose-600 font-bold shrink-0">✕</span>
              <span><strong>Kehilangan Konteks Rantai Hukum (Isnad):</strong> Pemecahan teks memisahkan dalil asal Al-Quran/Hadis dari perenggan ringkasan hukum asal.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-rose-600 font-bold shrink-0">✕</span>
              <span><strong>Kekeliruan Topik Serupa:</strong> Memadankan "Pelaburan Forex" dan "Pelaburan Saham" secara dekat hanya kerana perkataan "pelaburan" serupa, walaupun hukum syaraknya bertentangan sama sekali.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-rose-600 font-bold shrink-0">✕</span>
              <span><strong>Ketiadaan Hierarki Keputusan:</strong> Gagal mengetahui sama ada sesuatu fatwa dikeluarkan oleh Jawatankuasa Fatwa Kebangsaan (hierarki tertinggi) atau pandangan individu di blog artikel.</span>
            </li>
          </ul>
        </div>

        {/* Right column: Knowledge Graph advantages */}
        <div className="p-5 rounded-xl border border-[#D4D0C6] bg-[#EAE7DF]/30 space-y-4 shadow-sm text-left">
          <div className="flex items-center gap-2 text-[#5A634A]">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <h4 className="font-serif font-bold text-[#2D2B26]">Ontologi Graf Pengetahuan Islam (KG)</h4>
          </div>
          <p className="text-xs text-[#5A564E] leading-relaxed">
            Memeta dan menterjemahkan dokumen fatwa, hadis, dan pandangan mazhab ke dalam rekod eksplisit (Nod, Hubungan, Sifat).
          </p>
          <ul className="space-y-2.5 text-xs text-[#5A564E]">
            <li className="flex gap-2 items-start">
              <span className="text-[#5A634A] font-bold shrink-0">✓</span>
              <span><strong>Pemeliharaan Integriti Rujukan:</strong> Menjaga kaitan rantaian <span className="font-mono text-[10px] text-[#5A634A] bg-white px-1 py-0.5 rounded border border-[#E5E1D8]">RULING_ON ➔ HADITH_SUPPORTED ➔ SANAD_VERIFIED</span> sebagai hubungan yang tiada kelonggaran.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-[#5A634A] font-bold shrink-0">✓</span>
              <span><strong>Penerokaan Topik Global (Global View):</strong> Enjin berupaya menyusuri graf untuk memahami perbezaan Mazhab Syafi'i dengan mazhab lain secara mutlak.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-[#5A634A] font-bold shrink-0">✓</span>
              <span><strong>Ketahanan Kalis Halusinasi:</strong> Model AI diikat untuk hanya menterjemah maklumat berpandukan pautan eksplisit entiti yang wujud didalam graf yang sahih sahaja.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Ideal Engineering Solution Flow for Malaysia Auth */}
      <div className="p-6 rounded-xl border border-[#E5E1D8] bg-[#F9F7F2] shadow-sm text-left">
        <h4 className="font-serif font-bold text-[#2D2B26] mb-4 text-center">
          Saranan Senibina Indeksasi Berautoriti (3-Teras Integrasi)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center relative">
          {/* Step 1 */}
          <div className="p-4 rounded-lg bg-white border border-[#E5E1D8] space-y-2 relative shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[#EAE7DF] border border-[#D4D0C6] text-[#5A634A] flex items-center justify-center font-bold text-xs mx-auto mb-1">
              1
            </div>
            <h5 className="text-xs font-bold text-[#5A634A] uppercase tracking-wider font-serif">Teras Ontologi (Ontology Base)</h5>
            <p className="text-[11px] text-[#56524A] leading-relaxed">
              Mentakrifkan teologi asas, mazhab utama (Syafi'i), rukun ibadah, konsep muamalah, serta senarai 10 laman web rasmi terpenting sebagai nod asas berakar.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-lg bg-white border border-[#E5E1D8] space-y-2 relative shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[#EAE7DF] border border-[#D4D0C6] text-[#5A634A] flex items-center justify-center font-bold text-xs mx-auto mb-1">
              2
            </div>
            <h5 className="text-xs font-bold text-[#5A634A] uppercase tracking-wider font-serif">Integrasi Carian Berstruktur (Grounded RAG)</h5>
            <p className="text-[11px] text-[#56524A] leading-relaxed">
              Mengehadkan domain carian AI secara eksklusif kepada tapak web dipercayai (seperti muftiwp.gov.my dan islam.gov.my) bagi mengumpul data mutakhir.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-lg bg-white border border-[#E5E1D8] space-y-2 relative shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[#EAE7DF] border border-[#D4D0C6] text-[#5A634A] flex items-center justify-center font-bold text-xs mx-auto mb-1">
              3
            </div>
            <h5 className="text-xs font-bold text-[#5A634A] uppercase tracking-wider font-serif">Hubungan Dinamik (Dynamic Triples)</h5>
            <p className="text-[11px] text-[#56524A] leading-relaxed">
              Mengekstrak konsep dari data baru, memautkan dalil-dalil dengan hukum taklifi secara dinamik di visualizer D3 untuk diteroka pengguna secara interaktif.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[#E5E1D8] bg-[#EAE7DF]/20 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3">
            <Database className="w-8 h-8 text-[#5A634A] shrink-0" />
            <div className="text-left">
              <h5 className="text-xs font-bold text-[#2D2B26] font-serif">Pangkalan Pengetahuan: BigQuery + Knowledge Catalog</h5>
              <p className="text-[10px] text-[#5A564E] leading-relaxed">
                BigQuery menyimpan dokumen, embedding, dan hubungan graf; Knowledge Catalog menerbitkan metadata sumber terkawal.
              </p>
            </div>
          </div>
          <div className="w-full sm:w-auto relative flex flex-col items-center">
            {exported && (
              <span className="absolute -top-10 bg-[#5A634A] text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap animate-bounce flex items-center gap-1 font-sans">
                <Check className="w-3 h-3" /> Rekan bentuk dieksport!
              </span>
            )}
            <button
              onClick={handleExport}
              id="export-architecture-btn"
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#5A634A] hover:bg-[#5A634A]/90 transition-colors text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              Saranan Seni Bina
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

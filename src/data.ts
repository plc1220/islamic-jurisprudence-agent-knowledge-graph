import { SourceWebsite, PresetQuestion, KnowledgeNode, KnowledgeLink } from "./types";

// The 10 official sources from the provided PDF, formatted beautifully
export const OFFICIAL_SOURCES: SourceWebsite[] = [
  {
    id: 1,
    title: "Waktu Solat Digital",
    url: "https://www.waktusolat.digital",
    category: "website - internal",
    description: "Sistem rujukan pengiraan astronomi falak dan waktu solat rasmi bagi negeri-negeri di Malaysia.",
    role: "Integrasi Fardu Ain - Menyediakan data hisab astronomi yang disahkan oleh Jabatan Mufti."
  },
  {
    id: 2,
    title: "Berita Harian (Agama)",
    url: "https://www.bharian.com.my/rencana/agama",
    category: "articles - internal",
    description: "Kolum rencana ilmiah agama, kupasan akademik hal ihwal kemasyarakatan Islam, dan pandangan ulama.",
    role: "Pendidikan & Konteks Sosial - Menghubungkan teori fekah klasik dengan realiti madani Malaysia."
  },
  {
    id: 3,
    title: "Harian Metro (Addin)",
    url: "https://www.hmetro.com.my/addin",
    category: "articles - internal",
    description: "Artikel bimbingan rohani, tazkirah harian, adab, hukum-hakam praktikal, dan kekeluargaan Islam.",
    role: "Penerapan Harian - Panduan ringkas isu syarak harian berlandaskan hukum yang muktamad."
  },
  {
    id: 4,
    title: "Portal i-Fiqh (JAKIM)",
    url: "https://i-fiqh.islam.gov.my/portal/",
    category: "website",
    description: "Gerbang rasmi maklumat Fiqh Islam bersepadu di bawah kendalian Jabatan Kemajuan Islam Malaysia (JAKIM).",
    role: "Pangkalan Rujukan Negara - Pusat dokumentasi fekah semasa, manual dakwah, dan dasar fatwa kebangsaan."
  },
  {
    id: 5,
    title: "Sistem MyHadith (JAKIM)",
    url: "https://myhadith.islam.gov.my",
    category: "website",
    description: "Portal penyemakan, pengesahan, dan klasifikasi keaslian hadis bagi membendung penyebaran hadis palsu.",
    role: "Lembaga Kawalan Hadis - Menentukan status sanad (Sahih, Hasan, Daif, Palsu) dalam konteks Malaysia."
  },
  {
    id: 6,
    title: "Portal e-Khutbah (JAKIM)",
    url: "https://www.islam.gov.my/ms/e-khutbah",
    category: "website",
    description: "Arkib rasmi khutbah Jumaat JAKIM yang membawa naratif syarak, sosio-ekonomi, dan akidah rasmi negara.",
    role: "Penyebaran Mesej Syarak - Teks khutbah berautoriti yang menyatukan pemikiran umat Islam setempat."
  },
  {
    id: 7,
    title: "Bayan Linnas (Mufti WP)",
    url: "https://muftiwp.gov.my/ms/artikel/bayan-linnas",
    category: "website",
    description: "Penjelasan mendalam dan kontemporari oleh Sahibus Samahah Mufti mengenai isu-isu kritikal dan viral.",
    role: "Resolusi Isu Kritikal - Menyelesaikan kekeliruan masyarakat berkaitan kes-kes kebangsaan secara akademik."
  },
  {
    id: 8,
    title: "Irsyad Al-Hukum (Mufti WP)",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-hukum",
    category: "website",
    description: "Siri fatwa, keputusan syarak, bimbingan hukum umum perundangan Islam dan persoalan fekah masyarakat.",
    role: "Panduan Feqah Am - Jawapan lengkap sub-kategori ibadat, muamalat, jinayat, dan urusan nikah ruju'."
  },
  {
    id: 9,
    title: "Irsyad Al-Hadith (Mufti WP)",
    url: "https://muftiwp.gov.my/ms/artikel/irsyad-al-hadith",
    category: "website",
    description: "Kupasan khusus perihal kesahihan hadis, takhrij hadis, syarah, dan pengaplikasiannya oleh institusi mufti.",
    role: "Kefahaman Sunnah - Penjelasan kontekstual hadis khusus untuk menyokong hukum-hakam fiqh tempatan."
  },
  {
    id: 10,
    title: "Al-Kafi li al-Fatawi (Mufti WP)",
    url: "https://muftiwp.gov.my/ms/artikel/al-kafi-li-al-fatawi",
    category: "website",
    description: "Siri soal jawab agama seharian, hujah harian yang padat, praktikal, dan berasaskan fatwa semasa.",
    role: "Khidmat Nasihat Rakyat - Kaunseling rohani harian yang menjawab keraguan kecil tetapi penting dalam ibadah."
  }
];

// Presets that target these reliable resources
export const PRESET_QUESTIONS: PresetQuestion[] = [
  {
    shortLabel: "💰 Pelaburan Kripto",
    question: "Apakah status hukum perdagangan mata wang kripto (Cryptocurrency) menurut keputusan Majlis Kebangsaan Fatwa Malaysia?",
    category: "Muamalah Kontemporari"
  },
  {
    shortLabel: "⏳ Status Hadis Palsu",
    question: "Bagaimanakah sistem MyHadith JAKIM dan Irsyad al-Hadith Mufti WP mengklasifikasikan keaslian hadis di media sosial?",
    category: "Umanah Hadis"
  },
  {
    shortLabel: "🌙 Penentuan Waktu Solat",
    question: "Bagaimana Pejabat Mufti dan waktusolat.digital menentukan kaedah hisab untuk waktu subuh di Malaysia menyusuli perubahan darjah altitud?",
    category: "Ibadah & Falak"
  },
  {
    shortLabel: "🪙 Zakat Pendapatan",
    question: "Apakah kaedah taksiran zakat pendapatan semasa di Wilayah Persekutuan Kuala Lumpur dan rujukan dalil yang digunakan?",
    category: "Zakat & Fekah"
  }
];

// Default pristine Core Shafi'i Ontology Knowledge Graph representing how knowledge is inter-related
export const INITIAL_NODES: KnowledgeNode[] = [
  { id: "syariah", type: "Konsep", label: "Syarak / Syariah", description: "Sistem perundangan dan kaedah ketetapan Tuhan untuk menyusun kehidupan umat Islam." },
  { id: "feqah", type: "Konsep", label: "Feqah (Fiqh)", description: "Penerokaan saintifik hukum amali Islam daripada dalil eksplicit yang ditemui melalui Ijtihad." },
  { id: "hukum", type: "Konsep", label: "Hukum Amali", description: "Peraturan yang dikelaskan kepada lima hukum taklifi (Wajib, Sunat, Harus, Makruh, Haram)." },
  { id: "al_quran", type: "Sumber", label: "Al-Quran", description: "Pencetus hukum primer dan kalam mukjizat Allah yang diwahyukan kepada Nabi Muhammad S.A.W." },
  { id: "al_hadith", type: "Sumber", label: "As-Sunnah / Hadis", description: "Segala perkataan, perbuatan, persetujuan, dan sifat Rasulullah S.A.W yang sahih." },
  { id: "ijtihad", type: "Sumber", label: "Ijtihad / Qiyas / Ijma'", description: "Pemuafakatan para mujtahid (Ijma') dan analogi hukum (Qiyas) sebagai sumber rujukan hujah." },
  { id: "mazhab_syafii", type: "Mazhab", label: "Mazhab Syafi'i", description: "Mazhab utama perundangan Fiqh yang rasmi di Malaysia berpandukan Metodologi Imam Al-Shafi'i." },
  { id: "jakim", type: "Institusi", label: "JAKIM", description: "Jabatan Kemajuan Islam Malaysia - agensi persekutuan utama yang menguruskan hal ehwal Islam negara." },
  { id: "mufti_wp", type: "Institusi", label: "Pejabat Mufti WP", description: "Institusi kefatwaan Wilayah Persekutuan yang memberikan bimbingan hukum Syariah kontemporari rasmi." },
  { id: "myhadith", type: "Artikkel", label: "myhadith.islam.gov.my", description: "Lembaga kawalan hadis JAKIM bagi menyaring pemalsuan sanad hadis dari media massa." },
  { id: "i_fiqh", type: "Artikkel", label: "i-fiqh.islam.gov.my", description: "Katalog fatwa kebangsaan JAKIM mengurus resolusi perundangan muamalat dan kekeluargaan." },
  { id: "al_kafi", type: "Artikkel", label: "Al-Kafi li al-Fatawi", description: "Portal rujukan soalan harian menterjemah masalah fiqh mikro kepada jawapan terus berlandaskan Mazhab." }
];

export const INITIAL_LINKS: KnowledgeLink[] = [
  { source: "feqah", target: "syariah", relation: "CABANG_KEPADA" },
  { source: "feqah", target: "hukum", relation: "MENENTUKAN" },
  { source: "mazhab_syafii", target: "feqah", relation: "SISTEMATISASI" },
  { source: "mazhab_syafii", target: "al_quran", relation: "BERDASARKAN" },
  { source: "mazhab_syafii", target: "al_hadith", relation: "BERDASARKAN" },
  { source: "mazhab_syafii", target: "ijtihad", relation: "MENGGUNAKAN" },
  { source: "jakim", target: "mazhab_syafii", relation: "BERPANDUKAN" },
  { source: "mufti_wp", target: "mazhab_syafii", relation: "BERPANDUKAN" },
  { source: "jakim", target: "myhadith", relation: "MENGENDALIKAN" },
  { source: "jakim", target: "i_fiqh", relation: "MENGENDALIKAN" },
  { source: "mufti_wp", target: "al_kafi", relation: "MENERBITKAN" },
  { source: "al_kafi", target: "hukum", relation: "MEMBERI_PANDUAN" }
];

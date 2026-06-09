export interface ChatMessage {
  id: string;
  role: "user" | "model" | "system";
  content: string;
  timestamp: Date;
  citations?: {
    title: string;
    url: string;
  }[];
}

export interface KnowledgeNode {
  id: string;
  type: "Konsep" | "Hukum" | "Sumber" | "Mazhab" | "Institusi" | "Artikkel";
  label: string;
  description: string;
  // properties added for D3 force layout
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface KnowledgeLink {
  source: string | KnowledgeNode;
  target: string | KnowledgeNode;
  relation: string;
}

export interface SourceWebsite {
  id: number;
  title: string;
  url: string;
  category: "website - internal" | "articles - internal" | "website";
  description: string;
  role: string;
}

export interface PresetQuestion {
  question: string;
  category: string;
  shortLabel: string;
}

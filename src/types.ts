export type AppTab = "chat" | "graph" | "sources" | "analytics" | "review";

export type FeedbackRating = "up" | "down";
export type FeedbackReviewStatus = "new" | "reviewing" | "resolved";
export type FeedbackPipelineStatus = "none" | "queued" | "drafted" | "applied";

export interface ChatMessage {
  id: string;
  role: "user" | "model" | "system";
  content: string;
  timestamp: Date;
  citations?: {
    title: string;
    url: string;
  }[];
  relevantGraph?: {
    nodes: KnowledgeNode[];
    links: KnowledgeLink[];
  };
  responseId?: string;
  prompt?: string;
  feedback?: "up" | "down";
  feedbackStatus?: "idle" | "saving" | "saved" | "error";
}

export interface KnowledgeNode {
  id: string;
  type: "Konsep" | "Hukum" | "Sumber" | "Mazhab" | "Institusi" | "Artikkel" | "Entity";
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

export interface PersistedAppState {
  activeTab?: AppTab;
  graphSubTab?: "visualize" | "ingest";
  isAgentInfoOpen?: boolean;
  selectedNodeId?: string | null;
  userInput?: string;
  chatMessages?: ChatMessage[];
}

export interface FeedbackRecord {
  id: string;
  sessionId: string;
  messageId: string;
  rating: FeedbackRating;
  question: string;
  answer: string;
  comment: string;
  citations: {
    title: string;
    url: string;
  }[];
  reviewStatus: FeedbackReviewStatus;
  reviewerNote: string;
  pipelineStatus: FeedbackPipelineStatus;
  improvementPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackAnalytics {
  total: number;
  thumbsUp: number;
  thumbsDown: number;
  downRate: number;
  newItems: number;
  queuedImprovements: number;
  draftedImprovements: number;
}

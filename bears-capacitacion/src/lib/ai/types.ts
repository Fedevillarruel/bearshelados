export type KnowledgeCategory = "general" | "faq" | "horarios" | "eventos" | "talleres" | "cumpleanos" | "productos";
export type BotSettings = {
  name: string;
  personality: string;
  tone: "cercano" | "profesional" | "entusiasta";
  emojiLevel: "ninguno" | "moderado" | "frecuente";
  instructions: string;
  salesUrl: string;
  handoffMessage: string;
  enabled: boolean;
};
export type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  franchiseId: string | null;
  url: string;
  enabled: boolean;
  validFrom: string | null;
  validUntil: string | null;
};
export type BotMessage = {
  id: string;
  role: "user" | "assistant" | "human";
  content: string;
  created_at: string;
  status: "received" | "pending" | "sent" | "failed";
};
export type Conversation = {
  id: string;
  channel: "instagram" | "messenger";
  participant_id: string;
  status: "bot" | "human";
  updated_at: string;
};
export type SocialAsset = {
  id: string;
  kind: string;
  text: string;
  url: string | null;
  occurred_at: string;
};
export type AIWorkspaceData = {
  settings: BotSettings;
  knowledge: KnowledgeEntry[];
  franchises: { id: string; name: string }[];
  connection: { pageName: string; pageId: string; instagramId: string | null; connectedAt: string } | null;
  readiness: { openai: boolean; meta: boolean };
  conversations: Conversation[];
  assets: SocialAsset[];
  metrics: {
    conversations: number;
    incoming: number;
    replies: number;
    handoffs: number;
    failed: number;
    daily: { date: string; incoming: number; replies: number }[];
    topics: { topic: string; count: number }[];
  };
  period: number;
};
export const defaultBotSettings: BotSettings = {
  name: "Bears",
  personality: "Sos el asistente de Bears Helados: cálido, atento y claro. Ayudás a elegir y orientás sin presionar.",
  tone: "cercano",
  emojiLevel: "moderado",
  instructions: "",
  salesUrl: "",
  handoffMessage: "Voy a derivar tu consulta al equipo de Bears para que pueda ayudarte.",
  enabled: false,
};

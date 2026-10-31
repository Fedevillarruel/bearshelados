import { z } from "zod";

const safeUrl = z.union([z.literal(""), z.string().url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Usá un enlace HTTPS público sin credenciales.")]);
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  personality: z.string().trim().min(1).max(3000),
  tone: z.enum(["cercano", "profesional", "entusiasta"]),
  emojiLevel: z.enum(["ninguno", "moderado", "frecuente"]),
  instructions: z.string().max(6000),
  salesUrl: safeUrl,
  handoffMessage: z.string().trim().min(1).max(1000),
  enabled: z.boolean(),
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}).nullable();
export const knowledgeSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(["general", "faq", "horarios", "eventos", "talleres", "cumpleanos", "productos"]),
  franchiseId: z.string().uuid().nullable(),
  url: safeUrl,
  enabled: z.boolean(),
  validFrom: date,
  validUntil: date,
}).strict().refine((entry) => !entry.validFrom || !entry.validUntil || entry.validUntil >= entry.validFrom, "La fecha final debe ser posterior a la inicial.");
export const historySchema = z.array(z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
}).strict()).max(20);

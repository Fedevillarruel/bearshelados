import { z } from "zod";

const id = z.string().max(200);
const attachment = z.object({
  type: z.string(),
  payload: z.object({ url: z.string().optional() }).passthrough().optional(),
}).passthrough();
export const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id, time: z.number().optional(),
    messaging: z.array(z.object({
      sender: z.object({ id }), recipient: z.object({ id }),
      timestamp: z.number().optional(),
      message: z.object({
        mid: id.optional(), text: z.string().max(20_000).optional(),
        is_echo: z.boolean().optional(), is_deleted: z.boolean().optional(),
        is_self: z.boolean().optional(),
        attachments: z.array(attachment).max(20).optional(),
      }).passthrough().optional(),
    }).passthrough()).max(100).optional(),
    changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })).max(100).optional(),
  }).passthrough()).max(100),
}).passthrough();
export function incomingText(message: { text?: string; attachments?: { type: string }[] }) {
  const attachmentTypes = message.attachments?.map((item) => item.type) ?? [];
  const suffix = attachmentTypes.length ? `\n[Adjunto recibido: ${attachmentTypes.join(", ")}. Requiere revisión humana; no se analizó su contenido.]` : "";
  return (message.text ?? "").slice(0, 4000) + suffix;
}
export function safeSocialUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

import { timingSafeEqual } from "node:crypto";
import { aiFailure, aiJson } from "@/lib/ai/http";
import { processAIJobs } from "@/lib/ai/worker";

export const runtime = "nodejs";
export const maxDuration = 240;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (!expected || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return aiJson({ error: "No autorizado." }, 401);
  try { return aiJson(await processAIJobs()); } catch (error) { return aiFailure(error); }
}

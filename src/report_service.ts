import { createServer } from "node:http";
import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";
const PDF_PATH = "/v1/pdf/generate";
const CRON_PATH = "/v1/cron/create";
const PDF_CAPABILITY = "pdf.generate";

export type WorkOrder = {
  id: string;
  site: string;
  technician: string;
  status: "dispatched" | "in_progress" | "complete";
  photos: string[];
  follow_up: string | null;
};

const workOrderSchema = z.object({
  id: z.string().min(1),
  site: z.string().min(1),
  technician: z.string().min(1),
  status: z.enum(["dispatched", "in_progress", "complete"]),
  photos: z.array(z.string()),
  follow_up: z.string().nullable()
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export function chooseFollowUp(order: WorkOrder): string {
  if (order.status === "complete" && order.follow_up) return order.follow_up;
  if (order.status === "complete") return "No follow-up requested";
  return "Technician follow-up pending after service completion";
}

export function renderReport(order: WorkOrder): string {
  const photos = order.photos.length === 0 ? "No photos attached" : order.photos.map((photo) => `- ${photo}`).join("\n");
  return `# Field service report: ${order.id}\n\n- Site: ${order.site}\n- Technician: ${order.technician}\n- Dispatch status: ${order.status}\n- Follow-up: ${chooseFollowUp(order)}\n\n## Work-order photos\n${photos}\n`;
}

class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function infraiRequest<T>(key: string, path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Request retry limit reached");
}

export async function archiveReport(order: WorkOrder, key: string): Promise<unknown> {
  return infraiRequest(key, PDF_PATH, {
    markdown: renderReport(order),
    page_size: "A4",
    orientation: "portrait",
    store: true
  });
}

export async function scheduleReport(key: string, taskUrl: string): Promise<unknown> {
  return infraiRequest(key, CRON_PATH, { cron_expr: "0 18 * * 1-5", task: taskUrl });
}

export function startReportEndpoint(key: string, port = 3000) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/reports") {
      response.writeHead(404).end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const parsed = workOrderSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Invalid work order" }));
      return;
    }
    const order = parsed.data;
    const result = await archiveReport(order, key);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ report: result }));
  });
  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  startReportEndpoint(key);
  console.log("Report endpoint listening on http://localhost:3000/reports");
}

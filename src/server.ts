import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "./agent.js";
import { executeTool, toolDefinitions } from "./tool/index.js";

const port = Number(process.env.PORT ?? 3789);
const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public/index.html");
const sessions = new Map<string, Anthropic.MessageParam[]>();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
    });
    response.end(payload);
}

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1_000_000) {
                reject(new Error("请求体过大"));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        request.on("error", reject);
    });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
    const raw = await readBody(request);
    if (!raw) return {};
    return JSON.parse(raw) as unknown;
}

function toolCatalog() {
    return toolDefinitions.map((tool, index) => ({
        index: index + 1,
        name: tool.name,
        description: tool.description ?? "",
        input_schema: tool.input_schema,
    }));
}

function sessionFor(sessionId: string): Anthropic.MessageParam[] {
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const created: Anthropic.MessageParam[] = [];
    sessions.set(sessionId, created);
    return created;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/") {
        const html = await readFile(pagePath, "utf8");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
        return;
    }

    if (request.method === "GET" && url.pathname === "/api/tools") {
        sendJson(response, 200, { tools: toolCatalog() });
        return;
    }

    if (request.method === "POST" && url.pathname === "/api/tools/query") {
        const body = (await readJson(request)) as { name?: string; input?: unknown };
        if (!body.name) {
            sendJson(response, 400, { error: "缺少工具名称" });
            return;
        }
        const result = await executeTool(body.name, body.input ?? {});
        sendJson(response, 200, { result });
        return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = (await readJson(request)) as { sessionId?: string; message?: string };
        const message = body.message?.trim() ?? "";
        if (!body.sessionId || !message) {
            sendJson(response, 400, { error: "缺少会话或消息" });
            return;
        }
        const events = await runTurn(sessionFor(body.sessionId), message);
        sendJson(response, 200, { events });
        return;
    }

    if (request.method === "POST" && url.pathname === "/api/session/reset") {
        const body = (await readJson(request)) as { sessionId?: string };
        if (body.sessionId) sessions.delete(body.sessionId);
        sendJson(response, 200, { ok: true });
        return;
    }

    sendJson(response, 404, { error: "找不到页面" });
}

const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        if (!response.headersSent) {
            sendJson(response, 500, { error: reason });
            return;
        }
        response.end();
    });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`问询台 http://127.0.0.1:${port}`);
});

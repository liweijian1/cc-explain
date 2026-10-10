import type Anthropic from "@anthropic-ai/sdk";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 1_000_000;
const MAX_TEXT = 8_000;
const MAX_REDIRECTS = 5;

export const webFetchToolDefinition: Anthropic.Tool = {
    name: "web_fetch",
    description: "访问指定的公网网页，提取标题、摘要和正文文本。只支持 http 和 https，不访问本机或内网地址。",
    input_schema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "网页地址，必须以 http:// 或 https:// 开头，例如 https://example.com",
            },
        },
        required: ["url"],
    },
};

function isPrivateIp(address: string): boolean {
    if (isIP(address) === 4) {
        const [a = -1, b = -1] = address.split(".").map(Number);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        return false;
    }

    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized) || /^fe[89ab][0-9a-f]:/.test(normalized)) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1] ?? "") : false;
}

async function assertPublicUrl(url: URL): Promise<void> {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("只支持 http 或 https 网页");
    }
    if (url.username || url.password) {
        throw new Error("地址里不能包含账号或密码");
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname === "metadata.google.internal"
    ) {
        throw new Error("不能访问本机或内网地址");
    }

    let addresses: string[];
    try {
        addresses = isIP(hostname)
            ? [hostname]
            : (await lookup(hostname, { all: true })).map((item) => item.address);
    } catch {
        throw new Error(`找不到主机: ${hostname}`);
    }
    if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address))) {
        throw new Error("不能访问本机或内网地址");
    }
}

function decodeEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(html: string): { title: string; description: string; text: string } {
    const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const description = decodeEntities(
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
            html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ??
            "",
    ).trim();
    const text = decodeEntities(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
            .replace(/<[^>]+>/g, " "),
    )
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    return { title, description, text };
}

async function readLimited(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_BYTES) {
            await reader.cancel();
            throw new Error("网页内容超过 1MB，已停止读取");
        }
        chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

async function fetchPublic(url: URL, hops = 0): Promise<{ response: Response; finalUrl: URL }> {
    await assertPublicUrl(url);
    const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: {
            Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
            "User-Agent": "cc-explain-web-fetch/1.0",
        },
    });

    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("重定向缺少目标地址");
        if (hops >= MAX_REDIRECTS) throw new Error("重定向次数过多");
        return fetchPublic(new URL(location, url), hops + 1);
    }

    return { response, finalUrl: url };
}

export async function webFetchTool(rawUrl: string): Promise<string> {
    let url: URL;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        throw new Error("网页地址无效");
    }

    const { response, finalUrl } = await fetchPublic(url);
    if (!response.ok) {
        throw new Error(`网页请求失败: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml\+xml|application\/xml|text\/xml/i.test(contentType)) {
        await response.body?.cancel();
        return [`网址: ${finalUrl.href}`, `类型: ${contentType || "未知"}`, "这个地址没有返回可阅读的文本页面。"].join("\n");
    }

    const body = await readLimited(response);
    const page = /html|xml/i.test(contentType) ? htmlToText(body) : { title: "", description: "", text: body.trim() };
    const clipped = page.text.length > MAX_TEXT;
    const text = clipped ? `${page.text.slice(0, MAX_TEXT)}…` : page.text;

    return [
        `网址: ${finalUrl.href}`,
        page.title ? `标题: ${page.title}` : "",
        page.description ? `摘要: ${page.description}` : "",
        text ? `正文:\n${text}` : "页面没有可读文本。",
        clipped ? "正文已截断。" : "",
    ]
        .filter((line) => line.length > 0)
        .join("\n");
}

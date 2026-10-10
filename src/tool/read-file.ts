import type Anthropic from "@anthropic-ai/sdk";
import { constants, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_FILE_BYTES = 256 * 1024;

const SENSITIVE_NAME =
    /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|\.git-credentials|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials(?:\.json)?|secrets?)$/i;
const SENSITIVE_EXT = /\.(?:pem|key|p12|pfx|kdbx|keystore)$/i;

export const readFileToolDefinition: Anthropic.Tool = {
    name: "read_file",
    description: "读取项目目录内的文本文件。路径必须是相对项目根目录的相对路径，不能使用绝对路径、..、符号链接绕过、.env 或密钥文件。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "相对项目根目录的文件路径，例如 README.md 或 src/index.ts",
            },
        },
        required: ["path"],
    },
};

export const createFileToolDefinition: Anthropic.Tool = {
    name: "create_file",
    description: "在项目目录内创建文本文件。路径必须是相对项目根目录的相对路径，不能使用绝对路径、..、符号链接绕过、.env 或密钥文件。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "相对项目根目录的文件路径",
            },
            content: {
                type: "string",
                description: "要写入的文本内容",
            },
        },
        required: ["path", "content"],
    },
};

type ToolLog = {
    tool: "read_file" | "create_file";
    path: string;
    ok: boolean;
    reason?: string;
    ms: number;
};

function logToolCall(entry: ToolLog): void {
    console.info(
        JSON.stringify({
            time: new Date().toISOString(),
            tool: entry.tool,
            path: entry.path,
            ok: entry.ok,
            reason: entry.reason,
            ms: entry.ms,
        }),
    );
}

function isInside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isSensitive(target: string): boolean {
    const base = path.basename(target);
    return SENSITIVE_NAME.test(base) || SENSITIVE_EXT.test(base);
}

function checkPathShape(filePath: string): string {
    if (typeof filePath !== "string" || filePath.trim() === "") {
        throw new Error("path 必须是非空字符串");
    }
    if (filePath.includes("\0")) {
        throw new Error("路径包含非法字符");
    }
    return filePath;
}

function checkPathBusiness(filePath: string, root: string): string {
    if (path.isAbsolute(filePath)) {
        throw new Error("不允许使用绝对路径");
    }
    if (filePath.split(/[\\/]+/).includes("..")) {
        throw new Error("路径不能包含 ..");
    }

    const resolved = path.resolve(root, filePath);
    if (!isInside(root, resolved)) {
        throw new Error("路径超出项目目录");
    }
    return resolved;
}

async function projectRoot(): Promise<string> {
    return await realpath(PROJECT_ROOT);
}

async function assertCanonicalInside(lexicalPath: string, root: string): Promise<string> {
    let canonical: string;
    try {
        canonical = await realpath(lexicalPath);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") throw new Error("文件不存在");
        if (code === "EACCES") throw new Error("没有访问该路径的权限");
        throw error;
    }
    if (!isInside(root, canonical)) {
        throw new Error("符号链接指向项目目录之外");
    }
    return canonical;
}

function assertNotSensitive(target: string): void {
    if (isSensitive(target)) {
        throw new Error("禁止访问密钥或凭据文件");
    }
}

async function readWithinLimit(canonical: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ELOOP") throw new Error("符号链接不能绕过目录限制");
        if (code === "EACCES") throw new Error("没有读取该文件的权限");
        throw error;
    }

    try {
        const stat = await handle.stat();
        if (!stat.isFile()) {
            throw new Error("只能读取文件");
        }
        if (stat.size > MAX_FILE_BYTES) {
            throw new Error(`文件超过 ${MAX_FILE_BYTES} 字节`);
        }
        if (stat.size === 0) return "";

        const buffer = Buffer.alloc(stat.size);
        await handle.read(buffer, 0, stat.size, 0);
        if (buffer.includes(0)) {
            throw new Error("不能读取二进制文件");
        }
        try {
            return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
            throw new Error("文件不是 UTF-8 文本");
        }
    } finally {
        await handle.close();
    }
}

async function resolveCreateTarget(lexicalPath: string, root: string): Promise<string> {
    const parent = path.dirname(lexicalPath);
    let parentReal: string;
    try {
        parentReal = await realpath(parent);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") throw new Error("上级目录不存在");
        if (code === "EACCES") throw new Error("没有访问该路径的权限");
        throw error;
    }
    if (parentReal !== root && !isInside(root, parentReal)) {
        throw new Error("符号链接指向项目目录之外");
    }

    const target = path.join(parentReal, path.basename(lexicalPath));
    if (!isInside(root, target)) {
        throw new Error("符号链接指向项目目录之外");
    }
    return target;
}

async function writeWithinRoot(target: string, content: string): Promise<void> {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) {
        throw new Error(`内容超过 ${MAX_FILE_BYTES} 字节`);
    }

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ELOOP") throw new Error("符号链接不能绕过目录限制");
        if (code === "EACCES") throw new Error("没有写入该文件的权限");
        throw error;
    }

    try {
        await handle.writeFile(content, "utf8");
    } finally {
        await handle.close();
    }
}

export async function readFileTool(filePath: string): Promise<string> {
    const started = Date.now();
    try {
        // JSON Schema：检查路径是非空字符串。
        const pathInput = checkPathShape(filePath);
        const root = await projectRoot();
        // 业务校验：只接受项目内的相对路径，拒绝绝对路径和 ..。
        const lexicalPath = checkPathBusiness(pathInput, root);
        // 风险审批：密钥和凭据文件直接拒绝。
        assertNotSensitive(lexicalPath);
        // 权限校验：符号链接的真实位置仍须在项目内。
        const canonical = await assertCanonicalInside(lexicalPath, root);
        assertNotSensitive(canonical);
        // 隔离执行：不跟随最后一层符号链接，并限制大小与编码。
        const content = await readWithinLimit(canonical);
        logToolCall({ tool: "read_file", path: pathInput, ok: true, ms: Date.now() - started });
        return content;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logToolCall({ tool: "read_file", path: String(filePath), ok: false, reason, ms: Date.now() - started });
        throw error;
    }
}

export async function createFileTool(filePath: string, content: string): Promise<void> {
    const started = Date.now();
    try {
        if (typeof content !== "string") {
            throw new Error("content 必须是字符串");
        }
        const pathInput = checkPathShape(filePath);
        const root = await projectRoot();
        const lexicalPath = checkPathBusiness(pathInput, root);
        assertNotSensitive(lexicalPath);
        const target = await resolveCreateTarget(lexicalPath, root);
        assertNotSensitive(target);
        await writeWithinRoot(target, content);
        logToolCall({ tool: "create_file", path: pathInput, ok: true, ms: Date.now() - started });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logToolCall({ tool: "create_file", path: String(filePath), ok: false, reason, ms: Date.now() - started });
        throw error;
    }
}

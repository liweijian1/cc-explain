import type Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const readFileToolDefinition: Anthropic.Tool = {
    name: "read_file",
    description: "读取指定路径的文件内容。路径可以是相对当前工作目录的相对路径，或绝对路径。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "要读取的文件路径",
            },
        },
        required: ["path"],
    },
};

export async function readFileTool(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    return await readFile(resolved, "utf8");
}

export const createFileToolDefinition: Anthropic.Tool = {
    name: "create_file",
    description: "创建指定路径的文件。路径可以是相对当前工作目录的相对路径，或绝对路径。",
    input_schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "要创建的文件路径",
            },
            content: {
                type: "string",
                description: "要创建的文件内容",
            },
        },
        required: ["path", "content"],
    },
};

export async function createFileTool(filePath: string, content: string): Promise<void> {
    const resolved = path.resolve(filePath);
    await writeFile(resolved, content, "utf8");
}

import type Anthropic from "@anthropic-ai/sdk";
import { getCurrentTimeTool, getCurrentTimeToolDefinition } from "./get-current-time.js";
import { getWeatherTool, getWeatherToolDefinition } from "./get-weather.js";
import { readFileTool, readFileToolDefinition, createFileTool, createFileToolDefinition } from "./read-file.js";
import { webFetchTool, webFetchToolDefinition } from "./web-fetch.js";

export const toolDefinitions: Anthropic.Tool[] = [
    readFileToolDefinition,
    createFileToolDefinition,
    getWeatherToolDefinition,
    getCurrentTimeToolDefinition,
    webFetchToolDefinition,
];

export async function executeTool(name: string, input: unknown): Promise<string> {
    switch (name) {
        case "read_file": {
            const filePath = (input as { path?: string }).path;
            if (!filePath) {
                throw new Error("缺少 path 参数");
            }
            return await readFileTool(filePath);
        }
        case "create_file": {
            const { path: filePath, content } = input as { path?: string; content?: string };
            if (!filePath) {
                throw new Error("缺少 path 参数");
            }
            if (content === undefined) {
                throw new Error("缺少 content 参数");
            }
            await createFileTool(filePath, content);
            return `已创建文件: ${filePath}`;
        }
        case "get_weather": {
            const city = (input as { city?: string }).city;
            if (!city) {
                throw new Error("缺少 city 参数");
            }
            return await getWeatherTool(city);
        }
        case "get_current_time": {
            const city = (input as { city?: string }).city;
            if (!city) {
                throw new Error("缺少 city 参数");
            }
            return await getCurrentTimeTool(city);
        }
        case "web_fetch": {
            const url = (input as { url?: string }).url;
            if (!url) {
                throw new Error("缺少 url 参数");
            }
            return await webFetchTool(url);
        }
        default:
            throw new Error(`未知工具: ${name}`);
    }
}

export { getCurrentTimeTool, getWeatherTool, readFileTool, createFileTool, webFetchTool };

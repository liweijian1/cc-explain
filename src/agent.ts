import Anthropic from "@anthropic-ai/sdk";
import { executeTool, toolDefinitions } from "./tool/index.js";
import { modelConfig } from "./config.js";

const MAX_TOOL_ROUNDS = 8;

const client = new Anthropic({
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseURL,
});

export type TurnEvent =
    | { type: "text"; text: string }
    | { type: "tool_call"; name: string; input: unknown }
    | { type: "tool_result"; name: string; result: string }
    | { type: "tool_error"; name: string; message: string }
    | { type: "notice"; message: string };

function assistantText(content: Anthropic.ContentBlock[]): string {
    return content
        .filter((item): item is Anthropic.TextBlock => item.type === "text")
        .map((item) => item.text.trim())
        .filter((text) => text.length > 0)
        .join("\n");
}

async function executeToolCalls(
    toolUses: Anthropic.ToolUseBlock[],
    events: TurnEvent[],
): Promise<Anthropic.ToolResultBlockParam[]> {
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
        events.push({ type: "tool_call", name: toolUse.name, input: toolUse.input });
        try {
            const result = await executeTool(toolUse.name, toolUse.input);
            events.push({ type: "tool_result", name: toolUse.name, result });
            toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: result,
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            events.push({ type: "tool_error", name: toolUse.name, message: reason });
            toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: reason,
                is_error: true,
            });
        }
    }
    return toolResults;
}

async function requestModel(messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    return await client.messages.create({
        model: modelConfig.model,
        max_tokens: modelConfig.maxTokens,
        messages,
        tools: toolDefinitions,
        cache_control: {
            type: "ephemeral",
        },
    });
}

export async function runTurn(
    messages: Anthropic.MessageParam[],
    userMessage: string,
): Promise<TurnEvent[]> {
    const checkpoint = messages.length;
    const events: TurnEvent[] = [];
    messages.push({ role: "user", content: userMessage });

    try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const response = await requestModel(messages);
            messages.push({ role: "assistant", content: response.content });

            const text = assistantText(response.content);
            if (text) {
                events.push({ type: "text", text });
            }

            const toolUses = response.content.filter(
                (item): item is Anthropic.ToolUseBlock => item.type === "tool_use",
            );
            if (toolUses.length === 0) return events;

            if (round === MAX_TOOL_ROUNDS - 1) {
                events.push({ type: "notice", message: "已达到工具调用次数上限" });
                messages.splice(checkpoint);
                return events;
            }

            const toolResults = await executeToolCalls(toolUses, events);
            messages.push({ role: "user", content: toolResults });
        }
    } catch (error) {
        messages.splice(checkpoint);
        const reason = error instanceof Error ? error.message : String(error);
        events.push({ type: "notice", message: `调用模型失败: ${reason}` });
    }

    return events;
}

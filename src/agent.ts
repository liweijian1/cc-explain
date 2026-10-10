import Anthropic from "@anthropic-ai/sdk";
import { executeTool, toolDefinitions } from "./tool/index.js";
import { modelConfig } from "./config.js";

// 一轮用户提问里，模型可能连续调用工具。设上限，避免死循环和费用失控。
const MAX_TOOL_ROUNDS = 8;

const client = new Anthropic({
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseURL,
});

// 给界面和终端看的事件。messages 里仍保存模型要求的原始内容块。
export type TurnEvent =
    | { type: "text"; text: string }
    | { type: "tool_call"; name: string; input: unknown }
    | { type: "tool_result"; name: string; result: string }
    | { type: "tool_error"; name: string; message: string }
    | { type: "notice"; message: string };

// 一次回复里可能有多段文字，也可能只有 tool_use、没有文字。
function assistantText(content: Anthropic.ContentBlock[]): string {
    return content
        .filter((item): item is Anthropic.TextBlock => item.type === "text")
        .map((item) => item.text.trim())
        .filter((text) => text.length > 0)
        .join("\n");
}

// 执行本轮全部工具。失败也要返回 tool_result，并用同一个 tool_use_id 对应回去。
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
            // is_error 让模型知道这次调用失败，由它向用户解释，而不是中断整轮对话。
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

// 只负责请求模型。工具定义放在这里，模型才能决定要不要调用。
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

// 处理一条用户消息：请求模型，执行工具，再把结果发回去，直到模型给出不含工具调用的回复。
export async function runTurn(
    messages: Anthropic.MessageParam[],
    userMessage: string,
): Promise<TurnEvent[]> {
    // 失败或达到上限时，从这里把本轮追加的消息全部删掉，避免历史里留下半轮对话。
    const checkpoint = messages.length;
    const events: TurnEvent[] = [];
    messages.push({ role: "user", content: userMessage });

    try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const response = await requestModel(messages);
            // 必须保存完整 content。里面的 tool_use 要和后面的 tool_result 成对出现。
            messages.push({ role: "assistant", content: response.content });

            const text = assistantText(response.content);
            if (text) {
                events.push({ type: "text", text });
            }

            const toolUses = response.content.filter(
                (item): item is Anthropic.ToolUseBlock => item.type === "tool_use",
            );
            // 没有工具调用，这段文字就是本轮最终回答。
            if (toolUses.length === 0) return events;

            if (round === MAX_TOOL_ROUNDS - 1) {
                events.push({ type: "notice", message: "已达到工具调用次数上限" });
                messages.splice(checkpoint);
                return events;
            }

            const toolResults = await executeToolCalls(toolUses, events);
            // 工具结果属于 user 消息，下一轮请求会连同之前的历史一起发给模型。
            messages.push({ role: "user", content: toolResults });
        }
    } catch (error) {
        messages.splice(checkpoint);
        const reason = error instanceof Error ? error.message : String(error);
        events.push({ type: "notice", message: `调用模型失败: ${reason}` });
    }

    return events;
}

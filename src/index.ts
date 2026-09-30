import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { executeTool, toolDefinitions } from "./tools.js";
import { modelConfig } from "./config.js";

const client = new Anthropic({
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseURL,
});

function printToolCall(name: string, input: unknown): void {
    console.log(`调用工具 ${name}`, input);
}

function printToolResult(name: string, result: string): void {
    console.log(`工具 ${name} 结果`, result);
}

async function chatOnce(
    messages: Anthropic.MessageParam[],
    userMessage: string,
): Promise<void> {
    // 将用户消息添加到消息列表中
    messages.push({ role: "user", content: userMessage });

    try {
        const response = await client.messages.create({
            model: modelConfig.model,
            max_tokens: modelConfig.maxTokens,
            messages,
            tools: toolDefinitions,
        });
        const text = response.content.find((item) => item.type === "text")?.text ?? "";
        console.log("text", response.usage);
        console.log("response", text);
        // 将 AI 回复添加到消息列表中
        messages.push({ role: "assistant", content: response.content });
        const toolUses = response.content.filter(
            (item): item is Anthropic.ToolUseBlock => item.type === "tool_use",
        );
        if (toolUses.length === 0) return;
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
            printToolCall(toolUse.name, toolUse.input);
            try {
                const result = await executeTool(toolUse.name, toolUse.input);
                printToolResult(toolUse.name, result);
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: result,
                });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.error(`工具 ${toolUse.name} 执行失败: ${reason}`);
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: reason,
                    is_error: true,
                });
            }
        } 
        messages.push({ role: "user", content: toolResults })
    } catch (error) {
        messages.pop();
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`调用模型失败: ${reason}`);
    }
}

async function startChat(): Promise<void> {
    // 绑定终端输入输出，用来逐行读取用户输入
    const rl = readline.createInterface({ input, output });
    // 整段对话共用这份历史；API 不记上下文，下一轮要把之前的消息一起发出去
    const messages: Anthropic.MessageParam[] = [];

    try {
        while (true) {
            const userMessage = (await rl.question("你: ")).trim();
            if (userMessage === "") {
                continue;
            }
            if (userMessage === "exit" || userMessage === "quit") {
                break;
            }
            console.log("messages", messages);
            // 输出 AI 回复
            process.stdout.write("AI: ");
            // 始终传入同一个 messages，chatOnce 会把本轮问答追加进去
            await chatOnce(messages, userMessage);
        }
    } finally {
        // 无论正常退出还是中途报错，都关掉 readline，避免进程挂住
        rl.close();
    }
}

try {
    await startChat();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}

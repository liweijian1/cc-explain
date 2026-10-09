import type Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runTurn, type TurnEvent } from "./agent.js";

function printEvent(event: TurnEvent): void {
    switch (event.type) {
        case "text":
            console.log(`AI: ${event.text}`);
            return;
        case "tool_call":
            console.log(`调用工具 ${event.name}`, event.input);
            return;
        case "tool_result":
            console.log(`工具 ${event.name} 结果`, event.result);
            return;
        case "tool_error":
            console.error(`工具 ${event.name} 执行失败: ${event.message}`);
            return;
        case "notice":
            console.error(event.message);
            return;
    }
}

async function startChat(): Promise<void> {
    const rl = readline.createInterface({ input, output });
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
            const events = await runTurn(messages, userMessage);
            for (const event of events) {
                printEvent(event);
            }
        }
    } finally {
        rl.close();
    }
}

try {
    await startChat();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}

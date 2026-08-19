import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const client = new Anthropic();

async function chatOnce(
    messages: Anthropic.MessageParam[],
    userMessage: string,
): Promise<void> {
    messages.push({ role: "user", content: userMessage });

    try {
        const response = await client.messages.create({
            model: "MiniMax-M3",
            max_tokens: 1000,
            messages,
        });
        const text = response.content.find((item) => item.type === "text")?.text ?? "";
        console.log(text);
        messages.push({ role: "assistant", content: response.content });
    } catch (error) {
        messages.pop();
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`调用模型失败: ${reason}`);
    }
}

async function startChat(): Promise<void> {
    const rl = readline.createInterface({ input, output });
    const messages: Anthropic.MessageParam[] = [];

    console.log("进入对话模式。输入 exit 或 quit 退出。\n");

    try {
        while (true) {
            const userMessage = (await rl.question("你: ")).trim();
            if (userMessage === "") {
                continue;
            }
            if (userMessage === "exit" || userMessage === "quit") {
                break;
            }

            process.stdout.write("AI: ");
            await chatOnce(messages, userMessage);
            console.log();
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

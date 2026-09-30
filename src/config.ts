export const modelConfig = {
    model: process.env.ANTHROPIC_MODEL ?? "MiniMax-M3",
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 1000),
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
};

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.9,
    });
    return response.choices[0]?.message?.content || "...";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OpenAI Error]", msg);
    return `[Error: ${msg}]`;
  }
}

export async function chatWithHistory(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 500,
      temperature: 0.9,
    });
    return response.choices[0]?.message?.content || "...";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OpenAI Error]", msg);
    return `[Error: ${msg}]`;
  }
}

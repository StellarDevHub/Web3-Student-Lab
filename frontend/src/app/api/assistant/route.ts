import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { code, errorLog } = await req.json();

  if (!code && !errorLog) {
    return NextResponse.json({ error: "code or errorLog required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const systemPrompt = `You are an expert Rust and Soroban smart contract tutor.
A student will provide their contract code and compiler error output.
Respond with:
1. A plain-English explanation of what caused each error.
2. A corrected code snippet showing exactly what to change (use a code block).
Keep your response concise and educational.`;

  const userPrompt = `## Student Code\n\`\`\`rust\n${code}\n\`\`\`\n\n## Compiler Errors\n\`\`\`\n${errorLog}\n\`\`\``;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: err }, { status: response.status });
  }

  const data = await response.json();
  const suggestion = data.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ suggestion });
}

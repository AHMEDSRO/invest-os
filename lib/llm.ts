// طبقة تجريد للـ LLM — التبديل بمتغير بيئة واحد: LLM_PROVIDER
// gemini (افتراضي، مجاني) | groq | openrouter

export type LlmMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function chatCompletion(
  system: string,
  messages: LlmMessage[]
): Promise<string> {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

  switch (provider) {
    case 'groq':
      return openAICompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        process.env.GROQ_API_KEY!,
        process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        system,
        messages
      );
    case 'openrouter':
      return openAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        process.env.OPENROUTER_API_KEY!,
        process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free',
        system,
        messages
      );
    case 'gemini':
    default:
      return gemini(system, messages);
  }
}

async function gemini(
  system: string,
  messages: LlmMessage[]
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY غير موجود في .env.local');

  // gemini-2.0-flash اتقاعد من الـ free tier — flash-latest بيشاور على الأحدث دايمًا
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || '')
    .join('');
  if (!text) throw new Error('رد فاضي من Gemini');
  return text;
}

async function openAICompatible(
  url: string,
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[]
): Promise<string> {
  if (!apiKey) throw new Error('مفتاح الـ API للمزوّد المختار غير موجود');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('رد فاضي من المزوّد');
  return text;
}

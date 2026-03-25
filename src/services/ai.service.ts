export interface ParsedTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  assigneeNames: string[];
}

const SYSTEM_PROMPT = `You are a task parser. Extract structured task information from the user's voice transcript.
Return a JSON object with these fields:
- title: concise task title (string)
- description: detailed description if any (string)
- priority: one of "LOW", "MEDIUM", "HIGH", "URGENT" (default "MEDIUM" if not mentioned)
- dueDate: ISO 8601 date string or null (interpret relative dates like "tomorrow", "next week" based on current date)
- assigneeNames: array of person names mentioned to assign the task to (empty array if none)

Only return valid JSON. No explanation or markdown.`;

export async function parseTranscript(transcript: string): Promise<ParsedTask> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const today = new Date().toISOString().split('T')[0];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Today is ${today}. Transcript: "${transcript}"` },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as ParsedTask;
}

const CHAT_SYSTEM_PROMPT = `You are a friendly, witty AI assistant. You can chat about anything — technology, science, jokes, philosophy, life advice. Keep responses concise (2-3 sentences max unless asked for more). You support any language the user writes in. Be fun and engaging!`;

export async function chatWithAI(message: string, conversationHistory: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: CHAT_SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return content;
}

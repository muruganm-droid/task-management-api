import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  const today = new Date().toISOString().split('T')[0];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Today is ${today}. Transcript: "${transcript}"` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI');
  }

  return JSON.parse(content) as ParsedTask;
}

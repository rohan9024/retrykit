import { wrapOpenAI } from '@rohan9024/retrykit/auto';
import OpenAI from 'openai';

const client = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }), { maxRetries: 2, totalDeadlineMs: 25_000 });

export async function POST(request: Request) {
  const body = await request.json() as { model: string; messages: unknown[] };
  const result = await client.chat.completions.create(body as any);
  return Response.json(result);
}

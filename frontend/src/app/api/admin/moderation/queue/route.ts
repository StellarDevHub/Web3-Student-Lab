import { readFile } from 'fs/promises';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'frontend', 'data', 'moderation-queue.json');

function analyzeText(text: string) {
  const toxicWords = ['idiot','stupid','hate','damn','terrible'];
  const positive = ['good','great','excellent','well','nice'];
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  const toxicityMatches = tokens.filter(t => toxicWords.includes(t));
  const positiveMatches = tokens.filter(t => positive.includes(t));
  const toxicityScore = Math.min(1, toxicityMatches.length / 3);
  const sentimentScore = (positiveMatches.length - toxicityMatches.length) / Math.max(1, tokens.length);
  return { toxicity: toxicityMatches.length>0, toxicityScore, sentimentScore };
}

export async function GET() {
  const raw = await readFile(DATA_PATH, 'utf-8');
  const json = JSON.parse(raw);
  const enriched = json.reviews.map((r: any) => ({
    ...r,
    analysis: analyzeText(r.comments)
  }));
  return new Response(JSON.stringify(enriched), { status: 200 });
}

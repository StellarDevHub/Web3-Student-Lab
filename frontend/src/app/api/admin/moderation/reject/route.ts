import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const QUEUE = path.join(process.cwd(), 'frontend', 'data', 'moderation-queue.json');
const AUDIT = path.join(process.cwd(), 'frontend', 'data', 'moderation-audit.json');

export async function POST(req: Request) {
  const body = await req.json();
  const { id, feedback } = body;
  const raw = await readFile(QUEUE, 'utf-8');
  const json = JSON.parse(raw);
  const rev = json.reviews.find((r:any) => r.id === id);
  if (!rev) return new Response(JSON.stringify({error:'not found'}), { status: 404 });
  rev.status = 'rejected';
  await writeFile(QUEUE, JSON.stringify(json, null, 2), 'utf-8');

  const aRaw = await readFile(AUDIT, 'utf-8');
  const aJson = JSON.parse(aRaw);
  aJson.audit.push({ action: 'reject', id, feedback: feedback||null, by: 'moderator', ts: new Date().toISOString() });
  await writeFile(AUDIT, JSON.stringify(aJson, null, 2), 'utf-8');

  return new Response(JSON.stringify({ok:true}), { status: 200 });
}

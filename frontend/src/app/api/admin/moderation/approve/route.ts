import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const QUEUE = path.join(process.cwd(), 'frontend', 'data', 'moderation-queue.json');
const AUDIT = path.join(process.cwd(), 'frontend', 'data', 'moderation-audit.json');
const WEIGHTS = path.join(process.cwd(), 'frontend', 'data', 'moderation-weights.json');
const SCORES = path.join(process.cwd(), 'frontend', 'data', 'student-scores.json');

async function recalcScores() {
  const qraw = await readFile(QUEUE, 'utf-8');
  const wraw = await readFile(WEIGHTS, 'utf-8');
  const q = JSON.parse(qraw);
  const weights = JSON.parse(wraw).weights || {};
  const bySubmission: Record<string, any[]> = {};
  for (const r of q.reviews) {
    if (r.status !== 'approved') continue;
    bySubmission[r.submissionId] = bySubmission[r.submissionId] || [];
    bySubmission[r.submissionId].push(r);
  }
  const scores: Record<string, number> = {};
  for (const sid of Object.keys(bySubmission)) {
    const reviews = bySubmission[sid];
    let num = 0; let den = 0;
    for (const rv of reviews) {
      const w = weights[rv.reviewerId] ?? 1;
      num += rv.score * w;
      den += w;
    }
    scores[sid] = den ? Math.round((num / den) * 100) / 100 : 0;
  }
  await writeFile(SCORES, JSON.stringify({scores}, null, 2), 'utf-8');
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, override=false, feedback } = body;
  const raw = await readFile(QUEUE, 'utf-8');
  const json = JSON.parse(raw);
  const rev = json.reviews.find((r:any) => r.id === id);
  if (!rev) return new Response(JSON.stringify({error:'not found'}), { status: 404 });
  rev.status = 'approved';
  if (override) rev.override = true;
  await writeFile(QUEUE, JSON.stringify(json, null, 2), 'utf-8');

  // audit
  const aRaw = await readFile(AUDIT, 'utf-8');
  const aJson = JSON.parse(aRaw);
  aJson.audit.push({ action: 'approve', id, override, feedback: feedback||null, by: 'moderator', ts: new Date().toISOString() });
  await writeFile(AUDIT, JSON.stringify(aJson, null, 2), 'utf-8');

  // recalc scores in real-time
  await recalcScores();

  // simulate feedback notification as audit entry
  if (feedback) {
    aJson.audit.push({ action: 'notify', id, message: feedback, ts: new Date().toISOString() });
    await writeFile(AUDIT, JSON.stringify(aJson, null, 2), 'utf-8');
  }

  return new Response(JSON.stringify({ok:true}), { status: 200 });
}

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const QUEUE = path.join(process.cwd(), 'frontend', 'data', 'moderation-queue.json');
const WEIGHTS = path.join(process.cwd(), 'frontend', 'data', 'moderation-weights.json');
const SCORES = path.join(process.cwd(), 'frontend', 'data', 'student-scores.json');
const AUDIT = path.join(process.cwd(), 'frontend', 'data', 'moderation-audit.json');

function mean(arr:number[]){return arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length)}
function std(arr:number[]){const m=mean(arr);return Math.sqrt(mean(arr.map(x=>Math.pow(x-m,2))));}

export async function POST() {
  const qraw = await readFile(QUEUE, 'utf-8');
  const wraw = await readFile(WEIGHTS, 'utf-8');
  const q = JSON.parse(qraw);
  const weightsJson = JSON.parse(wraw);
  const weights: Record<string, number> = weightsJson.weights || {};

  // compute baseline aggregated scores per submission
  const bySubmission: Record<string, any[]> = {};
  for (const r of q.reviews) {
    if (r.status !== 'approved') continue;
    bySubmission[r.submissionId] = bySubmission[r.submissionId] || [];
    bySubmission[r.submissionId].push(r);
  }
  const aggScores: Record<string, number> = {};
  for (const sid of Object.keys(bySubmission)) {
    const reviews = bySubmission[sid];
    let num=0, den=0;
    for (const rv of reviews) {
      const w = weights[rv.reviewerId] ?? 1;
      num += rv.score * w; den += w;
    }
    aggScores[sid] = den ? num/den : 0;
  }

  // compute reviewer biases
  const reviewerScores: Record<string, number[]> = {};
  for (const r of q.reviews) {
    if (r.status !== 'approved') continue;
    const target = aggScores[r.submissionId] ?? r.score;
    reviewerScores[r.reviewerId] = reviewerScores[r.reviewerId] || [];
    reviewerScores[r.reviewerId].push(r.score - target);
  }

  // adjust weights for outliers
  const deltas = Object.values(reviewerScores).map(arr=>mean(arr));
  const globalStd = std(deltas.length ? deltas : [0]);
  for (const reviewer of Object.keys(reviewerScores)) {
    const avgBias = mean(reviewerScores[reviewer]);
    const z = globalStd ? Math.abs(avgBias) / globalStd : 0;
    // if reviewer is an outlier, downweight
    weights[reviewer] = z > 1.5 ? 0.5 : 1.0;
  }

  // write updated weights
  await writeFile(WEIGHTS, JSON.stringify({weights}, null, 2), 'utf-8');

  // recompute final student scores
  const scores: Record<string, number> = {};
  for (const sid of Object.keys(bySubmission)) {
    const reviews = bySubmission[sid];
    let num=0, den=0;
    for (const rv of reviews) {
      const w = weights[rv.reviewerId] ?? 1;
      num += rv.score * w; den += w;
    }
    scores[sid] = den ? Math.round((num/den)*100)/100 : 0;
  }
  await writeFile(SCORES, JSON.stringify({scores}, null, 2), 'utf-8');

  // audit
  const aRaw = await readFile(AUDIT, 'utf-8');
  const aJson = JSON.parse(aRaw);
  aJson.audit.push({ action: 'calibrate', by: 'system', ts: new Date().toISOString(), weights });
  await writeFile(AUDIT, JSON.stringify(aJson, null, 2), 'utf-8');

  return new Response(JSON.stringify({ok:true, weights, scores}), { status: 200 });
}

import { readFile } from 'fs/promises';
import path from 'path';

const AUDIT = path.join(process.cwd(), 'frontend', 'data', 'moderation-audit.json');

export async function GET() {
  const raw = await readFile(AUDIT, 'utf-8');
  const json = JSON.parse(raw);
  // convert to CSV
  const rows = ['action,id,by,ts,details'];
  for (const a of json.audit) {
    const details = JSON.stringify(a, Object.keys(a).filter(k=>!['action','id','by','ts'].includes(k)));
    rows.push(`${a.action || ''},${a.id || ''},${a.by || ''},${a.ts || ''},"${details.replace(/"/g,'""')}"`);
  }
  const csv = rows.join('\n');
  return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } });
}

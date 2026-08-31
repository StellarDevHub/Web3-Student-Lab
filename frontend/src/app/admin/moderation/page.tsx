"use client";
import { useEffect, useState } from 'react';

type Review = any;

export default function ModerationPage(){
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filterFlagged, setFilterFlagged] = useState(false);

  async function load(){
    const res = await fetch('/api/admin/moderation/queue');
    const data = await res.json();
    setReviews(data);
  }

  useEffect(()=>{ load() }, []);

  async function doAction(action: 'approve'|'reject', id: string){
    if (action === 'approve'){
      const override = confirm('Apply 1-click override? Click OK to override and add feedback.');
      let feedback = undefined;
      if (override) feedback = prompt('Feedback to impacted student(s):') || '';
      await fetch('/api/admin/moderation/approve', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({id, override, feedback})});
    } else {
      const feedback = prompt('Optional feedback to reviewer / student:') || '';
      await fetch('/api/admin/moderation/reject', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({id, feedback})});
    }
    await load();
  }

  async function calibrate(){
    await fetch('/api/admin/moderation/calibrate', { method: 'POST' });
    alert('Calibration run complete.');
    await load();
  }

  async function exportAudit(){
    const res = await fetch('/api/admin/moderation/export');
    const text = await res.text();
    const blob = new Blob([text], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'moderation-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = filterFlagged ? reviews.filter(r=>r.analysis?.toxicity) : reviews;

  return (
    <div style={{padding:20}}>
      <h1>Moderation Queue</h1>
      <div style={{marginBottom:12}}>
        <label><input type="checkbox" checked={filterFlagged} onChange={e=>setFilterFlagged(e.target.checked)} /> Show flagged only</label>
        <button style={{marginLeft:12}} onClick={calibrate}>Run Calibration</button>
        <button style={{marginLeft:12}} onClick={exportAudit}>Export Audit CSV</button>
        <button style={{marginLeft:12}} onClick={load}>Refresh</button>
      </div>

      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr><th>ID</th><th>Submission</th><th>Reviewer</th><th>Score</th><th>Comments</th><th>Analysis</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {visible.map((r:Review)=> (
            <tr key={r.id} style={{borderTop:'1px solid #ddd'}}>
              <td>{r.id}</td>
              <td>{r.submissionId}</td>
              <td>{r.reviewerId}</td>
              <td>{r.score}</td>
              <td>{r.comments}</td>
              <td>
                {r.analysis ? (
                  <div>
                    <div>toxicity: {r.analysis.toxicity ? 'yes':''} ({r.analysis.toxicityScore})</div>
                    <div>sentiment: {r.analysis.sentimentScore.toFixed(2)}</div>
                  </div>
                ) : '—'}
              </td>
              <td>
                <button onClick={()=>doAction('approve', r.id)}>Approve</button>
                <button style={{marginLeft:8}} onClick={()=>doAction('reject', r.id)}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

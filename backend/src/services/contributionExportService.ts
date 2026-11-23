interface Contribution {
  id: string;
  repo: string;
  type: string;
  date: string;
  status: string;
}

interface ContributionExportData {
  userId: string;
  exportedAt: string;
  contributions: Contribution[];
}

function getMockContributions(): Contribution[] {
  return [
    { id: 'c1', repo: 'stellar/stellar-sdk', type: 'pull_request', date: '2024-03-01', status: 'merged' },
    { id: 'c2', repo: 'web3-student-lab/frontend', type: 'issue', date: '2024-03-15', status: 'closed' },
    { id: 'c3', repo: 'soroban-examples/tokens', type: 'pull_request', date: '2024-04-10', status: 'open' },
  ];
}

export function exportAsJSON(userId: string): ContributionExportData {
  return {
    userId,
    exportedAt: new Date().toISOString(),
    contributions: getMockContributions(),
  };
}

export function exportAsCSV(userId: string): string {
  const contributions = getMockContributions();
  const header = 'id,repo,type,date,status';
  const rows = contributions.map(
    (c) => `${c.id},${c.repo},${c.type},${c.date},${c.status}`
  );
  return [header, ...rows].join('\n');
}

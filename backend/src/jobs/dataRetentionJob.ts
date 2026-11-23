export interface DataRetentionResult {
  deletedRefreshTokens: number;
  deletedRateLimitLogs: number;
  archivedAttempts: number;
}

export async function runDataRetentionJob(): Promise<DataRetentionResult> {
  return {
    deletedRefreshTokens: 0,
    deletedRateLimitLogs: 0,
    archivedAttempts: 0,
  };
}

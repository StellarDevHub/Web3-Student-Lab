// Standalone Redis configuration
export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  enableOfflineQueue: false,
  enableReadyCheck: true,
  enableAutoPipelining: true,
  autoPipeliningIgnoredCommands: ['info', 'ping'],
};

// Redis Cluster configuration for high availability
export const redisClusterConfig = {
  nodes: parseRedisClusterNodes(),
  password: process.env.REDIS_PASSWORD,
  options: {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    enableReadyCheck: true,
    enableAutoPipelining: true,
    autoPipeliningIgnoredCommands: ['info', 'ping'],
    clusterRetryStrategy: (times: number) => Math.min(times * 100, 3000),
    dnsLookup: (address: string, callback: Function) => {
      require('dns').lookup(address, callback);
    },
  },
};

// Sentinel configuration for automatic failover
export const redisSentinelConfig = {
  sentinels: parseSentinelNodes(),
  name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
  password: process.env.REDIS_PASSWORD,
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
  sentinelRetryStrategy: (times: number) => Math.min(times * 100, 3000),
  options: {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableAutoPipelining: true,
  },
};

// Cache TTL configurations for different data types
export const cacheTTL = {
  // Blockchain data - shorter TTL due to frequent updates
  blockchain: {
    blockHeader: 10, // 10 seconds
    accountBalance: 30, // 30 seconds
    contractState: 60, // 1 minute
    transactionStatus: 120, // 2 minutes
    tokenMetadata: 3600, // 1 hour
  },
  user: {
    profile: 300, // 5 minutes
    progress: 180, // 3 minutes
    certificates: 600, // 10 minutes
    onChainData: 60, // 1 minute
  },
  courses: {
    list: 1800, // 30 minutes
    detail: 900, // 15 minutes
    curriculum: 1800, // 30 minutes
  },
  leaderboard: {
    global: 300, // 5 minutes
    weekly: 180, // 3 minutes
  },
  rpc: {
    methodResponse: 60, // 1 minute - for generic RPC call results
  },
};

// Helper function to parse Redis cluster nodes from environment
function parseRedisClusterNodes() {
  const nodes = process.env.REDIS_CLUSTER_NODES;
  if (!nodes) {
    return [{ host: 'localhost', port: 6379 }];
  }
  return nodes.split(',').map((node) => {
    const [host, port] = node.trim().split(':');
    return { host, port: parseInt(port || '6379', 10) };
  });
}

// Helper function to parse Sentinel nodes from environment
function parseSentinelNodes() {
  const sentinels = process.env.REDIS_SENTINELS;
  if (!sentinels) {
    return [{ host: 'localhost', port: 26379 }];
  }
  return sentinels.split(',').map((node) => {
    const [host, port] = node.trim().split(':');
    return { host, port: parseInt(port || '26379', 10) };
  });
}

// Redis mode configuration
export const REDIS_MODE = (process.env.REDIS_MODE || 'standalone') as 'standalone' | 'cluster' | 'sentinel';

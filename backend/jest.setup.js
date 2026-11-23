require('dotenv/config');

const { shutdownCoordinator } = require('./src/utils/shutdown.ts');

// Ensure HTTP servers, queue workers, Prisma and Redis connections opened by
// test suites are torn down so Jest can exit without --forceExit.
afterAll(async () => {
  await shutdownCoordinator.closeAllConnections();
});

import 'dotenv/config';
import { getProfileStatusByWallet } from './src/auth/auth.service.js';
import { workspaceContextStorage } from './src/middleware/WorkspaceContext.js';

async function main() {
  try {
    await workspaceContextStorage.run("test-workspace", async () => {
      const res = await getProfileStatusByWallet("GBRPYHIL2CI3FYQMWVUGE62KMGOBQKLCYJ3HLKBUBIW5VZH4S4MNOWT");
      console.log("Success:", res);
    });
  } catch(e) {
    console.error("ERROR:", e);
  }
}
main();

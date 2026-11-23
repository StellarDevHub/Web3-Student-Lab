import { redirect } from 'next/navigation';

/**
 * FE-HARD-27: the duplicate `/merkle-simulator` route is unified into the
 * Merkle Proof Studio at `/merkle-tree`. This stub preserves old links by
 * redirecting instead of 404ing.
 */
export default function MerkleSimulatorRedirect() {
  redirect('/merkle-tree');
}

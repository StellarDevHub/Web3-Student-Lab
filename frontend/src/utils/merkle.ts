import { Address, nativeToScVal } from '@stellar/stellar-sdk';

export interface Recipient {
  address: string;
  amount: string; // BigInt as string
}

export class MerkleTree {
  private leaves: Buffer[] = [];
  private tree: Buffer[][] = [];

  private constructor() {}

  public static async create(recipients: Recipient[]): Promise<MerkleTree> {
    const instance = new MerkleTree();
    instance.leaves = await Promise.all(
      recipients.map((r) => instance.computeLeaf(r.address, r.amount))
    );
    // Sort leaves to ensure deterministic tree (matches Soroban's comparison)
    instance.leaves.sort(Buffer.compare);
    instance.tree = [instance.leaves];
    await instance.buildTree();
    return instance;
  }

  private async computeLeaf(address: string, amount: string): Promise<Buffer> {
    // Replicate Soroban's compute_leaf:
    // buffer.append(&address.to_xdr(env));
    // buffer.append(&amount.to_xdr(env));
    // env.crypto().sha256(&buffer)

    const addrScVal = Address.fromString(address).toScVal();
    const amountScVal = nativeToScVal(BigInt(amount), { type: 'i128' });

    const addrXdr = addrScVal.toXDR();
    const amountXdr = amountScVal.toXDR();

    const combined = Buffer.concat([addrXdr, amountXdr]);
    return Buffer.from(await crypto.subtle.digest('SHA-256', combined));
  }

  private async buildTree() {
    let currentLayer = this.leaves;
    while (currentLayer.length > 1) {
      const nextLayer: Buffer[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          const left = currentLayer[i];
          const right = currentLayer[i + 1];
          // Sort pair to match Soroban logic (computed_hash < proof_element)
          const pair = [left, right].sort(Buffer.compare);
          nextLayer.push(await this.hashPair(pair[0], pair[1]));
        } else {
          nextLayer.push(currentLayer[i]);
        }
      }
      this.tree.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  private async hashPair(left: Buffer, right: Buffer): Promise<Buffer> {
    // Replicate Soroban's verify logic for internal nodes:
    // buffer.append(&computed_hash.into());
    // buffer.append(&proof_element.into());
    const combined = Buffer.concat([left, right]);
    return Buffer.from(await crypto.subtle.digest('SHA-256', combined));
  }

  public getRoot(): string {
    if (this.tree.length === 0) return '';
    return this.tree[this.tree.length - 1][0].toString('hex');
  }

  public getProof(address: string, amount: string): string[] {
    // Note: This needs to be async if we want to call computeLeaf here,
    // but we already have the leaves sorted and stored.
    // For simplicity, let's assume we can compute the leaf again.
    // However, computeLeaf is async.
    // Let's change the design or just wait for the leaf.
    throw new Error('Use getProofAsync');
  }

  public async getProofAsync(address: string, amount: string): Promise<string[]> {
    const leaf = await this.computeLeaf(address, amount);
    let index = this.leaves.findIndex((l) => l.equals(leaf));
    if (index === -1) return [];

    const proof: string[] = [];
    for (let i = 0; i < this.tree.length - 1; i++) {
      const layer = this.tree[i];
      const isRightNode = index % 2 === 1;
      const siblingIndex = isRightNode ? index - 1 : index + 1;

      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex].toString('hex'));
      }
      index = Math.floor(index / 2);
    }
    return proof;
  }
}

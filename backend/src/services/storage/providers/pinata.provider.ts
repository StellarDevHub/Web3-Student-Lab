import { canonicalizeJson, createDeterministicCid, buildGatewayUrl } from '../utils.js';
import type { StoragePinResult, StorageProvider } from '../types.js';

const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

const getPinataJwt = (): string => {
  const token = process.env.PINATA_JWT || '';

  if (!token && process.env.NODE_ENV !== 'test') {
    throw new Error('PINATA_JWT is required when using the Pinata storage provider');
  }

  return token;
};

const parsePinataResponse = async (response: Response): Promise<StoragePinResult> => {
  const data = (await response.json()) as {
    IpfsHash: string;
    PinSize?: number;
    isDuplicate?: boolean;
  };

  return {
    cid: data.IpfsHash,
    ipfsUri: `ipfs://${data.IpfsHash}`,
    gatewayUrl: buildGatewayUrl(data.IpfsHash),
    provider: 'pinata',
    sizeBytes: data.PinSize,
    isDuplicate: data.isDuplicate,
  };
};

export class PinataStorageProvider implements StorageProvider {
  readonly name = 'pinata' as const;

  async pinJson(input: {
    content: unknown;
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult> {
    const response = await fetch(PINATA_JSON_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getPinataJwt()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: input.content,
        pinataMetadata: {
          name: input.name,
          keyvalues: input.metadata,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinata JSON pin failed with status ${response.status}`);
    }

    return parsePinataResponse(response);
  }

  async pinFile(input: {
    content: Buffer;
    filename: string;
    mimeType: string;
    metadata?: Record<string, unknown>;
  }): Promise<StoragePinResult> {
    const form = new FormData();
    form.append('file', new Blob([input.content], { type: input.mimeType }), input.filename);
    form.append(
      'pinataMetadata',
      JSON.stringify({
        name: input.filename,
        keyvalues: input.metadata,
      })
    );
    form.append(
      'pinataOptions',
      JSON.stringify({
        cidVersion: 1,
      })
    );

    const response = await fetch(PINATA_FILE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getPinataJwt()}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Pinata file pin failed with status ${response.status}`);
    }

    return parsePinataResponse(response);
  }

  async unpin(cid: string): Promise<void> {
    const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getPinataJwt()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Pinata unpin failed with status ${response.status}`);
    }
  }
}

export const createPinataStorageProvider = (): StorageProvider => new PinataStorageProvider();


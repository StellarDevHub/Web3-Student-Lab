import fs from 'fs';
import crypto from 'crypto';
import * as grpc from '@grpc/grpc-js';
import forge from 'node-forge';

export interface MtlsCertMaterial {
  caCert: Buffer;
  cert: Buffer;
  key: Buffer;
}

export interface MtlsFilePaths {
  caCertPath: string;
  certPath: string;
  keyPath: string;
}

export interface GeneratedServiceCert {
  serviceName: string;
  cert: Buffer;
  key: Buffer;
}

export interface GeneratedInternalPki {
  caCert: Buffer;
  caKey: Buffer;
  services: Record<string, GeneratedServiceCert>;
}

/**
 * Validate that all three PEM buffers are non-empty and look like PEM-encoded material.
 */
export function assertValidMtlsMaterial(material: MtlsCertMaterial): void {
  if (!material.caCert?.length || !material.caCert.toString('utf8').includes('BEGIN CERTIFICATE')) {
    throw new Error('mTLS configuration error: invalid or missing CA certificate PEM');
  }
  if (!material.cert?.length || !material.cert.toString('utf8').includes('BEGIN CERTIFICATE')) {
    throw new Error('mTLS configuration error: invalid or missing service certificate PEM');
  }
  if (
    !material.key?.length ||
    !material.key.toString('utf8').includes('PRIVATE KEY')
  ) {
    throw new Error('mTLS configuration error: invalid or missing service private key PEM');
  }
}

/**
 * Load mTLS certificate material from disk. Fails closed if any file is missing or invalid.
 */
export function loadMtlsMaterialFromFiles(paths: MtlsFilePaths): MtlsCertMaterial {
  const material: MtlsCertMaterial = {
    caCert: fs.readFileSync(paths.caCertPath),
    cert: fs.readFileSync(paths.certPath),
    key: fs.readFileSync(paths.keyPath),
  };
  assertValidMtlsMaterial(material);
  return material;
}

/**
 * Load mTLS certificate material from environment variables:
 *   `<PREFIX>_CA_CERT_PATH`, `<PREFIX>_CERT_PATH`, `<PREFIX>_KEY_PATH`
 * Default prefix is `GRPC_MTLS`.
 */
export function loadMtlsMaterialFromEnv(prefix = 'GRPC_MTLS'): MtlsCertMaterial {
  const caCertPath = process.env[`${prefix}_CA_CERT_PATH`];
  const certPath = process.env[`${prefix}_CERT_PATH`];
  const keyPath = process.env[`${prefix}_KEY_PATH`];

  if (!caCertPath || !certPath || !keyPath) {
    throw new Error(
      `mTLS environment variables missing: expected ${prefix}_CA_CERT_PATH, ${prefix}_CERT_PATH, and ${prefix}_KEY_PATH`,
    );
  }

  return loadMtlsMaterialFromFiles({ caCertPath, certPath, keyPath });
}

/**
 * Create gRPC ServerCredentials with strict mutual TLS (`checkClientCertificate = true`).
 * Any client connecting without a valid certificate signed by `material.caCert` is rejected
 * at the TLS transport layer before any RPC handler is invoked.
 */
export function createMtlsServerCredentials(material: MtlsCertMaterial): grpc.ServerCredentials {
  assertValidMtlsMaterial(material);
  return grpc.ServerCredentials.createSsl(
    material.caCert,
    [
      {
        private_key: material.key,
        cert_chain: material.cert,
      },
    ],
    true, // Enforce bidirectional client certificate validation
  );
}

/**
 * Create gRPC ChannelCredentials with mutual TLS.
 * Authenticates this client using `material.cert` / `material.key` and validates
 * the remote server certificate against `material.caCert`.
 */
export function createMtlsClientCredentials(material: MtlsCertMaterial): grpc.ChannelCredentials {
  assertValidMtlsMaterial(material);
  return grpc.credentials.createSsl(material.caCert, material.key, material.cert);
}

function randomSerialHex(): string {
  // Positive 16-byte serial number (clear MSB to avoid negative ASN.1 integer)
  const buf = crypto.randomBytes(16);
  buf[0] = (buf[0] ?? 0) & 0x7f;
  if (buf[0] === 0) buf[0] = 0x01;
  return buf.toString('hex');
}

function createCa(commonName: string, validityDays: number): {
  cert: forge.pki.Certificate;
  keyPair: forge.pki.rsa.KeyPair;
  certPem: Buffer;
  keyPem: Buffer;
} {
  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = randomSerialHex();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + validityDays * 86_400_000);

  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'Web3StudentLab' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  return {
    cert,
    keyPair,
    certPem: Buffer.from(forge.pki.certificateToPem(cert), 'utf8'),
    keyPem: Buffer.from(forge.pki.privateKeyToPem(keyPair.privateKey), 'utf8'),
  };
}

function signServiceCert(
  ca: { cert: forge.pki.Certificate; keyPair: forge.pki.rsa.KeyPair },
  serviceName: string,
  validityDays: number,
  extraDnsNames: string[] = [],
): GeneratedServiceCert {
  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = randomSerialHex();
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + validityDays * 86_400_000);

  cert.setSubject([
    { name: 'commonName', value: serviceName },
    { name: 'organizationName', value: 'Web3StudentLab' },
  ]);
  cert.setIssuer(ca.cert.subject.attributes);

  const altNames: Array<{ type: number; value?: string; ip?: string }> = [
    { type: 2, value: 'localhost' },
    { type: 2, value: serviceName },
    ...extraDnsNames.map((dns) => ({ type: 2, value: dns })),
    { type: 7, ip: '127.0.0.1' },
  ];

  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    { name: 'subjectAltName', altNames },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(ca.keyPair.privateKey, forge.md.sha256.create());

  return {
    serviceName,
    cert: Buffer.from(forge.pki.certificateToPem(cert), 'utf8'),
    key: Buffer.from(forge.pki.privateKeyToPem(keyPair.privateKey), 'utf8'),
  };
}

/**
 * Programmatically generate an internal Root CA and mTLS certificates for the given services.
 * Intended for local development, ephemeral workers, and automated tests.
 */
export function generateInternalPki(
  serviceNames: string[] = ['api-gateway', 'indexer', 'wasm-worker'],
  validityDays = 365,
): GeneratedInternalPki {
  const ca = createCa('web3-student-lab-internal-ca', validityDays);
  const services: Record<string, GeneratedServiceCert> = {};

  for (const name of serviceNames) {
    services[name] = signServiceCert(ca, name, validityDays);
  }

  return {
    caCert: ca.certPem,
    caKey: ca.keyPem,
    services,
  };
}

/**
 * Generate a certificate signed by an unrelated untrusted CA (useful for negative mTLS tests).
 */
export function generateUntrustedClientCert(serviceName = 'rogue-client'): MtlsCertMaterial {
  const rogueCa = createCa('untrusted-rogue-ca', 7);
  const leaf = signServiceCert(rogueCa, serviceName, 7);
  return {
    caCert: rogueCa.certPem,
    cert: leaf.cert,
    key: leaf.key,
  };
}

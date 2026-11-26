import fs from 'fs';
import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
};

export function resolveInternalProtoPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/grpc/proto/internal.proto'),
    path.resolve(process.cwd(), 'backend/src/grpc/proto/internal.proto'),
    path.resolve(process.cwd(), 'dist/grpc/proto/internal.proto'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate internal.proto. Checked: ${candidates.join(', ')}`,
  );
}

export interface InternalProtoPackage {
  internal: {
    v1: {
      IndexerService: grpc.ServiceClientConstructor;
      WasmEvaluatorService: grpc.ServiceClientConstructor;
    };
  };
}

let cachedPackage: InternalProtoPackage | null = null;
let cachedDefinition: protoLoader.PackageDefinition | null = null;

export function loadInternalPackageDefinition(): protoLoader.PackageDefinition {
  if (!cachedDefinition) {
    cachedDefinition = protoLoader.loadSync(
      resolveInternalProtoPath(),
      PROTO_LOADER_OPTIONS,
    );
  }
  return cachedDefinition;
}

export function loadInternalProto(): InternalProtoPackage {
  if (!cachedPackage) {
    const def = loadInternalPackageDefinition();
    cachedPackage = grpc.loadPackageDefinition(def) as unknown as InternalProtoPackage;
  }
  return cachedPackage;
}

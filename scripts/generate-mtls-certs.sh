#!/usr/bin/env bash
# Generate internal Root CA and mTLS service certificates for Web3 Student Lab
# Services: api-gateway, indexer, wasm-worker
set -euo pipefail

OUT_DIR="${1:-./certs/mtls}"
DAYS="${MTLS_CERT_DAYS:-365}"

mkdir -p "$OUT_DIR"

echo "Generating internal Root CA in $OUT_DIR..."
openssl genrsa -out "$OUT_DIR/ca.key" 4096
openssl req -x509 -new -nodes -key "$OUT_DIR/ca.key" -sha256 -days "$DAYS" \
  -subj "/CN=web3-student-lab-internal-ca/O=Web3StudentLab" \
  -out "$OUT_DIR/ca.crt"

generate_service_cert() {
  local svc="$1"
  local extra_dns="$2"
  local ext_file="$OUT_DIR/${svc}.ext"

  echo "Generating mTLS certificate for service: $svc..."
  openssl genrsa -out "$OUT_DIR/${svc}.key" 2048
  openssl req -new -key "$OUT_DIR/${svc}.key" \
    -subj "/CN=${svc}/O=Web3StudentLab" \
    -out "$OUT_DIR/${svc}.csr"

  cat > "$ext_file" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth,clientAuth
subjectAltName=DNS:localhost,DNS:${svc},${extra_dns},IP:127.0.0.1
EOF

  openssl x509 -req -in "$OUT_DIR/${svc}.csr" \
    -CA "$OUT_DIR/ca.crt" -CAkey "$OUT_DIR/ca.key" -CAcreateserial \
    -out "$OUT_DIR/${svc}.crt" -days "$DAYS" -sha256 -extfile "$ext_file"

  rm -f "$OUT_DIR/${svc}.csr" "$ext_file"
  chmod 600 "$OUT_DIR/${svc}.key"
}

generate_service_cert "api-gateway" "DNS:backend"
generate_service_cert "indexer" "DNS:soroban-indexer"
generate_service_cert "wasm-worker" "DNS:wasm-evaluator"

chmod 600 "$OUT_DIR/ca.key"
echo "mTLS certificates generated successfully in $OUT_DIR."

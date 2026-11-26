#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${K8S_NAMESPACE:-production}"
INGRESS="${CANARY_INGRESS:-backend-production}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus.monitoring.svc:9090}"
ERROR_THRESHOLD="${CANARY_ERROR_THRESHOLD:-0.001}"
CHECK_INTERVAL_SECONDS="${CANARY_CHECK_INTERVAL_SECONDS:-10}"
IMAGE="${DEPLOY_IMAGE:-}"

rollback() {
  kubectl annotate ingress "$INGRESS" -n "$NAMESPACE" \
    nginx.ingress.kubernetes.io/canary-weight="0" --overwrite
  kubectl rollout undo deployment/backend-canary -n "$NAMESPACE" || true
  echo "Rollback completed: traffic restored to Blue"
  exit 1
}

trap 'rollback' ERR

set_weight() {
  local weight="$1"
  kubectl annotate ingress "$INGRESS" -n "$NAMESPACE" \
    nginx.ingress.kubernetes.io/canary-weight="$weight" --overwrite
  echo "Canary traffic set to ${weight}%"
}

check_metrics() {
  local query
  local value
  query='sum(rate(http_requests_total{service="backend-canary",status=~"5.."}[1m])) / clamp_min(sum(rate(http_requests_total{service="backend-canary"}[1m])), 1)'
  value="$(curl -fsSG --data-urlencode "query=$query" \
    "$PROMETHEUS_URL/api/v1/query" |
    python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "0")')"
  awk -v value="$value" -v threshold="$ERROR_THRESHOLD" 'BEGIN { exit !(value + 0 <= threshold + 0) }' ||
    { echo "Canary error rate $value exceeds $ERROR_THRESHOLD"; rollback; }

  query='histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="backend-canary"}[1m])) by (le))'
  value="$(curl -fsSG --data-urlencode "query=$query" \
    "$PROMETHEUS_URL/api/v1/query" |
    python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; print(r[0]["value"][1] if r else "0")')"
  echo "Canary metrics checked: p95 latency=${value}s"
}

monitor() {
  local duration="$1"
  local elapsed=0
  while (( elapsed < duration)); do
    check_metrics
    sleep "$CHECK_INTERVAL_SECONDS"
    elapsed=$((elapsed + CHECK_INTERVAL_SECONDS))
  done
}

if [[ -n "$IMAGE" ]]; then
  kubectl set image deployment/backend-canary backend="$IMAGE" -n "$NAMESPACE"
  kubectl rollout status deployment/backend-canary -n "$NAMESPACE" --timeout=5m
fi

set_weight 5
monitor 600
set_weight 25
monitor 300
set_weight 50
monitor 300
set_weight 100
monitor 0

trap - ERR
echo "Canary promotion completed: 100% traffic on Green"

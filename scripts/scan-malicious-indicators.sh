#!/usr/bin/env bash
# ==============================================================================
# Malicious Code & Supply Chain Indicator Scanner (Wave 10 Security Policy)
# ==============================================================================
set -eo pipefail

echo "🔍 Running Wave 10 Malicious Indicator Scan..."
ERRORS=0

# 1. Known malware signatures
echo "▶ [1/7] Scanning for known malicious marker strings..."
MARKERS=('rmcej%otb%' 'Cot%3T=sthP' '_$__1e42')
for marker in "${MARKERS[@]}"; do
  if git grep -F "$marker" -- ":!.pnpm-store" ":!scripts/*" ":!.github/*" 2>/dev/null; then
    echo "❌ ALERT: Found known malicious marker '$marker' in repository!"
    ERRORS=$((ERRORS + 1))
  fi
done

# 2. .vscode tasks and settings
echo "▶ [2/7] Checking .vscode configuration..."
if [ -f ".vscode/tasks.json" ]; then
  if grep -E -q '(runOn.*folderOpen|curl|wget|node\s+dist\/)' ".vscode/tasks.json"; then
    echo "❌ ALERT: Suspicious task found in .vscode/tasks.json!"
    ERRORS=$((ERRORS + 1))
  fi
fi

if git grep -E 'task\.allowAutomaticTasks.*(on|"on"|true)' -- ":!.pnpm-store" 2>/dev/null; then
  echo "❌ ALERT: Found task.allowAutomaticTasks enabled!"
  ERRORS=$((ERRORS + 1))
fi

# 3. Suspicious font files
echo "▶ [3/7] Scanning for suspicious font files..."
SUSPICIOUS_FONTS=$(find . -type f \( \
  -name "fa-solid-500.woff2" -o \
  -name "fa-solid-600.eot" -o \
  -name "fa-solid.lik" -o \
  -name "fa-solid-300.ttf" -o \
  -name "*.lik" \
\) | grep -v "node_modules" | grep -v ".pnpm-store" || true)

if [ -n "$SUSPICIOUS_FONTS" ]; then
  echo "❌ ALERT: Suspicious font / binary file(s) detected:"
  echo "$SUSPICIOUS_FONTS"
  ERRORS=$((ERRORS + 1))
fi

# 4. dist/setup.js or preinstall scripts
echo "▶ [4/7] Checking for dist/setup.js or preinstall hooks..."
if find . -name "setup.js" | grep -v "node_modules" | grep -v ".pnpm-store" | grep -q .; then
  echo "❌ ALERT: Found unexpected setup.js file!"
  ERRORS=$((ERRORS + 1))
fi

if git grep -E '"preinstall"\s*:\s*"[^"]*setup\.js' -- ":!.pnpm-store" 2>/dev/null; then
  echo "❌ ALERT: Found preinstall script running setup.js in package.json!"
  ERRORS=$((ERRORS + 1))
fi

# 5. api.js in start/dev scripts
echo "▶ [5/7] Checking for suspicious api.js in start/dev scripts..."
if git grep -E '"(start|dev)"\s*:\s*"[^"]*(\/|\s|^)api\.js' -- ":!.pnpm-store" 2>/dev/null; then
  echo "❌ ALERT: Found start/dev script executing api.js!"
  ERRORS=$((ERRORS + 1))
fi

# 6. Config file trailing padding / hidden code
echo "▶ [6/7] Checking config files for trailing padding and appended payloads..."
CONFIG_FILES=$(find . -maxdepth 3 \( \
  -name "postcss.config*" -o \
  -name "tailwind.config*" -o \
  -name "eslint.config*" -o \
  -name "*next.config*" -o \
  -name "jest.config*" -o \
  -name "vite*.config*" \
\) | grep -v "node_modules" | grep -v ".pnpm-store" || true)

for cfg in $CONFIG_FILES; do
  # Check for lines longer than 1000 characters
  if awk 'length > 1000 { exit 1 }' "$cfg"; then
    :
  else
    echo "❌ ALERT: Abnormally long line (>1000 chars) found in $cfg!"
    ERRORS=$((ERRORS + 1))
  fi
  # Check for large trailing blank lines (>10 blank lines before code)
  if grep -E -q '(eval\(|atob\(|exec\(|Buffer\.from\(.*base64)' "$cfg"; then
    echo "❌ ALERT: Dangerous dynamic evaluation code found in $cfg!"
    ERRORS=$((ERRORS + 1))
  fi
done

# 7. Summary
echo "▶ [7/7] Scan complete."
if [ "$ERRORS" -gt 0 ]; then
  echo "❌ MALWARE SCAN FAILED: $ERRORS indicator(s) found!"
  exit 1
else
  echo "✅ MALWARE SCAN PASSED: No malicious indicators detected in repository."
  exit 0
fi

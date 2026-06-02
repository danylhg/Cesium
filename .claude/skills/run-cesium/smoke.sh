#!/usr/bin/env bash
# Smoke test script for the CESIUM API
# Run from Operaciones/api/ with the server already started in background

BASE="http://localhost:3001"
PASS=0
FAIL=0

check() {
  local label="$1"
  local url="$2"
  local expected="$3"

  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "$expected" ]; then
    echo "  PASS [$status] $label"
    ((PASS++))
  else
    echo "  FAIL [$status] $label (expected $expected)"
    ((FAIL++))
  fi
}

echo "=== CESIUM API smoke tests ==="

check "health"          "$BASE/health"        200
check "login missing"   "$BASE/auth/login"    404
check "dashboard html"  "$BASE/dashboard.html" 200

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1

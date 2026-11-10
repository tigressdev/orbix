#!/usr/bin/env bash
# Auth end-to-end: throwaway API (:8767) with two random test accounts created for this run only, a production preview (:4174) in front of it,
# then the Playwright auth spec. Nothing here touches your real users or workspaces.
set -uo pipefail
cd "$(dirname "$0")/../.."
for port in 8767 4174; do
  for pid in $(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1 || true; done
done
export E2E_PASS="$(python -c 'import secrets,sys; sys.stdout.write(secrets.token_urlsafe(12))')"
export FI_USERS="$(PYTHONPATH=src python -c 'import json,os
from flightintel.auth import hash_password
p = os.environ["E2E_PASS"]
print(json.dumps({"alice": {"name": "Alice", "hash": hash_password(p), "owner": True}, "bob": {"name": "Bob", "hash": hash_password(p)}}))')"
export FI_SESSION_SECRET="test-only-$(python -c 'import secrets,sys; sys.stdout.write(secrets.token_hex(8))')"
python trip.py serve --port 8767 >/tmp/api-auth.log 2>&1 &
API=$!
(cd frontend && API_URL=http://localhost:8767 npx vite preview --port 4174 --host 127.0.0.1 >/tmp/prev-auth.log 2>&1) &
PREV=$!
trap 'kill $API $PREV 2>/dev/null; for port in 8767 4174; do for pid in $(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk "{print \$5}" | sort -u); do taskkill //PID "$pid" //F >/dev/null 2>&1; done; done; true' EXIT
sleep 7
cd frontend && npx playwright test e2e/auth.spec.ts "$@"

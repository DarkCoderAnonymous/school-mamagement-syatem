#!/usr/bin/env bash
# Runs the Slice-1 flow end to end against a running server:
# register -> super-admin login -> approve -> new-admin login -> /me.
# Requires: server running (npm run start:dev), and the seed script having
# been run at least once (for the super admin + a seeded plan).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000/api/v1}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@sms.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "== 1. Fetch an active plan =="
PLAN_ID=$(curl -sf "$BASE_URL/plans" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data[0].id ?? JSON.parse(d).data[0]._id))")
echo "planId=$PLAN_ID"

echo "== 2. Submit a school registration =="
REG_EMAIL="verify-$(date +%s)@example.com"
REGISTER_RESPONSE=$(curl -sf -X POST "$BASE_URL/registrations" \
  -H 'Content-Type: application/json' \
  -d "{\"schoolName\":\"Verify Flow School\",\"contactPerson\":\"Jamie Verifier\",\"email\":\"$REG_EMAIL\",\"phone\":\"+1-555-0000\",\"requestedPlanId\":\"$PLAN_ID\"}")
echo "$REGISTER_RESPONSE"
REG_ID=$(echo "$REGISTER_RESPONSE" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data.id))")
echo "registrationId=$REG_ID"

echo "== 3. Check registration status by email =="
curl -sf "$BASE_URL/registrations/status?email=$REG_EMAIL"
echo

echo "== 4. Log in as Super Admin =="
LOGIN_RESPONSE=$(curl -sf -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SUPER_ADMIN_EMAIL\",\"password\":\"$SUPER_ADMIN_PASSWORD\"}")
SUPER_ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data.accessToken))")
echo "got super admin access token"

echo "== 5. Approve the registration =="
APPROVE_RESPONSE=$(curl -sf -X POST "$BASE_URL/admin/registrations/$REG_ID/approve" \
  -H "Authorization: Bearer $SUPER_ACCESS_TOKEN")
echo "$APPROVE_RESPONSE"
NEW_ADMIN_EMAIL=$(echo "$APPROVE_RESPONSE" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data.adminEmail))")
NEW_ADMIN_PASSWORD=$(echo "$APPROVE_RESPONSE" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data.tempPassword))")
echo "new admin: $NEW_ADMIN_EMAIL / $NEW_ADMIN_PASSWORD"

echo "== 6. Log in as the new School Admin (temp password) =="
NEW_LOGIN_RESPONSE=$(curl -sf -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$NEW_ADMIN_EMAIL\",\"password\":\"$NEW_ADMIN_PASSWORD\"}")
echo "$NEW_LOGIN_RESPONSE"
NEW_ACCESS_TOKEN=$(echo "$NEW_LOGIN_RESPONSE" | node -e "process.stdin.once('data',d=>console.log(JSON.parse(d).data.accessToken))")

echo "== 7. GET /auth/me as the new School Admin =="
curl -sf "$BASE_URL/auth/me" -H "Authorization: Bearer $NEW_ACCESS_TOKEN"
echo

echo "== 8. Double-approve must fail =="
set +e
DOUBLE_APPROVE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/admin/registrations/$REG_ID/approve" \
  -H "Authorization: Bearer $SUPER_ACCESS_TOKEN")
set -e
echo "second approve HTTP status: $DOUBLE_APPROVE (expect 409)"

echo "== Flow complete =="

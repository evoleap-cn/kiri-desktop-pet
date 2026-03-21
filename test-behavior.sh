#!/bin/bash
# Test behavior engine: trigger event states and verify engine yields/resumes
PORT=23333
URL="http://127.0.0.1:$PORT/state"

echo "=== Behavior Engine Integration Test ==="
echo ""
echo "1. Sending 'thinking' state (simulates an external hook event)..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"thinking","session_id":"test-session"}'
echo ""
sleep 3

echo "2. Sending 'working' state..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"working","session_id":"test-session"}'
echo ""
sleep 3

echo "3. Sending 'attention' (oneshot)..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"attention","session_id":"test-session"}'
echo ""
sleep 5

echo "4. Ending session (should resume behavior engine)..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"idle","session_id":"test-session","event":"SessionEnd"}'
echo ""
sleep 2

echo "5. Testing direct SVG overrides for new animations..."
echo "   Walking..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"walking","svg":"clawd-walk.svg"}'
echo ""
sleep 3

echo "   Running..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"running","svg":"clawd-run.svg"}'
echo ""
sleep 3

echo "   Startle..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"startle","svg":"clawd-startle.svg"}'
echo ""
sleep 2

echo "   Living (idle-living)..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"living","svg":"clawd-idle-living.svg"}'
echo ""
sleep 16

echo "   Back to idle..."
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"state":"idle","svg":"clawd-idle-follow.svg"}'
echo ""

echo ""
echo "=== Test complete ==="

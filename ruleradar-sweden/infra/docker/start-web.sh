#!/bin/sh
set -eu

npm run db:migrate
npm run db:seed

npm run start -w @ruleradar/worker &
worker_pid=$!
npm run start -w @ruleradar/web &
web_pid=$!

shutdown() {
  kill "$worker_pid" "$web_pid" 2>/dev/null || true
  wait "$worker_pid" "$web_pid" 2>/dev/null || true
}

trap shutdown INT TERM EXIT

while kill -0 "$worker_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 5
done

if ! kill -0 "$worker_pid" 2>/dev/null; then
  echo "RuleRadar worker stopped unexpectedly; terminating the service so Render can restart it." >&2
else
  echo "RuleRadar web process stopped unexpectedly; terminating the service." >&2
fi

exit 1

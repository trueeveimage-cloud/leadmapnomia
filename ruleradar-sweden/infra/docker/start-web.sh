#!/bin/sh
set -eu

npm run db:migrate
npm run db:seed
npm run start -w @ruleradar/worker &
exec npm run start -w @ruleradar/web

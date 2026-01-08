#!/usr/bin/env bash
set -euo pipefail

SCOPE=${1:-04_large_file_upload_02_01_splitting}
ITERATION=${2:-iteration_01}

printf "[%s-validation] scope=%s iteration=%s\n" "$SCOPE" "$SCOPE" "$ITERATION"

printf "[%s-validation] TypeScript compilation check...\n" "$SCOPE"
cd functions && npx tsc --noEmit && cd ..
printf "[%s-validation] TypeScript: PASS\n" "$SCOPE"

printf "[%s-validation] Running functions build...\n" "$SCOPE"
cd functions && npm run build && cd ..
printf "[%s-validation] Build: PASS\n" "$SCOPE"

printf "[%s-validation] Complete.\n" "$SCOPE"

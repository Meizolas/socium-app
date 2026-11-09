$env:SOCIUM_LOCAL_E2E='true'
$env:LOCAL_DATABASE_URL='postgresql://postgres:local-only@127.0.0.1:55433/socium_local'
$env:LOCAL_SESSION_SECRET='socium-local-session-secret-2026-only'
$env:NFSE_CUSTODY_KEY_V1='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
npm run dev -- --hostname 127.0.0.1 --port 3100

$env:SOCIUM_LOCAL_E2E='true'
$env:NFSE_PROVIDER='simulated'
$env:APP_ENV='local'
$env:LOCAL_DATABASE_URL='postgresql://postgres:local-only@127.0.0.1:55433/socium_local'
$env:LOCAL_STORAGE_ROOT=(Resolve-Path (Join-Path $PSScriptRoot '..\.local-data')).Path
$env:NFSE_CUSTODY_KEY_V1='MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
Push-Location (Join-Path $PSScriptRoot '..\services\nfse')
try{python -m nfse.worker}finally{Pop-Location}

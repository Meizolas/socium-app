$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compose=Join-Path $root 'docker-compose.local.yml'
docker compose -f $compose up -d --wait
docker compose -f $compose exec -T postgres dropdb -U postgres --if-exists socium_local
docker compose -f $compose exec -T postgres createdb -U postgres socium_local
function Sql([string]$file){
  Get-Content -Raw -LiteralPath $file|docker compose -f $compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d socium_local
  if($LASTEXITCODE-ne 0){throw "Falha em $file"}
}
Sql (Join-Path $root 'supabase\tests\bootstrap.sql')
Get-ChildItem (Join-Path $root 'supabase\migrations') -Filter '*.sql'|Sort-Object Name|ForEach-Object{Sql $_.FullName}
Sql (Join-Path $root 'supabase\tests\local_seed.sql')
python (Join-Path $root 'scripts\generate-synthetic-certificate.py')
Write-Host 'Ambiente local pronto. Certificado: .local-data/fixtures/synthetic.pfx | senha: Synthetic-2026!'

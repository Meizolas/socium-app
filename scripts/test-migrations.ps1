$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Assert-Exit([string]$operation) {
  if ($LASTEXITCODE -ne 0) { throw "$operation falhou com codigo $LASTEXITCODE." }
}
function Compose([string[]]$arguments) {
  & docker compose -f (Join-Path $root 'docker-compose.migrations.yml') @arguments
  Assert-Exit "docker compose $($arguments -join ' ')"
}
Compose @('up','-d','--wait')
function Sql([string]$database,[string]$file) {
  Get-Content -Raw -LiteralPath $file | & docker compose -f (Join-Path $root 'docker-compose.migrations.yml') exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d $database
  Assert-Exit "SQL $file em $database"
}
function Reset([string]$database) {
  Compose @('exec','-T','postgres','dropdb','-U','postgres','--if-exists',$database)
  Compose @('exec','-T','postgres','createdb','-U','postgres',$database)
  Sql $database (Join-Path $root 'supabase\tests\bootstrap.sql')
}
$migrations=Get-ChildItem (Join-Path $root 'supabase\migrations') -Filter '*.sql'|Sort-Object Name
Reset 'socium_clean';foreach($migration in $migrations){Sql 'socium_clean' $migration.FullName};Sql 'socium_clean' (Join-Path $root 'supabase\tests\assertions.sql')
Reset 'socium_upgrade';foreach($migration in $migrations|Where-Object Name -LT '014_'){Sql 'socium_upgrade' $migration.FullName};Sql 'socium_upgrade' (Join-Path $root 'supabase\tests\upgrade_fixture.sql');foreach($migration in $migrations|Where-Object Name -GE '014_'){Sql 'socium_upgrade' $migration.FullName};Sql 'socium_upgrade' (Join-Path $root 'supabase\tests\assertions.sql');Sql 'socium_upgrade' (Join-Path $root 'supabase\tests\upgrade_assertions.sql')
Write-Host 'Migrations limpa e upgrade a partir da 013 validados.'

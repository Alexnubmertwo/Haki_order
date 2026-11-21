# Zapusk Haki: sprashivaet paroli (vvod skryt), nichego ne sohranyaet na disk.
$ErrorActionPreference = "Stop"

function Read-Plain($prompt) {
    $s = Read-Host $prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$env:SUPABASE_DB_URL  = 'jdbc:postgresql://aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require'
$env:SUPABASE_DB_USER = 'postgres.tagxvlglzagkwndlzzky'
$env:SUPABASE_DB_PASSWORD = Read-Plain "Пароль базы Supabase"

$env:HAKI_SUPERADMIN_USER = 'Haki'
$sa = Read-Plain "Пароль суперадмина Haki (нужен только при первом запуске, можно просто нажать Enter)"
if ($sa) { $env:HAKI_SUPERADMIN_PASSWORD = $sa }

Set-Location "$PSScriptRoot\haki-project2\haki\backend"
$ErrorActionPreference = "Continue"
mvn spring-boot:run 2>&1 | Tee-Object -FilePath "$PSScriptRoot\haki-log.txt"

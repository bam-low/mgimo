#Requires -Version 7.4
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../ops/app-update/Update-Campus.ps1" -LibraryOnly
function Must-Fail([scriptblock]$Code) {
    $failed = $false
    try { & $Code } catch { $failed = $true }
    if (-not $failed) { throw 'Ожидаемый отказ не получен.' }
}
$result = ConvertFrom-CampusResult "Запрос sudo без записи пароля`r`nCAMPUS_APP_RESULT={""status"":""UPDATED""}`r`n"
if ($result.status -cne 'UPDATED') { throw 'Ошибка разбора протокола сервера.' }
Must-Fail { ConvertFrom-CampusResult 'Нет подтверждения сервера' }
Must-Fail { ConvertFrom-CampusResult "CAMPUS_APP_RESULT={}`nCAMPUS_APP_RESULT={}" }
Must-Fail { ConvertFrom-CampusResult 'CAMPUS_APP_RESULT=не JSON' }
$sha = 'a' * 40
$run = @{ id = 123; repository = @{full_name = 'bam-low/mgimo'}; path = '.github/workflows/vps-ci.yml'; event = 'workflow_dispatch'; head_branch = 'main'; status = 'completed'; conclusion = 'success'; head_sha = $sha }
Assert-CampusRun $run '123'
foreach ($field in @('path', 'event', 'head_branch', 'status', 'conclusion', 'head_sha')) {
    $bad = $run.Clone(); $bad[$field] = 'wrong'
    Must-Fail { Assert-CampusRun $bad '123' }
}
Must-Fail { Assert-CampusRun $run '456' }
$checks = @(@{name='Node CI';head_sha=$sha;head_branch='main';event='push';id=1;status='completed';conclusion='success'}, @{name='Documentation CI';head_sha=$sha;head_branch='main';event='push';id=2;status='completed';conclusion='success'})
Assert-CampusChecks $checks $sha
Must-Fail { Assert-CampusChecks @($checks[0]) $sha }
$red = $checks[0].Clone(); $red.id=3; $red.conclusion='failure'
Must-Fail { Assert-CampusChecks @($checks + $red) $sha }
$artifact = @{name='expected';expired=$false;size_in_bytes=1000;workflow_run=@{head_sha=$sha}}
Assert-CampusArtifact $artifact 'expected' $sha
$artifact.expired=$true
Must-Fail { Assert-CampusArtifact $artifact 'expected' $sha }
Must-Fail { Invoke-CampusUpdate '123; exit' 'unused.json' }
# Real Windows native argument handling, Python checksum/archive parser and local SSHSIG.
$temp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    $key = Join-Path $temp 'throwaway key'
    Invoke-CampusNative 'ssh-keygen' @('-q','-t','ed25519','-N','','-f',$key) | Out-Null
    $signers = Join-Path $temp 'allowed signers'
    "campus-release-owner $(Get-Content -LiteralPath ($key+'.pub') -Raw)" | Set-Content -LiteralPath $signers -Encoding ascii
    $release = Join-Path $temp 'release с пробелами'
    New-Item -ItemType Directory -Path $release | Out-Null
    $code = 'import sys;from pathlib import Path;sys.path.insert(0,"tests");from app_update_fixture import fixture;fixture(Path(sys.argv[1]))'
    Invoke-CampusNative 'python' @('-c',$code,$release) | Out-Null
    $validator = "$PSScriptRoot/../ops/app-update/package.py"
    Invoke-CampusNative 'python' @($validator,'verify',$release) | Out-Null
    Invoke-CampusNative 'ssh-keygen' @('-Y','sign','-f',$key,'-n','campus-app-update',(Join-Path $release 'SHA256SUMS')) | Out-Null
    Invoke-CampusNative 'python' @($validator,'verify',$release,'--signers',$signers) | Out-Null
    '{}' | Set-Content -LiteralPath (Join-Path $release 'app-release.json')
    Must-Fail { Invoke-CampusNative 'python' @($validator,'verify',$release,'--signers',$signers) }
    Write-Host 'Windows: проверки источника/CI/артефакта, аргументов, реальной подписи и подмены пройдены.'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
# The final negative native-command test intentionally left LASTEXITCODE=1.
# Signal success only after every assertion and cleanup above has completed.
exit 0

#Requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Position=0)][string]$RunId,
    [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'Campus/update.json'),
    [switch]$LibraryOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CampusNative {
    param([string]$Program, [string[]]$Arguments, [int[]]$AllowedExitCodes = @(0))
    $output = & $Program @Arguments
    if ($LASTEXITCODE -notin $AllowedExitCodes) { throw "Команда $Program завершилась с кодом $LASTEXITCODE. Обновление не подтверждено." }
    return $output
}

function Assert-CampusRun {
    param($Run, [string]$Id)
    if ("$($Run.id)" -cne $Id -or $Run.repository.full_name -cne 'bam-low/mgimo' -or
        $Run.path -cne '.github/workflows/vps-ci.yml' -or $Run.event -cne 'workflow_dispatch' -or
        $Run.head_branch -cne 'main' -or $Run.status -cne 'completed' -or $Run.conclusion -cne 'success' -or
        $Run.head_sha -cnotmatch '^[a-f0-9]{40}$') {
        throw 'Нужен успешный ручной экспорт VPS CI из main в bam-low/mgimo.'
    }
}

function Assert-CampusChecks {
    param($Runs, [string]$Sha)
    foreach ($name in @('Node CI', 'Documentation CI')) {
        $latest = @($Runs | Where-Object { $_.name -ceq $name -and $_.head_sha -ceq $Sha -and $_.event -ceq 'push' -and $_.head_branch -ceq 'main' } | Sort-Object id -Descending)
        if ($latest.Count -eq 0 -or $latest[0].status -cne 'completed' -or $latest[0].conclusion -cne 'success') {
            throw "Нет успешной последней проверки $name на точном SHA main."
        }
    }
}

function Assert-CampusArtifact {
    param($Artifact, [string]$Name, [string]$Sha)
    if ($Artifact.name -cne $Name -or $Artifact.expired -or $Artifact.workflow_run.head_sha -cne $Sha -or
        $Artifact.size_in_bytes -lt 100 -or $Artifact.size_in_bytes -gt 2147483648) {
        throw 'Артефакт отсутствует, истёк или не соответствует выпуску.'
    }
}

function ConvertFrom-CampusResult {
    param([string]$Output)
    $lines = @($Output -split "`n" | Where-Object { $_.TrimStart().StartsWith('CAMPUS_APP_RESULT=') })
    if ($lines.Count -ne 1) { throw 'Нет однозначного результата сервера. Проверьте состояние и recover по инструкции.' }
    return $lines[0].Trim().Substring('CAMPUS_APP_RESULT='.Length) | ConvertFrom-Json
}

function Invoke-CampusUpdate {
    param([string]$Id, [string]$SettingsPath)
    if ($Id -cnotmatch '^[1-9][0-9]{0,19}$') { throw 'Укажите числовой номер запуска GitHub Actions.' }
    if (-not $IsWindows) { throw 'Эта команда предназначена для PowerShell 7.4+ на Windows.' }
    foreach ($tool in @('gh', 'ssh', 'scp', 'ssh-keygen', 'python')) { Get-Command $tool -ErrorAction Stop | Out-Null }
    $c = Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json
    if ($c.Host -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]+$' -or $c.User -cnotmatch '^[a-z_][a-z0-9_-]*$' -or
        "$($c.Port)" -notmatch '^[0-9]+$' -or [int]$c.Port -lt 1 -or [int]$c.Port -gt 65535 -or
        $c.Inbox -cnotmatch '^/[a-zA-Z0-9/_.-]+$' -or $c.BackupExport -cnotmatch '^/[a-zA-Z0-9/_.-]+$') { throw 'Неверные настройки SSH.' }
    foreach ($file in @($c.SigningKey, $c.SigningPublicKey, $c.SshKey, $c.KnownHosts, $c.AllowedSigners, $c.TargetFile)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Не найден локальный ключ или доверенный файл настроек.' }
    }
    # Pin the signing public key independently; never obtain trust from the downloaded artifact.
    $fingerprint = (Invoke-CampusNative 'ssh-keygen' @('-lf', $c.SigningPublicKey, '-E', 'sha256')) -join "`n"
    if (($fingerprint -split '\s+')[1] -cne $c.SigningFingerprint) { throw 'Fingerprint ключа подписи не совпадает.' }
    $run = (Invoke-CampusNative 'gh' @('api', "repos/bam-low/mgimo/actions/runs/$Id")) -join "`n" | ConvertFrom-Json
    Assert-CampusRun $run $Id
    $runs = ((Invoke-CampusNative 'gh' @('api', "repos/bam-low/mgimo/actions/runs?head_sha=$($run.head_sha)&event=push&per_page=100")) -join "`n" | ConvertFrom-Json).workflow_runs
    Assert-CampusChecks $runs $run.head_sha
    $name = "campus-app-update-$($run.head_sha)-run-$Id-attempt-$($run.run_attempt)"
    $artifacts = ((Invoke-CampusNative 'gh' @('api', "repos/bam-low/mgimo/actions/runs/$Id/artifacts?per_page=100")) -join "`n" | ConvertFrom-Json).artifacts
    $matches = @($artifacts | Where-Object { $_.name -ceq $name })
    if ($matches.Count -ne 1) { throw 'Нужен ровно один app-only артефакт успешной попытки.' }
    Assert-CampusArtifact $matches[0] $name $run.head_sha
    $cache = Join-Path $c.CacheDir "$Id-attempt-$($run.run_attempt)-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $cache | Out-Null
    $bundle = Join-Path $cache 'release'
    Invoke-CampusNative 'gh' @('run', 'download', $Id, '--repo', 'bam-low/mgimo', '--name', $name, '--dir', $bundle) | Out-Null
    $validator = Join-Path $PSScriptRoot 'package.py'
    Invoke-CampusNative 'python' @($validator, 'verify', $bundle, '--target', $c.TargetFile) | Out-Null
    $manifest = Get-Content -LiteralPath (Join-Path $bundle 'app-release.json') -Raw | ConvertFrom-Json
    if ($manifest.sourceCommit -cne $run.head_sha -or $manifest.runId -cne $Id) { throw 'SHA или номер запуска не совпадает с пакетом.' }
    Write-Host "Проверен выпуск $($run.head_sha). Подпись существующим локальным ключом; PostgreSQL и tools не передаются."
    $sums = Join-Path $bundle 'SHA256SUMS'
    Invoke-CampusNative 'ssh-keygen' @('-Y', 'sign', '-f', $c.SigningKey, '-n', 'campus-app-update', $sums) | Out-Null
    Invoke-CampusNative 'python' @($validator, 'verify', $bundle, '--signers', $c.AllowedSigners) | Out-Null
    $token = [guid]::NewGuid().ToString('N')
    $sshArgs = @('-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$($c.KnownHosts)", '-o', 'IdentitiesOnly=yes', '-i', $c.SshKey)
    $destination = "$($c.User)@$($c.Host)"
    $remote = "$($c.Inbox)/$token"
    Invoke-CampusNative 'scp' (@('-P', "$($c.Port)") + $sshArgs + @('-r', $bundle, "${destination}:$remote")) | Out-Null
    # Fixed installed helper; no execution of scripts from the uploaded package. sudo may prompt.
    # TTY is for sudo only; do not print secrets or enable SSH debug logging.
    $result = (Invoke-CampusNative 'ssh' (@('-t', '-p', "$($c.Port)") + $sshArgs + @($destination, "sudo /usr/local/lib/campus-app-update/server.py apply $token")) -AllowedExitCodes @(0, 2)) -join "`n"
    $outcome = ConvertFrom-CampusResult $result
    $outcome | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $cache 'receipt.json') -Encoding utf8NoBOM
    if ($outcome.status -ceq 'ROLLED_BACK') { throw "Обновление не прошло, предыдущее приложение восстановлено. Квитанция: $cache" }
    if ($outcome.status -cnotin @('UPDATED', 'ALREADY_INSTALLED') -or -not $outcome.databaseUnchanged -or $outcome.sourceCommit -cne $run.head_sha) { throw 'Обновление не подтверждено; проверьте безопасный журнал сервера.' }
    if ($null -ne $outcome.PSObject.Properties['backup']) {
        if ($outcome.backup.file -cnotmatch '^campus-[0-9]{8}T[0-9]{6}Z.dump.age$' -or $outcome.backup.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Неверный результат backup.' }
        $backupPath = Join-Path $cache $outcome.backup.file
        Invoke-CampusNative 'scp' (@('-P', "$($c.Port)") + $sshArgs + @("${destination}:$($c.BackupExport)/$($outcome.backup.file)", $backupPath)) | Out-Null
        if ((Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $outcome.backup.sha256) { throw 'Приложение обновлено, но offsite-копия не проверена: SHA-256 не совпадает. Не повторяйте выкладку; сохраните серверную копию.' }
    }
    $outcome | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $cache 'receipt.json') -Encoding utf8NoBOM
    $label = if ($outcome.status -ceq 'UPDATED') { 'Обновлено' } else { 'Уже установлено' }
    Write-Host "Готово: $label, SHA $($outcome.sourceCommit). PostgreSQL не перезапускался. Подписанный пакет и квитанция: $cache"
    Write-Host 'Закрытый ключ подписи остался на вашем компьютере. Production GO этой командой не объявляется.'
}

if (-not $LibraryOnly) { Invoke-CampusUpdate $RunId $ConfigPath }

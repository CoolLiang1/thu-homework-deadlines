#Requires -Version 7.0
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

# Explicit allowlist: never package local diagnostics, browser data or dependencies.
$deliverableNames = @(
    'README.md',
    'package.json',
    'thu-homework-deadlines.user.js',
    'docs/安装与使用说明.md',
    'docs/验证记录.md',
    'docs/validation/2026-10-15/test-results.txt',
    'docs/validation/2026-10-15/layout-test-results.json',
    'tests/deadlines.test.cjs',
    'tests/pages.test.cjs',
    'tests/run-tests.cjs',
    'tests/browser-fixture.cjs',
    'tests/layout-browser.cjs',
    'tests/package.json',
    'tests/package-lock.json',
    'scripts/package.ps1',
    'tools/inspect-dom.js'
)
$checksums = foreach ($name in $deliverableNames) {
    $hash = Get-FileHash -LiteralPath (Join-Path $projectRoot $name) -Algorithm SHA256
    "$($hash.Hash.ToLowerInvariant())  $name"
}
$checksumPath = Join-Path $outputDirectory 'SHA256SUMS.txt'
Set-Content -LiteralPath $checksumPath -Value $checksums -Encoding utf8

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $outputDirectory 'thu-homework-deadlines.zip'
$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in $deliverableNames) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $projectRoot $name), $name
        ) | Out-Null
    }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $checksumPath, 'SHA256SUMS.txt'
    ) | Out-Null
}
finally { $archive.Dispose(); $zipStream.Dispose() }

$verified = 0
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName -notin ($deliverableNames + 'SHA256SUMS.txt')) {
            throw "Unexpected package entry: $($entry.FullName)"
        }
        $sourcePath = if ($entry.FullName -eq 'SHA256SUMS.txt') {
            $checksumPath
        } else {
            Join-Path $projectRoot $entry.FullName
        }
        $content = $entry.Open()
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try {
            $actual = [Convert]::ToHexString($algorithm.ComputeHash($content))
            if ($actual -ne (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash) {
                throw "ZIP checksum mismatch: $($entry.FullName)"
            }
            $verified++
        }
        finally { $content.Dispose(); $algorithm.Dispose() }
    }
    if ($verified -ne $deliverableNames.Count + 1) { throw 'ZIP entry count mismatch' }
}
finally { $archive.Dispose() }

Write-Output "Package entries verified against SHA256: $verified"
Write-Output "Output: $zipPath"

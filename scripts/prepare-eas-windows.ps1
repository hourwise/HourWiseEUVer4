[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $ProjectRoot

$AttributeRoots = @(
  'android',
  'assets',
  'scripts',
  'src',
  'supabase',
  'docs',
  'credentials',
  '.expo'
)

Write-Host 'Preparing Windows file attributes for EAS upload...'

foreach ($RelativePath in $AttributeRoots) {
  $FullPath = Join-Path $ProjectRoot $RelativePath
  if (!(Test-Path -LiteralPath $FullPath)) {
    continue
  }

  Write-Host "Clearing read-only attributes: $RelativePath"
  & attrib -R $FullPath /S /D
  & attrib -R (Join-Path $FullPath '*') /S /D
}

$GradleWrapper = Join-Path $ProjectRoot 'android\gradlew'
if (Test-Path -LiteralPath $GradleWrapper) {
  $Git = Get-Command git -ErrorAction SilentlyContinue
  if ($Git) {
    Write-Host 'Ensuring android/gradlew is executable in the Git index...'
    & git update-index --chmod=+x android/gradlew
  }
}

$Tar = Get-Command tar -ErrorAction SilentlyContinue
if (!$Tar) {
  Write-Warning 'tar was not found, so archive permission verification was skipped.'
  exit 0
}

$ArchiveRoots = @('android', 'assets', 'scripts', 'src') |
  Where-Object { Test-Path -LiteralPath (Join-Path $ProjectRoot $_) }

if ($ArchiveRoots.Count -eq 0) {
  Write-Warning 'No EAS archive roots were found to verify.'
  exit 0
}

$ArchivePath = Join-Path $env:TEMP "hourwise-eas-permissions-check-$PID.tar.gz"

try {
  if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
  }

  & tar -czf $ArchivePath @ArchiveRoots
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create the EAS permissions verification archive.'
  }

  $TarListing = & tar -tvf $ArchivePath
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to inspect the EAS permissions verification archive.'
  }

  $ReadOnlyDirectories = $TarListing | Where-Object {
    $_ -match '^d' -and $_ -notmatch '^d.w'
  }

  if ($ReadOnlyDirectories) {
    Write-Error "Read-only directories remain in the archive:`n$($ReadOnlyDirectories -join "`n")"
    exit 1
  }

  Write-Host 'EAS archive directory permissions look writable.'
} finally {
  if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
  }
}

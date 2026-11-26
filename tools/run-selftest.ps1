# Runs the browser self-test of the application-upload screen (needs Chrome).
# Usage: powershell -NoProfile -File tools\run-selftest.ps1 [-Stop rrn|result|undo-dialog] [-Shot path.png]
# Prints the page title (SELFTEST PASS n / FAIL n) and every FAIL line of the report.
param([string]$Stop = '', [string]$Shot = '', [string]$Kind = 'apply', [int]$Width = 1400, [switch]$Xss)
$root = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$html = Join-Path $env:TEMP 'ap_selftest.html'
$dom = Join-Path $env:TEMP 'ap_selftest_dom.html'
$buildArgs = @((Join-Path $root 'tools\build-preview.js'), $html, ('--screen=' + $(if ($Kind -ne 'apply') { $(if ($Kind -eq 'send') { 'send' } elseif ($Kind -eq 'admin') { 'sessions' } else { 'sess' }) } else { 'apply' })), ('--selftest=' + $Kind))
if ($Stop) { $buildArgs += "--stop=$Stop" }
if ($Xss) { $buildArgs += '--xss=1' }
& $node @buildArgs | Out-Null
Remove-Item $dom -ErrorAction SilentlyContinue
$url = 'file:///' + ($html -replace '\\', '/')
$errFile = Join-Path $env:TEMP 'ap_err.txt'
Start-Process -FilePath $chrome -ArgumentList @('--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', ("--window-size=$Width,1100"), '--dump-dom', $url) -RedirectStandardOutput $dom -RedirectStandardError $errFile -NoNewWindow -Wait | Out-Null
$d = [IO.File]::ReadAllText($dom, [Text.Encoding]::UTF8)
if ($d -match '<title>(.*?)</title>') { $Matches[1] }
if ($d -match '(?s)<pre id="__report"[^>]*>(.*?)</pre>') {
  $lines = [Net.WebUtility]::HtmlDecode($Matches[1]) -split "`n"
  $bad = $lines | Where-Object { $_.StartsWith('FAIL') }
  if ($bad) { $bad } else { 'no FAIL lines (' + $lines.Count + ' lines in report)' }
} else { 'NO REPORT' }
if ($Shot) {
  Start-Process -FilePath $chrome -ArgumentList @('--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=40000', '--window-size=1400,2000', "--screenshot=$Shot", $url) -RedirectStandardError (Join-Path $env:TEMP 'ap_err2.txt') -NoNewWindow -Wait | Out-Null
}

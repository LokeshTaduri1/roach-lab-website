# Regenerates the pre-rendered 3-D blood-cell sprite sheets in assets/cells/.
# Usage (from the project folder):  powershell -File tools/build-sprites.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$page = "file:///" + ((Join-Path $root "tools\build-sprites.html") -replace '\\', '/')
$ErrorActionPreference = "Continue"   # Edge writes harmless warnings to stderr
$dom = & $edge --headless=new --disable-gpu --allow-file-access-from-files --virtual-time-budget=60000 --dump-dom $page 2>$null | Out-String
$ErrorActionPreference = "Stop"
$m = [regex]::Match($dom, 'BEGIN(\{.*?\})END', 'Singleline')
if (-not $m.Success) { throw "Sprite build failed (no output)" }
$json = $m.Groups[1].Value | ConvertFrom-Json
$dir = Join-Path $root "assets\cells"
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($p in $json.PSObject.Properties) {
  $b64 = $p.Value -replace '^data:image/webp;base64,', ''
  $file = Join-Path $dir ($p.Name + ".webp")
  [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($b64))
  "{0,-12} {1,8:N0} bytes" -f ($p.Name + ".webp"), (Get-Item $file).Length
}

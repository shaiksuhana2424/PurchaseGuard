$ErrorActionPreference = "Stop"

$project = (Get-Location).Path
$matchingPath = Join-Path $project "src\matching.js"
$providersPath = Join-Path $project "src\providers.js"

if (!(Test-Path $matchingPath) -or !(Test-Path $providersPath)) {
  throw "Run this script from the PurchaseGuard-Deployment-Starter project folder."
}

$matching = Get-Content -Raw -Path $matchingPath
$providers = Get-Content -Raw -Path $providersPath

# Verify expected source before changing anything.
if ($matching -notmatch 'const STOP = new Set') { throw "Could not find STOP set in src/matching.js; no files changed." }
if ($matching -notmatch 'const ACCESSORY_PHRASES = \[') { throw "Could not find accessory phrase list; no files changed." }
if ($matching -notmatch 'const wanted = \[\.\.\.new Set\(tokens\(queryText\)\)\];') { throw "Could not find the expected query-token line; no files changed." }
if ($providers -notmatch 'match\.isAccessoryMismatch \|\|') { throw "Could not find the expected offer-validation check; no files changed." }

# Make phone/mobile generic query words ignorable and detect common accessory listing phrases.
$matching = $matching.Replace(
  '  "cover only", "case only", "screen protector", "not included",',
  '  "cover only", "case only", "screen protector", "screen guard", "tempered glass", "camera lens protector", "rugged armor", "armor case", "phone case", "phone cover", "mobile cover", "not included",'
)

$matching = $matching.Replace(
  '  "compatible", "accessory", "accessories", "screen", "guard"',
  '  "compatible", "accessory", "accessories"'
)

$matching = $matching.Replace(
  'const wanted = [...new Set(tokens(queryText))];',
  'const wanted = [...new Set(tokens(queryText).filter(token => !STOP.has(token)))];'
)

# Do not put non-exact/variant-review listings in the comparable price results.
$providers = $providers.Replace(
  '  match.isAccessoryMismatch ||
  match.missingCriticalTerms.length > 0',
  '  match.isAccessoryMismatch ||
  !match.exactMatch ||
  match.missingCriticalTerms.length > 0'
)

# Confirm the patch actually changed each expected section.
if ($matching -notmatch '"rugged armor"') { throw "Accessory phrase patch did not apply; no files written." }
if ($matching -notmatch 'tokens\(queryText\)\.filter\(token => !STOP\.has\(token\)\)') { throw "Generic-token patch did not apply; no files written." }
if ($providers -notmatch '!match\.exactMatch') { throw "Exact-match offer filter did not apply; no files written." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $matchingPath "$matchingPath.bak-$stamp"
Copy-Item $providersPath "$providersPath.bak-$stamp"

Set-Content -Path $matchingPath -Value $matching -Encoding utf8
Set-Content -Path $providersPath -Value $providers -Encoding utf8

Write-Host "Patch applied. Backups created with suffix: .bak-$stamp" -ForegroundColor Green
Write-Host "Next run: npm.cmd test" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Invoke-TestRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [string]$Body = "",
    [string]$ContentType = "application/json"
  )

  try {
    $params = @{
      Uri = $Uri
      Method = $Method
      Headers = $Headers
      UseBasicParsing = $true
    }
    if ($Method -ne "GET") {
      $params.Body = $Body
      $params.ContentType = $ContentType
    }
    $response = Invoke-WebRequest @params
    return @{ Status = [int]$response.StatusCode; Content = [string]$response.Content }
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw }
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try {
      return @{ Status = [int]$response.StatusCode; Content = $reader.ReadToEnd() }
    } finally {
      $reader.Dispose()
      $response.Dispose()
    }
  }
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $tempBase ("motu-security-" + [Guid]::NewGuid().ToString("N"))
$resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
if (-not $resolvedTestRoot.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($resolvedTestRoot)).StartsWith("motu-security-")) {
  throw "Refusing to use unsafe temporary path: $resolvedTestRoot"
}

$dbPath = (Join-Path $resolvedTestRoot "motu.db").Replace("\", "/")
$storagePath = Join-Path $resolvedTestRoot "storage"
$logPath = Join-Path $resolvedTestRoot "server.log"
New-Item -ItemType Directory -Path $storagePath -Force | Out-Null
Set-Content -LiteralPath (Join-Path $resolvedTestRoot "sentinel.txt") -Value "must-not-leak" -Encoding utf8

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$mockListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$mockListener.Start()
$mockPort = ([System.Net.IPEndPoint]$mockListener.LocalEndpoint).Port
$mockListener.Stop()

$env:DATABASE_URL = "file:$dbPath"
$env:STORAGE_ROOT = $storagePath
$env:APP_RUNTIME = "web"
$env:APP_SECRET = "test-only-app-secret-0123456789-abcdefghijklmnopqrstuvwxyz"
$env:ADMIN_SECRET = "test-only-admin-secret-0123456789"
$env:NODE_ENV = "production"
$env:PORT = [string]$port
$env:HOSTNAME = "127.0.0.1"
$env:AUTH_SERVER_URL = "http://127.0.0.1:$mockPort"
$env:MOTU_TEST_MOCK_PORT = [string]$mockPort
$server = $null
$mockServer = $null

try {
  npm run prisma:deploy | Out-Null

  $mockServer = Start-Process `
    -FilePath (Get-Command node).Source `
    -ArgumentList (Join-Path (Get-Location) "scripts\runtime-security-mock.cjs") `
    -WindowStyle Hidden `
    -PassThru

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = (Get-Command node).Source
  $startInfo.Arguments = "server.js"
  $startInfo.WorkingDirectory = (Join-Path (Get-Location) ".next\standalone")
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.EnvironmentVariables["DATABASE_URL"] = $env:DATABASE_URL
  $startInfo.EnvironmentVariables["STORAGE_ROOT"] = $env:STORAGE_ROOT
  $startInfo.EnvironmentVariables["APP_RUNTIME"] = $env:APP_RUNTIME
  $startInfo.EnvironmentVariables["APP_SECRET"] = $env:APP_SECRET
  $startInfo.EnvironmentVariables["ADMIN_SECRET"] = $env:ADMIN_SECRET
  $startInfo.EnvironmentVariables["NODE_ENV"] = $env:NODE_ENV
  $startInfo.EnvironmentVariables["PORT"] = $env:PORT
  $startInfo.EnvironmentVariables["HOSTNAME"] = $env:HOSTNAME
  $startInfo.EnvironmentVariables["AUTH_SERVER_URL"] = $env:AUTH_SERVER_URL
  $server = New-Object System.Diagnostics.Process
  $server.StartInfo = $startInfo
  if (-not $server.Start()) { throw "Failed to start isolated server" }

  $base = "http://127.0.0.1:$port"
  $ready = $false
  for ($index = 0; $index -lt 60; $index++) {
    try {
      $healthResponse = Invoke-TestRequest -Uri "$base/api/health"
      if ($healthResponse.Status -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Isolated server did not start. Logs: $logPath" }

  $health = (Invoke-TestRequest -Uri "$base/api/health").Content | ConvertFrom-Json
  if ($health.apiContract -ne "motu-api/v2" -or $health.workflowContract -ne "commerce-image-workflow/v2") {
    throw "Health contract mismatch"
  }
  if (-not $health.readiness.security.ready) {
    throw "Health readiness mismatch"
  }

  $anonymous = Invoke-TestRequest -Uri "$base/api/projects"
  if ($anonymous.Status -ne 401) { throw "Anonymous project list returned $($anonymous.Status)" }

  $loginBody = @{key="security-test-key-a";platform="web"} | ConvertTo-Json
  $loginResponse = Invoke-TestRequest -Uri "$base/api/auth/verify" -Method POST -Body $loginBody
  $login = $loginResponse.Content | ConvertFrom-Json
  $token = $login.data.sessionToken
  if (-not $token) { throw "Session token missing ($($loginResponse.Status)): $($loginResponse.Content)" }
  $authHeaders = @{Authorization="Bearer $token"}

  $projectABody = @{name="Project A";platform="taobao_tmall";style="food_health";mode="single"} | ConvertTo-Json
  $projectAResponse = Invoke-TestRequest -Uri "$base/api/projects" -Method POST -Headers $authHeaders -Body $projectABody
  if ($projectAResponse.Status -ne 201) { throw "Project A creation failed: $($projectAResponse.Content)" }
  $projectAId = (($projectAResponse.Content | ConvertFrom-Json).data).id

  $loginBBody = @{key="security-test-key-b";platform="web"} | ConvertTo-Json
  $loginBResponse = Invoke-TestRequest -Uri "$base/api/auth/verify" -Method POST -Body $loginBBody
  $tokenB = (($loginBResponse.Content | ConvertFrom-Json).data).sessionToken
  $projectBBody = @{name="Project B";platform="taobao_tmall";style="food_health";mode="single"} | ConvertTo-Json
  $projectBResponse = Invoke-TestRequest -Uri "$base/api/projects" -Method POST -Headers @{Authorization="Bearer $tokenB"} -Body $projectBBody
  if ($projectBResponse.Status -ne 201) { throw "Project B creation failed: $($projectBResponse.Content)" }
  $projectBId = (($projectBResponse.Content | ConvertFrom-Json).data).id

  $crossProject = Invoke-TestRequest -Uri "$base/api/projects/$projectBId" -Headers $authHeaders
  if ($crossProject.Status -ne 403) { throw "Cross-project request returned $($crossProject.Status)" }

  $traversalStatuses = @()
  foreach ($uri in @(
    "$base/api/files/..%2fpackage.json",
    "$base/api/files/uploads/$projectAId/..%2f..%2fsentinel.txt",
    "$base/api/files/uploads%2f$projectAId%2f..%2f..%2fsentinel.txt"
  )) {
    $response = Invoke-TestRequest -Uri $uri -Headers $authHeaders
    $traversalStatuses += $response.Status
    if ($response.Status -ne 400) { throw "Path traversal returned $($response.Status): $uri :: $($response.Content)" }
  }

  $wrongAdmin = Invoke-TestRequest -Uri "$base/api/providers" -Headers @{Authorization="Bearer $token";"x-admin-secret"="banana-admin"}
  if ($wrongAdmin.Status -ne 403) { throw "Default admin secret returned $($wrongAdmin.Status)" }

  $providerBody = @{
    name="Secret Provider"
    baseUrl="http://127.0.0.1:$mockPort/v1"
    apiKey="sk-plaintext-must-never-return"
    purpose="text"
    isActive=$true
  } | ConvertTo-Json
  $providerCreate = Invoke-TestRequest -Uri "$base/api/providers" -Method POST -Headers @{Authorization="Bearer $token";"x-admin-secret"=$env:ADMIN_SECRET} -Body $providerBody
  if ($providerCreate.Status -ne 200) { throw "Provider creation returned $($providerCreate.Status): $($providerCreate.Content)" }
  $providerResponse = Invoke-TestRequest -Uri "$base/api/providers" -Headers @{Authorization="Bearer $token";"x-admin-secret"=$env:ADMIN_SECRET}
  if ($providerResponse.Status -ne 200) { throw "Provider list returned $($providerResponse.Status)" }
  if ($providerResponse.Content -match "sk-plaintext-must-never-return" -or $providerResponse.Content -match "apiKeyEncrypted") {
    throw "Provider secret leaked"
  }

  $invalidBody = @{type="MAIN";fileName="bad.png";mimeType="image/png";base64Data="not base64!!"} | ConvertTo-Json
  $invalidUpload = Invoke-TestRequest -Uri "$base/api/projects/$projectAId/assets/upload" -Method POST -Headers $authHeaders -Body $invalidBody
  if ($invalidUpload.Status -ne 400) { throw "Invalid Base64 returned $($invalidUpload.Status)" }

  $pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII="
  $mismatchBody = @{type="MAIN";fileName="pixel.jpg";mimeType="image/jpeg";base64Data=$pngBase64} | ConvertTo-Json
  $mismatchUpload = Invoke-TestRequest -Uri "$base/api/projects/$projectAId/assets/upload" -Method POST -Headers $authHeaders -Body $mismatchBody
  if ($mismatchUpload.Status -ne 400) { throw "MIME mismatch returned $($mismatchUpload.Status)" }

  $validBody = @{type="MAIN";fileName="pixel.png";mimeType="image/png";base64Data=$pngBase64} | ConvertTo-Json
  $firstUpload = Invoke-TestRequest -Uri "$base/api/projects/$projectAId/assets/upload" -Method POST -Headers $authHeaders -Body $validBody
  if ($firstUpload.Status -ne 201) { throw "Valid upload returned $($firstUpload.Status): $($firstUpload.Content)" }
  $firstPayload = $firstUpload.Content | ConvertFrom-Json
  $assetAId = $firstPayload.data.id
  $assetAPath = ([string]$firstPayload.data.filePath).Replace("\", "/")
  $crossAsset = Invoke-TestRequest -Uri "$base/api/assets/$assetAId/score" -Headers @{Authorization="Bearer $tokenB"}
  if ($crossAsset.Status -ne 403) { throw "Cross-asset request returned $($crossAsset.Status)" }
  $crossAssetFile = Invoke-TestRequest -Uri "$base/api/files/$assetAPath" -Headers @{Authorization="Bearer $tokenB"}
  if ($crossAssetFile.Status -ne 403) { throw "Cross-asset file request returned $($crossAssetFile.Status)" }

  $secondUpload = Invoke-TestRequest -Uri "$base/api/projects/$projectAId/assets/upload" -Method POST -Headers $authHeaders -Body $validBody
  $secondPayload = $secondUpload.Content | ConvertFrom-Json
  if ($secondUpload.Status -ne 200 -or -not $secondPayload.data.deduplicated) { throw "Duplicate upload was not reused" }

  $heroABase = Join-Path $storagePath "hero-batch\access-a"
  $heroBBase = Join-Path $storagePath "hero-batch\access-b"
  New-Item -ItemType Directory -Path $heroABase -Force | Out-Null
  New-Item -ItemType Directory -Path $heroBBase -Force | Out-Null
  [System.IO.File]::WriteAllBytes((Join-Path $heroABase "hero-a.png"), [Convert]::FromBase64String($pngBase64))
  [System.IO.File]::WriteAllBytes((Join-Path $heroBBase "hero-b.png"), [Convert]::FromBase64String($pngBase64))

  $historyA = Invoke-TestRequest -Uri "$base/api/hero-batch/history" -Headers $authHeaders
  $historyAPayload = $historyA.Content | ConvertFrom-Json
  if ($historyA.Status -ne 200 -or $historyAPayload.data.total -ne 1 -or $historyAPayload.data.items[0].id -ne "hero-a.png") {
    throw "Hero history A was not isolated: $($historyA.Content)"
  }
  $historyB = Invoke-TestRequest -Uri "$base/api/hero-batch/history" -Headers @{Authorization="Bearer $tokenB"}
  $historyBPayload = $historyB.Content | ConvertFrom-Json
  if ($historyB.Status -ne 200 -or $historyBPayload.data.total -ne 1 -or $historyBPayload.data.items[0].id -ne "hero-b.png") {
    throw "Hero history B was not isolated: $($historyB.Content)"
  }
  $ownHeroFile = Invoke-TestRequest -Uri "$base/api/files/hero-batch/hero-a.png" -Headers $authHeaders
  if ($ownHeroFile.Status -ne 200) { throw "Owned hero file returned $($ownHeroFile.Status)" }
  $crossHeroFile = Invoke-TestRequest -Uri "$base/api/files/hero-batch/hero-a.png" -Headers @{Authorization="Bearer $tokenB"}
  if ($crossHeroFile.Status -ne 404) { throw "Cross-owner hero file returned $($crossHeroFile.Status)" }

  $sceneAResponse = Invoke-TestRequest -Uri "$base/api/hero-scenes" -Method POST -Headers $authHeaders -Body (@{
    name="Private Scene A";category="security";scenePrompt="Scene A only";isDefault=$true
  } | ConvertTo-Json)
  if ($sceneAResponse.Status -ne 200) { throw "Scene A creation failed: $($sceneAResponse.Content)" }
  $sceneAPayload = $sceneAResponse.Content | ConvertFrom-Json
  $sceneAId = $sceneAPayload.data.id
  if ($sceneAPayload.data.isDefault) { throw "Web session was allowed to create a global default scene" }
  $sceneBResponse = Invoke-TestRequest -Uri "$base/api/hero-scenes" -Method POST -Headers @{Authorization="Bearer $tokenB"} -Body (@{
    name="Private Scene B";category="security";scenePrompt="Scene B only"
  } | ConvertTo-Json)
  if ($sceneBResponse.Status -ne 200) { throw "Scene B creation failed: $($sceneBResponse.Content)" }
  $sceneListA = Invoke-TestRequest -Uri "$base/api/hero-scenes?category=security" -Headers $authHeaders
  if ($sceneListA.Status -ne 200 -or $sceneListA.Content -notmatch "Private Scene A" -or $sceneListA.Content -match "Private Scene B") {
    throw "Scene library A was not isolated: $($sceneListA.Content)"
  }
  $crossSceneMutation = Invoke-TestRequest -Uri "$base/api/hero-scenes?id=$sceneAId" -Method PATCH -Headers @{Authorization="Bearer $tokenB"} -Body (@{name="Hijacked"} | ConvertTo-Json)
  if ($crossSceneMutation.Status -ne 404) { throw "Cross-owner scene mutation returned $($crossSceneMutation.Status)" }

  $copyAResponse = Invoke-TestRequest -Uri "$base/api/hero-copies" -Method POST -Headers $authHeaders -Body (@{
    name="Private Copy A";category="security";copies=@("Copy A only")
  } | ConvertTo-Json)
  if ($copyAResponse.Status -ne 200) { throw "Copy A creation failed: $($copyAResponse.Content)" }
  $copyAId = (($copyAResponse.Content | ConvertFrom-Json).data).id
  $copyBResponse = Invoke-TestRequest -Uri "$base/api/hero-copies" -Method POST -Headers @{Authorization="Bearer $tokenB"} -Body (@{
    name="Private Copy B";category="security";copies=@("Copy B only")
  } | ConvertTo-Json)
  if ($copyBResponse.Status -ne 200) { throw "Copy B creation failed: $($copyBResponse.Content)" }
  $copyListA = Invoke-TestRequest -Uri "$base/api/hero-copies?category=security" -Headers $authHeaders
  if ($copyListA.Status -ne 200 -or $copyListA.Content -notmatch "Private Copy A" -or $copyListA.Content -match "Private Copy B") {
    throw "Copy library A was not isolated: $($copyListA.Content)"
  }
  $crossCopyMutation = Invoke-TestRequest -Uri "$base/api/hero-copies?id=$copyAId" -Method PATCH -Headers @{Authorization="Bearer $tokenB"} -Body (@{name="Hijacked"} | ConvertTo-Json)
  if ($crossCopyMutation.Status -ne 404) { throw "Cross-owner copy mutation returned $($crossCopyMutation.Status)" }

  $workflowABody = @{
    productName="Workflow Product A"
    sourceImageUrl="data:image/png;base64,$pngBase64"
    autoStart=$false
  } | ConvertTo-Json
  $workflowAResponse = Invoke-TestRequest -Uri "$base/api/hero-workflows" -Method POST -Headers $authHeaders -Body $workflowABody
  if ($workflowAResponse.Status -ne 200) { throw "Workflow A creation failed: $($workflowAResponse.Content)" }
  $workflowAId = (($workflowAResponse.Content | ConvertFrom-Json).data).id

  $workflowBBody = @{
    productName="Workflow Product B"
    sourceImageUrl="data:image/png;base64,$pngBase64"
    autoStart=$false
  } | ConvertTo-Json
  $workflowBResponse = Invoke-TestRequest -Uri "$base/api/hero-workflows" -Method POST -Headers @{Authorization="Bearer $tokenB"} -Body $workflowBBody
  if ($workflowBResponse.Status -ne 200) { throw "Workflow B creation failed: $($workflowBResponse.Content)" }

  $workflowListA = Invoke-TestRequest -Uri "$base/api/hero-workflows" -Headers $authHeaders
  $workflowListAPayload = $workflowListA.Content | ConvertFrom-Json
  if ($workflowListA.Status -ne 200 -or $workflowListAPayload.data.Count -ne 1 -or $workflowListAPayload.data[0].productName -ne "Workflow Product A") {
    throw "Workflow list A was not isolated: $($workflowListA.Content)"
  }
  $workflowListB = Invoke-TestRequest -Uri "$base/api/hero-workflows" -Headers @{Authorization="Bearer $tokenB"}
  $workflowListBPayload = $workflowListB.Content | ConvertFrom-Json
  if ($workflowListB.Status -ne 200 -or $workflowListBPayload.data.Count -ne 1 -or $workflowListBPayload.data[0].productName -ne "Workflow Product B") {
    throw "Workflow list B was not isolated: $($workflowListB.Content)"
  }
  $crossWorkflow = Invoke-TestRequest -Uri "$base/api/hero-workflows/$workflowAId" -Headers @{Authorization="Bearer $tokenB"}
  if ($crossWorkflow.Status -ne 404 -or $crossWorkflow.Content -match "Workflow Product A") {
    throw "Cross-owner workflow leaked: $($crossWorkflow.Status) :: $($crossWorkflow.Content)"
  }

  $sceneABase = Join-Path $storagePath "hero-scene\access-a\generations"
  $sceneBBase = Join-Path $storagePath "hero-scene\access-b\generations"
  New-Item -ItemType Directory -Path $sceneABase -Force | Out-Null
  New-Item -ItemType Directory -Path $sceneBBase -Force | Out-Null
  [System.IO.File]::WriteAllBytes((Join-Path $sceneABase "scene-a.png"), [Convert]::FromBase64String($pngBase64))
  [System.IO.File]::WriteAllBytes((Join-Path $sceneBBase "scene-b.png"), [Convert]::FromBase64String($pngBase64))
  $ownSceneFile = Invoke-TestRequest -Uri "$base/api/files/hero-scene/generations/scene-a.png" -Headers $authHeaders
  if ($ownSceneFile.Status -ne 200) { throw "Owned scene file returned $($ownSceneFile.Status)" }
  $crossSceneFile = Invoke-TestRequest -Uri "$base/api/files/hero-scene/generations/scene-a.png" -Headers @{Authorization="Bearer $tokenB"}
  if ($crossSceneFile.Status -ne 404) { throw "Cross-owner scene file returned $($crossSceneFile.Status)" }

  $privateDir = Join-Path $storagePath "private"
  New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $privateDir "secret.txt") -Value "private" -Encoding utf8
  $unknownStorage = Invoke-TestRequest -Uri "$base/api/files/private/secret.txt" -Headers $authHeaders
  if ($unknownStorage.Status -ne 403) { throw "Unknown storage root returned $($unknownStorage.Status)" }

  [pscustomobject]@{
    valid = $true
    anonymousStatus = $anonymous.Status
    crossProjectStatus = $crossProject.Status
    crossAssetStatus = $crossAsset.Status
    crossAssetFileStatus = $crossAssetFile.Status
    heroHistoryCountA = $historyAPayload.data.total
    heroHistoryCountB = $historyBPayload.data.total
    crossHeroFileStatus = $crossHeroFile.Status
    crossSceneMutationStatus = $crossSceneMutation.Status
    crossCopyMutationStatus = $crossCopyMutation.Status
    workflowCountA = $workflowListAPayload.data.Count
    workflowCountB = $workflowListBPayload.data.Count
    crossWorkflowStatus = $crossWorkflow.Status
    crossSceneFileStatus = $crossSceneFile.Status
    unknownStorageStatus = $unknownStorage.Status
    traversalStatuses = $traversalStatuses
    defaultAdminStatus = $wrongAdmin.Status
    invalidBase64Status = $invalidUpload.Status
    mimeMismatchStatus = $mismatchUpload.Status
    firstUploadStatus = $firstUpload.Status
    duplicateUploadStatus = $secondUpload.Status
    providerSecretLeaked = $false
  } | ConvertTo-Json -Depth 5
} finally {
  if ($server -and -not $server.HasExited) {
    $server.Kill()
    $server.WaitForExit()
  }
  if ($mockServer -and -not $mockServer.HasExited) {
    Stop-Process -Id $mockServer.Id -Force -ErrorAction SilentlyContinue
    $mockServer.WaitForExit()
  }
  $cleanupPath = [System.IO.Path]::GetFullPath($resolvedTestRoot)
  if ($cleanupPath.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -and
      ([System.IO.Path]::GetFileName($cleanupPath)).StartsWith("motu-security-")) {
    Remove-Item -LiteralPath $cleanupPath -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Warning "Skipped unsafe cleanup path: $cleanupPath"
  }
}

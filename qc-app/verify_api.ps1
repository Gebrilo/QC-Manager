$BaseUrl = "http://localhost:3001"

Write-Host "--- API Verification Script ---" -ForegroundColor Cyan

# 1. Health Check
Write-Host "`n[1] Checking Health Endpoint..."
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
    Write-Host "Success: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}

# 2. Project Creation
Write-Host "`n[2] Creating Project..."
$projectBody = @{
    name = "API Verification Project"
    project_id = "PRJ-999"
    description = "Test project created by script"
    priority = "High"
    total_weight = 5
    start_date = (Get-Date).ToString("yyyy-MM-dd")
} | ConvertTo-Json

try {
    $project = Invoke-RestMethod -Uri "$BaseUrl/projects" -Method Post -Body $projectBody -ContentType "application/json"
    Write-Host "Success: Created Project ID $($project.project_id) (UUID: $($project.id))" -ForegroundColor Green
    $Global:ProjectUUID = $project.id
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    # Try to find existing if conflict
    try {
        $projects = Invoke-RestMethod -Uri "$BaseUrl/projects" -Method Get
        $found = $projects | Where-Object { $_.project_id -eq "PRJ-999" }
        if ($found) {
            Write-Host "Found existing project: $($found.id)" -ForegroundColor Yellow
            $Global:ProjectUUID = $found.id
        }
    } catch {}
}

# 3. Resource Creation
Write-Host "`n[3] Creating Resource..."
$resourceBody = @{
    name = "Test Resource"
    role = "Tester"
    weekly_capacity_hrs = 40
    email = "test@example.com"
} | ConvertTo-Json

try {
    $resource = Invoke-RestMethod -Uri "$BaseUrl/resources" -Method Post -Body $resourceBody -ContentType "application/json"
    Write-Host "Success: Created Resource $($resource.name) (UUID: $($resource.id))" -ForegroundColor Green
    $Global:ResourceUUID = $resource.id
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    try {
        $resources = Invoke-RestMethod -Uri "$BaseUrl/resources" -Method Get
        $Global:ResourceUUID = $resources[0].id
        Write-Host "Using existing resource: $($Global:ResourceUUID)" -ForegroundColor Yellow
    } catch {}
}

# 4. Task Creation
if ($Global:ProjectUUID -and $Global:ResourceUUID) {
    Write-Host "`n[4] Creating Task..."
    $taskBody = @{
        task_id = "TSK-999"
        project_id = $Global:ProjectUUID
        task_name = "Verify API Task"
        description = "Created via PowerShell script"
        resource1_uuid = $Global:ResourceUUID
        status = "Backlog"
        estimate_days = 2
        r1_estimate_hrs = 16
    } | ConvertTo-Json

    try {
        $task = Invoke-RestMethod -Uri "$BaseUrl/tasks" -Method Post -Body $taskBody -ContentType "application/json"
        Write-Host "Success: Created Task $($task.task_id) (UUID: $($task.id))" -ForegroundColor Green
    } catch {
        Write-Host "Failed: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Skipping Task Creation (Missing Project or Resource UUID)" -ForegroundColor Red
}

Write-Host "`n--- Verification Complete ---" -ForegroundColor Cyan

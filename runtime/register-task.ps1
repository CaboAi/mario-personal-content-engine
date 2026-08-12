$ErrorActionPreference = "Stop"

$TaskName = "MarioPersonalInstagramSavesSync"
$RuntimeDir = "C:\Users\mario\projects\mario-personal-content-engine\runtime"
$Pythonw = "C:\Users\mario\AppData\Local\Programs\Python\Python313\pythonw.exe"
$SyncScript = Join-Path $RuntimeDir "sync.py"

if (-not (Test-Path -LiteralPath $Pythonw)) {
    throw "Windowless Python executable not found: $Pythonw"
}
if (-not (Test-Path -LiteralPath $SyncScript)) {
    throw "Sync script not found: $SyncScript"
}
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeDir "config.json"))) {
    throw "Private runtime config is missing."
}

$Arguments = "`"$SyncScript`" --all-saves"
$Action = New-ScheduledTaskAction `
    -Execute $Pythonw `
    -Argument $Arguments `
    -WorkingDirectory $RuntimeDir

$Morning = New-ScheduledTaskTrigger -Daily -At 9:00AM
$Evening = New-ScheduledTaskTrigger -Daily -At 9:00PM
$Settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($Morning, $Evening) `
    -Settings $Settings `
    -Description "Sync @mario_polancojr Instagram saves to the Mario Content Engine dashboard at 9 AM and 9 PM; optionally mirror to Notion." `
    -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName

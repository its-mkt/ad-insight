# ad-insight — GFA 무인 동기화 Windows 작업 스케줄러 등록 스크립트
# 관리자 권한으로 실행하면 매일 오전 06:00에 무인 동기화 스크립트가 자동 실행됩니다.

$TaskName = "AdInsight-GFA-Sync"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = (Get-Command node).Source
$TargetScript = Join-Path $ScriptDir "sync-gfa.js"

if (-not (Test-Path $TargetScript)) {
    Write-Error "sync-gfa.js 파일을 찾을 수 없습니다: $TargetScript"
    exit 1
}

# 작업 동작 (Action): node.exe scripts\sync-gfa.js 실행
$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$TargetScript`"" -WorkingDirectory $ScriptDir

# 트리거 (Trigger): 매일 오전 06:00 실행
$Trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM

# 설정 (Settings): 배터리/절전 모드 깨우기, 중복 방지
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable

# 기존 작업이 있으면 삭제 후 재등록
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "ad-insight 네이버 GFA 무인 자동 동기화 작업"

Write-Host "✅ [$TaskName] 매일 오전 06:00 무인 자동 동기화 작업 스케줄러 등록 완료!" -ForegroundColor Green

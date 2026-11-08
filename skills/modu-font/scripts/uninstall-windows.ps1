# install-user-font.ps1 로 깐 사용자별 글꼴을 지운다: 레지스트리 값 → RemoveFontResource → WM_FONTCHANGE → 파일.
# pwsh -File uninstall-user-font.ps1 "<레지스트리 이름>" ["<이름 2>" ...]
# 파일이 다른 프로그램(켜 둔 Word 등)에 잡혀 있으면 지우지 못한다 — 그 프로그램을 끈 뒤 다시 돌린다.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RegNames)
$ErrorActionPreference = "Stop"
$key = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
$dir = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
Add-Type -Namespace W -Name U -MemberDefinition @"
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool RemoveFontResourceW(string f);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
"@
foreach ($n in $RegNames) {
  $p = (Get-ItemProperty -Path $key -Name $n -ErrorAction SilentlyContinue).$n
  if (-not $p) { "없음: $n"; continue }
  # 사용자 글꼴 폴더 안의 파일만 지운다(다른 곳을 가리키면 레지스트리만 정리)
  Remove-ItemProperty -Path $key -Name $n
  while ([W.U]::RemoveFontResourceW($p)) { }
  $inDir = [System.IO.Path]::GetDirectoryName($p) -eq $dir
  $del = "파일 둠"
  if ($inDir -and (Test-Path -LiteralPath $p)) {
    try { Remove-Item -LiteralPath $p -Force; $del = "파일 지움" } catch { $del = "파일 못 지움(사용 중): $p" }
  }
  "지움: $n · $del"
}
$r = [IntPtr]::Zero
[W.U]::SendMessageTimeoutW([IntPtr]0xffff, 0x1D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 3000, [ref]$r) | Out-Null

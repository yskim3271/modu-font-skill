# 글꼴 파일을 이 사용자 계정에만 설치한다(관리자 권한 없이 — Windows 10 1809+ 의 사용자별 글꼴 자리).
# pwsh -File install-user-font.ps1 <ttf> "<레지스트리 이름, 예: Toon Hand A1 Regular (TrueType)>"
# 1) %LOCALAPPDATA%\Microsoft\Windows\Fonts 로 복사  2) HKCU ...\Fonts 에 등록(다시 로그인해도 남음)
# 3) AddFontResource + WM_FONTCHANGE 로 지금 세션에도 바로 알린다(이미 켜 둔 Word 는 다시 켜야 목록에 뜬다).
param([string]$Ttf, [string]$RegName)
$ErrorActionPreference = "Stop"
$src = (Resolve-Path $Ttf).Path
$dir = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
$dst = Join-Path $dir (Split-Path $src -Leaf)
Copy-Item -LiteralPath $src -Destination $dst -Force
$key = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
New-ItemProperty -Path $key -Name $RegName -Value $dst -PropertyType String -Force | Out-Null
Add-Type -Namespace W -Name F -MemberDefinition @"
[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResourceW(string f);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeoutW(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
"@
$n = [W.F]::AddFontResourceW($dst)
$r = [IntPtr]::Zero
[W.F]::SendMessageTimeoutW([IntPtr]0xffff, 0x1D, [IntPtr]::Zero, [IntPtr]::Zero, 2, 3000, [ref]$r) | Out-Null
"copied $dst · registry '$RegName' · AddFontResource $n"

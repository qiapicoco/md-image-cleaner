; ---------------------------------------------------------------
; MD Image Cleaner —— 安装程序脚本（NSIS 3.x / Unicode）
;
; 设计要点：
;  1. 默认装在「第一个非 C 盘的固定磁盘」根目录，例如 D:\MDImageCleaner。
;     只有 C 盘时退回 %LOCALAPPDATA%\Programs\MDImageCleaner
;     （C 盘根目录普通用户写不进去，装那里必然失败）。
;  2. 程序只有一个 exe，不写注册表业务数据、不联网、不留后台进程；
;     安装目录里的 exe 就是全部内容，直接拷走也能用（绿色版）。
;  3. 卸载就是删目录，不涉及用户文档 —— 它只读/移动你自己的 .assets 文件夹。
; ---------------------------------------------------------------
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define APPNAME     "MD Image Cleaner"
!define APPCN       "Markdown 未引用图片清理"
!define APPDIRNAME  "MDImageCleaner"
!define APPVER      "2.0.0"
!define APPEXE      "MDImageCleaner.exe"
!define WNDCLASS    "MDImageCleanerWnd"
!define PUBLISHER   "qiapicoco"
!define REGKEY      "Software\Microsoft\Windows\CurrentVersion\Uninstall\MDImageCleaner"

Name "${APPNAME} ${APPVER}"
OutFile "..\dist\MDImageCleaner_v2.0.0_安装版.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPDIRNAME}"
RequestExecutionLevel user
; MUI2 的界面是按 96 DPI 摆的：声明 DPI 感知后窗口被放大而控件不跟着放大，
; 正文会挤成一团。交给系统统一缩放，布局始终是对的。
ManifestDPIAware false
SetCompressor /SOLID lzma
SetCompressorDictSize 32
BrandingText "${APPNAME} ${APPVER}  ·  ${PUBLISHER}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "2.0.0.0"
VIAddVersionKey /LANG=2052 "ProductName"     "${APPNAME}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APPNAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion"     "${APPVER}"
VIAddVersionKey /LANG=2052 "ProductVersion"  "${APPVER}"
VIAddVersionKey /LANG=2052 "CompanyName"     "${PUBLISHER}"
VIAddVersionKey /LANG=2052 "LegalCopyright"  "${PUBLISHER}"

; ---------------- 外观 ----------------
!define MUI_ICON   "..\res\app.ico"
!define MUI_UNICON "..\res\app.ico"
!define MUI_ABORTWARNING

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "setup_header.bmp"
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_WELCOMEFINISHPAGE_BITMAP "setup_side.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "setup_wizard.bmp"
!define MUI_INSTFILESPAGE_PROGRESSBAR colored

!define MUI_WELCOMEPAGE_TITLE "${APPNAME}"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "把「${APPNAME}」（${APPCN}）装到你的电脑。$\r$\n$\r$\n一个单文件小工具：找出 Markdown 里没被引用的图片，先给你看缩略图，确认后再移到 .assets 的 deleted_images 里。$\r$\n$\r$\n支持 Typora / Obsidian / VSCode 等所有用 xxx.assets 存图的写法。全程本地运行，不联网。$\r$\n$\r$\n点「下一步」继续。"

!define MUI_DIRECTORYPAGE_TEXT_TOP "装到这里。程序只有一个 exe，装完整个目录拷到 U 盘也能直接用。$\r$\n$\r$\n想换位置点「浏览」。"

!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "已安装到：$\r$\n$INSTDIR$\r$\n$\r$\n桌面和开始菜单里都有快捷方式。$\r$\n以后想清理图片，把 .md 文件拖到 exe 上也能直接跑。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行 ${APPNAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\使用说明.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "打开使用说明"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

!define MUI_UNCONFIRMPAGE_TEXT_TOP "将移除「${APPNAME}」。$\r$\n$\r$\n注意：已经清理过的图片在 .assets\deleted_images 里，卸载不会动它们。"

!define MUI_CUSTOMFUNCTION_GUIINIT GuiInitCenter

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "SimpChinese"

; ---------------- 挑默认安装盘 ----------------
; D~Z 里第一个「固定磁盘」（GetDriveType 返回 3）。光驱、U 盘、虚拟盘都不算。
Function PickInstallDir
  StrCpy $R8 "DEFGHIJKLMNOPQRSTUVWXYZ"
  StrCpy $R7 0
  StrCpy $R3 ""
pick_loop:
  StrCpy $R6 $R8 1 $R7
  StrCmp $R6 "" pick_none
  StrCpy $R5 "$R6:"
  StrCpy $R5 "$R5\"
  System::Call "kernel32::GetDriveTypeA(m R5) i .R4"
  StrCmp $R4 "3" 0 pick_next
  IfFileExists "$R5*.*" 0 pick_next
  StrCpy $R3 $R6
  Goto pick_none
pick_next:
  IntOp $R7 $R7 + 1
  Goto pick_loop
pick_none:
  StrCmp $R3 "" 0 pick_ok
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${APPDIRNAME}"
  Return
pick_ok:
  StrCpy $INSTDIR "$R3:\${APPDIRNAME}"
FunctionEnd

; ---------------- 安装 ----------------
; exe 正在跑的时候文件被占用，装不进去 —— 先请它退出。
; 用窗口类名认（纯 ASCII），不数进程：进程名带中文，tasklist 会跟编码打架。
!macro QuitIfRunning from
  FindWindow $0 "${WNDCLASS}" ""
  StrCmp $0 0 quit_done_${from}
  IfFileExists "$INSTDIR\${APPEXE}" 0 quit_done_${from}
  ; 先礼：给 UI 线程发 WM_CLOSE，让它自己正常关
  System::Call "user32::PostMessage(p r0, i 0x0010, i 0, i 0)"
  Sleep 800
  FindWindow $0 "${WNDCLASS}" ""
  StrCmp $0 0 quit_done_${from}
  ; 后兵：按 PID 强杀（/PID 是纯数字，绕开中文进程名）
  System::Call "user32::GetWindowThreadProcessId(p r0, *i .r3) i .r1"
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /PID $3'
  Pop $0
  Sleep 800
  FindWindow $0 "${WNDCLASS}" ""
  StrCmp $0 0 quit_done_${from}
  IfSilent quit_done_${from}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
    "「${APPNAME}」还在运行，文件被占用，装不进去。$\r$\n$\r$\n请先关掉它的窗口，然后点「重试」。" \
    IDRETRY quit_done_${from}
  Quit
quit_done_${from}:
!macroend

Function .onInit
  ; /S /D=xxx 静默安装时 installer 已经把 $INSTDIR 设成命令行给的值（/D 不会出现在
  ; GetParameters 里），此时它必然不等于 InstallDir 的编译期默认值 —— 那就尊重它，
  ; 不要再用 PickInstallDir 覆盖掉。批量部署 / 装机脚本都靠这个。
  StrCmp $INSTDIR "$LOCALAPPDATA\Programs\${APPDIRNAME}" 0 dir_ready

  ReadRegStr $0 HKCU "${REGKEY}" "InstallLocation"
  StrCmp $0 "" pick
  IfFileExists "$0\${APPEXE}" 0 pick
  StrCpy $INSTDIR $0
  Goto dir_ready
pick:
  Call PickInstallDir
dir_ready:
  !insertmacro QuitIfRunning init
FunctionEnd

; 向导摆到屏幕正中
Function GuiInitCenter
  StrCpy $R0 $HWNDPARENT
  System::Call '*(i 0, i 0, i 0, i 0) p .R1'
  System::Call 'user32::GetWindowRect(p R0, p R1)'
  System::Call '*R1(i .R2, i .R3, i .R4, i .R5)'
  System::Free $R1
  IntOp $R6 $R4 - $R2
  IntOp $R7 $R5 - $R3
  System::Call 'user32::GetSystemMetrics(i 0) i .R8'
  System::Call 'user32::GetSystemMetrics(i 1) i .R9'
  IntOp $R8 $R8 - $R6
  IntOp $R9 $R9 - $R7
  IntOp $R8 $R8 / 2
  IntOp $R9 $R9 / 2
  StrCmp $R6 "0" done_center
  System::Call 'user32::SetWindowPos(p R0, p 0, i R8, i R9, i 0, i 0, i 0x15)'
done_center:
FunctionEnd

Function un.onInit
  ; WriteUninstaller 会把安装时的 $INSTDIR 直接写进卸载器，正常情况直接可用。
  ; 只有卸载器被单独拷贝到别处执行（$INSTDIR 为空）时，才回查注册表兜底 ——
  ; 不能无条件用注册表覆盖，否则注册表项先被清掉时会去删一个空路径。
  StrCmp $INSTDIR "" 0 un_dir_ok
  ReadRegStr $0 HKCU "${REGKEY}" "InstallLocation"
  StrCmp $0 "" 0 un_use_reg
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${APPDIRNAME}"
  Goto un_dir_ok
un_use_reg:
  StrCpy $INSTDIR $0
un_dir_ok:
  !insertmacro QuitIfRunning un
FunctionEnd

Section "主程序" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"

  DetailPrint "正在复制程序文件…"
  File "..\dist\${APPEXE}"
  File "使用说明.txt"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  DetailPrint "正在创建快捷方式…"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk" "$INSTDIR\uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\${APPEXE}" 0

  DetailPrint "正在登记卸载信息…"
  WriteRegStr   HKCU "${REGKEY}" "DisplayName"     "${APPNAME}"
  WriteRegStr   HKCU "${REGKEY}" "DisplayVersion"  "${APPVER}"
  WriteRegStr   HKCU "${REGKEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKCU "${REGKEY}" "DisplayIcon"     "$INSTDIR\${APPEXE}"
  WriteRegStr   HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${REGKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr   HKCU "${REGKEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" "$0"
SectionEnd

; ---------------- 卸载 ----------------
Section "Uninstall"
  SetShellVarContext current

  DetailPrint "正在删除快捷方式…"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk"
  RMDir  "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  DeleteRegKey HKCU "${REGKEY}"

  DetailPrint "正在删除程序文件…"
  Delete "$INSTDIR\${APPEXE}"
  Delete "$INSTDIR\使用说明.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd

; Masar Time School — Windows installer (built on Linux with native makensis).
; Admin install: the devices push punches to this PC, so Windows Firewall gets an
; inbound rule for the program, and it starts with Windows (a school PC that
; restarted must keep receiving). Arabic UI, desktop + Start menu shortcuts,
; uninstaller. The school's data lives in %APPDATA%\Masar Time School and is NOT
; removed on uninstall.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel admin

!define APPNAME "Masar Time School"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define SRC "..\dist\win-unpacked"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MasarTimeSchool"

Name "${APPNAME}"
OutFile "..\dist\Masar-Time-School-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "Software\${APPNAME}" "InstallDir"
BrandingText "${APPNAME} ${VERSION}"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPNAME}.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Arabic"
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_ENGLISH} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_ENGLISH} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_ENGLISH} "CompanyName" "Masar"
VIAddVersionKey /LANG=${LANG_ENGLISH} "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=${LANG_ENGLISH} "LegalCopyright" "Masar"

Section "Install"
  ; close a running copy so its files can be replaced on upgrade
  nsExec::Exec 'taskkill /F /IM "${APPNAME}.exe"'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "/oname=$INSTDIR\app.ico" "..\build\icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\app.ico"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\إزالة ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\app.ico"
  ; starts with Windows for every user of this PC
  SetShellVarContext all
  CreateShortcut "$SMSTARTUP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\app.ico"
  SetShellVarContext current
  ; the devices connect IN to this program (live punches)
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="${APPNAME}" dir=in action=allow program="$INSTDIR\${APPNAME}.exe" enable=yes profile=any'
  WriteRegStr HKLM "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Masar"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APPNAME}.exe"'
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  SetShellVarContext all
  Delete "$SMSTARTUP\${APPNAME}.lnk"
  SetShellVarContext current
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${APPNAME}"'
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APPNAME}"
SectionEnd

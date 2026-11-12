; Masar Time USB — Windows installer (free flash-drive edition, built on Linux with native makensis).
; Per-user install, no admin rights and no firewall rule (it never listens on the network).
; The customer's data lives in %APPDATA%\Masar Time USB and is NOT removed on uninstall.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!define APPNAME "Masar Time USB"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define SRC "..\dist-usb\win-unpacked"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MasarTimeUSB"

Name "${APPNAME}"
OutFile "..\dist-usb\Masar-Time-USB-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
BrandingText "${APPNAME} ${VERSION}"

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPNAME}.exe"
!insertmacro MUI_PAGE_WELCOME
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
  nsExec::Exec 'taskkill /F /IM "${APPNAME}.exe"'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "/oname=$INSTDIR\app.ico" "..\build\icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\app.ico"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\إزالة ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe" "" "$INSTDIR\app.ico"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Masar"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${APPNAME}.exe"'
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd

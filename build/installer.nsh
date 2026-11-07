; YappyChat's uninstaller: after "Are you sure?", a page of tick boxes asks what else to remove from this computer.
; Nothing is ticked to start with, so a plain uninstall keeps your logs and settings for next time.
; Updates also run the uninstaller (silently, with --updated): then nothing but the old app files is touched, ever.
;
; What lives in %APPDATA%\YappyChat:
;   logs\<channel>\YYYY-MM-DD.log     chat logs
;   logs\diagnostics.log(.old)        the error log used for bug reports
;   settings.json(.bak/.tmp)          settings, notes, highlights, macros, layouts and the encrypted Twitch login
;   names.json(.tmp)                  which Twitch account had which name, for name-change history
;   whispers.json(.tmp)               whispers YappyChat received or sent, so the Whispers tab survives a restart
;   pending-crash.json                a crash report waiting to be sent
;   everything else                   the stream player's Twitch sign-in, and Chromium's caches

;
; After every install and update: tell Windows the app's icon may have changed, so the Start menu, desktop and pinned taskbar shortcuts redraw
; Yappy instead of a blank icon left over from the copy that was just replaced. SHChangeNotify(SHCNE_ASSOCCHANGED) refreshes the shell's icons;
; ie4uinit -show (Windows 10 and 11) rebuilds the user's icon cache. Both are Windows' own tools and only touch the icon cache.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x0000, p 0, p 0)'
  ${If} ${FileExists} "$SYSDIR\ie4uinit.exe"
    Push $0
    nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
    Pop $0 ; its exit code (not needed)
    Pop $0
  ${EndIf}
!macroend

!define UNINSTALL_SECTION_NAME "YappyChat (the app)"
; Words on the tick-box page. These settings apply to the next page added, so only in the uninstaller (where that page is the tick boxes).
!ifdef BUILD_UNINSTALLER
  !define MUI_PAGE_HEADER_TEXT "Uninstall YappyChat"
  !define MUI_PAGE_HEADER_SUBTEXT "Choose what else to remove from this computer."
  !define MUI_COMPONENTSPAGE_TEXT_TOP "YappyChat will be removed. Tick anything you also want deleted. Anything left unticked stays on this computer, ready for if you install YappyChat again."
  !define MUI_COMPONENTSPAGE_TEXT_COMPLIST "Also remove:"
!endif

!macro customUnInit
  ; a one-click uninstall normally runs silently after "Are you sure?". Show the tick boxes, unless this is an update or someone asked for /S.
  SectionSetFlags 0 17 ; the app itself is always removed: ticked and greyed out (SF_SELECTED + SF_RO)
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/S" $R1
  ${If} ${Errors}
    ${IfNot} ${isUpdated}
      SetSilent normal
    ${EndIf}
  ${EndIf}
!macroend

; The tick boxes. They do nothing themselves: the uninstall step below reads them (the one-click uninstaller ends straight after that step).
; Their order is their number: 0 is the app itself, then 1 to 4.
!macro customUnInstallSection
  Section /o "un.Chat logs (everything YappyChat saved from chat)"
  SectionEnd
  Section /o "un.Settings, notes, highlights, macros and your saved login"
  SectionEnd
  Section /o "un.Stream player sign-in and cached files"
  SectionEnd
  Section /o "un.Error log (diagnostics)"
  SectionEnd
!macroend

!macro ycTicked IDX VAR
  SectionGetFlags ${IDX} ${VAR}
  IntOp ${VAR} ${VAR} & 1 ; SF_SELECTED
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    StrCpy $R9 "$APPDATA\YappyChat"
    !insertmacro ycTicked 1 $R1
    !insertmacro ycTicked 2 $R2
    !insertmacro ycTicked 3 $R3
    !insertmacro ycTicked 4 $R4

    ; 1. chat logs: every channel's folder (the error log beside them is box 4)
    ${If} $R1 == 1
      FindFirst $R5 $R6 "$R9\logs\*.*"
      ycLogs:
        StrCmp $R6 "" ycLogsDone
        StrCmp $R6 "." ycLogsNext
        StrCmp $R6 ".." ycLogsNext
        IfFileExists "$R9\logs\$R6\*.*" 0 ycLogsNext
        RMDir /r "$R9\logs\$R6"
      ycLogsNext:
        FindNext $R5 $R6
        Goto ycLogs
      ycLogsDone:
      FindClose $R5
    ${EndIf}

    ; 2. settings, notes, highlights, macros, layouts and the saved login
    ${If} $R2 == 1
      Delete "$R9\settings.json"
      Delete "$R9\settings.json.bak"
      Delete "$R9\settings.json.tmp"
      Delete "$R9\names.json"
      Delete "$R9\names.json.tmp"
      Delete "$R9\whispers.json"
      Delete "$R9\whispers.json.tmp"
    ${EndIf}

    ; 3. the stream player's sign-in and the browser caches: everything except settings and logs
    ${If} $R3 == 1
      FindFirst $R5 $R6 "$R9\*.*"
      ycCache:
        StrCmp $R6 "" ycCacheDone
        StrCmp $R6 "." ycCacheNext
        StrCmp $R6 ".." ycCacheNext
        StrCmp $R6 "logs" ycCacheNext
        StrCmp $R6 "settings.json" ycCacheNext
        StrCmp $R6 "settings.json.bak" ycCacheNext
        StrCmp $R6 "settings.json.tmp" ycCacheNext
        StrCmp $R6 "pending-crash.json" ycCacheNext
        StrCmp $R6 "names.json" ycCacheNext
        StrCmp $R6 "whispers.json" ycCacheNext
        IfFileExists "$R9\$R6\*.*" 0 +3
          RMDir /r "$R9\$R6"
          Goto ycCacheNext
        Delete "$R9\$R6"
      ycCacheNext:
        FindNext $R5 $R6
        Goto ycCache
      ycCacheDone:
      FindClose $R5
    ${EndIf}

    ; 4. the error log, and a crash report still waiting to be sent
    ${If} $R4 == 1
      Delete "$R9\logs\diagnostics.log"
      Delete "$R9\logs\diagnostics.log.old"
      Delete "$R9\pending-crash.json"
    ${EndIf}

    ; folders left empty go too (RMDir without /r only removes an empty folder)
    RMDir "$R9\logs"
    RMDir "$R9"
  ${EndIf}
!macroend

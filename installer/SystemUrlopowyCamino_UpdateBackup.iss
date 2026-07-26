#ifndef MyAppName
  #define MyAppName "System Urlopowy Camino"
#endif
#ifndef MyAppVersion
  #define MyAppVersion "1.1.2"
#endif
#ifndef MyAppPublisher
  #define MyAppPublisher "Camino"
#endif
#ifndef MyAppExeName
  #define MyAppExeName "SystemUrlopowyCamino.exe"
#endif
#ifndef MyAppId
  #define MyAppId "{{7D6F9E7A-2E95-4DDB-BD54-6DA6E916C101}"
#endif
#ifndef MyAppSourceDir
  #define MyAppSourceDir "output\publish"
#endif
#ifndef MyAppOutputDir
  #define MyAppOutputDir "output"
#endif

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UsePreviousAppDir=yes
DisableDirPage=no
CloseApplications=yes
DisableProgramGroupPage=yes
OutputDir={#MyAppOutputDir}
OutputBaseFilename=Setup_SystemUrlopowyCamino_{#MyAppVersion}_UpdateBackup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

[Tasks]
Name: "desktopicon"; Description: "Utworz ikone na pulpicie"; GroupDescription: "Dodatkowe skróty:"; Flags: unchecked
Name: "restoreprevious"; Description: "Dodaj skrót przywracania poprzedniej wersji"; GroupDescription: "Dodatkowe skróty:"; Flags: unchecked

[Files]
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "leave-archive.db;leave-archive.json;settings.json"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Odinstaluj {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{group}\{#MyAppName} - Przywroc poprzednia wersje"; Filename: "{cmd}"; Parameters: "/c ""{app}\RestorePreviousVersion.cmd"""; Tasks: restoreprevious
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Uruchom {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
var
  BackupRootDir: string;
  BackupCreated: Boolean;
  InstallationSucceeded: Boolean;
  LocalDataDir: string;
  CustomDataDir: string;

procedure EnsureDirPath(const DirPath: string); forward;

function SafeCopyIfMissingOrEmpty(const BackupFilePath, DestinationFilePath: string): Boolean;
begin
  Result := True;

  if not FileExists(BackupFilePath) then
    Exit;

  if FileExists(DestinationFilePath) then
    Exit;

  if not DirExists(ExtractFileDir(DestinationFilePath)) then
  begin
    if not ForceDirectories(ExtractFileDir(DestinationFilePath)) then
    begin
      Result := False;
      Exit;
    end;
  end;

  if not CopyFile(BackupFilePath, DestinationFilePath, False) then
    Result := False;
end;

procedure BackupCriticalDataFiles;
var
  CriticalRootDir: string;
  CriticalLocalDir: string;
  CriticalSharedDir: string;
begin
  CriticalRootDir := AddBackslash(BackupRootDir) + 'Critical';
  CriticalLocalDir := AddBackslash(CriticalRootDir) + 'Local';
  CriticalSharedDir := AddBackslash(CriticalRootDir) + 'Shared';

  EnsureDirPath(CriticalLocalDir);

  if FileExists(AddBackslash(LocalDataDir) + 'leave-archive.db') then
    CopyFile(AddBackslash(LocalDataDir) + 'leave-archive.db', AddBackslash(CriticalLocalDir) + 'leave-archive.db', False);
  if FileExists(AddBackslash(LocalDataDir) + 'leave-archive.json') then
    CopyFile(AddBackslash(LocalDataDir) + 'leave-archive.json', AddBackslash(CriticalLocalDir) + 'leave-archive.json', False);
  if FileExists(AddBackslash(LocalDataDir) + 'settings.json') then
    CopyFile(AddBackslash(LocalDataDir) + 'settings.json', AddBackslash(CriticalLocalDir) + 'settings.json', False);
  if FileExists(AddBackslash(LocalDataDir) + 'storage-path.txt') then
    CopyFile(AddBackslash(LocalDataDir) + 'storage-path.txt', AddBackslash(CriticalLocalDir) + 'storage-path.txt', False);

  if (CustomDataDir <> '') and DirExists(CustomDataDir) then
  begin
    EnsureDirPath(CriticalSharedDir);

    if FileExists(AddBackslash(CustomDataDir) + 'leave-archive.db') then
      CopyFile(AddBackslash(CustomDataDir) + 'leave-archive.db', AddBackslash(CriticalSharedDir) + 'leave-archive.db', False);
    if FileExists(AddBackslash(CustomDataDir) + 'leave-archive.json') then
      CopyFile(AddBackslash(CustomDataDir) + 'leave-archive.json', AddBackslash(CriticalSharedDir) + 'leave-archive.json', False);
    if FileExists(AddBackslash(CustomDataDir) + 'settings.json') then
      CopyFile(AddBackslash(CustomDataDir) + 'settings.json', AddBackslash(CriticalSharedDir) + 'settings.json', False);

    SaveStringToFile(AddBackslash(CriticalRootDir) + 'shared-path.txt', CustomDataDir, False);
  end;
end;

procedure RestoreCriticalDataFilesIfNeeded;
var
  CriticalRootDir: string;
  CriticalLocalDir: string;
  CriticalSharedDir: string;
  SavedSharedPathAnsi: AnsiString;
  SavedSharedPath: string;
begin
  CriticalRootDir := AddBackslash(BackupRootDir) + 'Critical';
  CriticalLocalDir := AddBackslash(CriticalRootDir) + 'Local';
  CriticalSharedDir := AddBackslash(CriticalRootDir) + 'Shared';

  if DirExists(CriticalLocalDir) then
  begin
    SafeCopyIfMissingOrEmpty(AddBackslash(CriticalLocalDir) + 'leave-archive.db', AddBackslash(LocalDataDir) + 'leave-archive.db');
    SafeCopyIfMissingOrEmpty(AddBackslash(CriticalLocalDir) + 'leave-archive.json', AddBackslash(LocalDataDir) + 'leave-archive.json');
    SafeCopyIfMissingOrEmpty(AddBackslash(CriticalLocalDir) + 'settings.json', AddBackslash(LocalDataDir) + 'settings.json');
    SafeCopyIfMissingOrEmpty(AddBackslash(CriticalLocalDir) + 'storage-path.txt', AddBackslash(LocalDataDir) + 'storage-path.txt');
  end;

  SavedSharedPathAnsi := '';
  if LoadStringFromFile(AddBackslash(CriticalRootDir) + 'shared-path.txt', SavedSharedPathAnsi) then
  begin
    SavedSharedPath := Trim(string(SavedSharedPathAnsi));
    if (SavedSharedPath <> '') and DirExists(CriticalSharedDir) then
    begin
      SafeCopyIfMissingOrEmpty(AddBackslash(CriticalSharedDir) + 'leave-archive.db', AddBackslash(SavedSharedPath) + 'leave-archive.db');
      SafeCopyIfMissingOrEmpty(AddBackslash(CriticalSharedDir) + 'leave-archive.json', AddBackslash(SavedSharedPath) + 'leave-archive.json');
      SafeCopyIfMissingOrEmpty(AddBackslash(CriticalSharedDir) + 'settings.json', AddBackslash(SavedSharedPath) + 'settings.json');
    end;
  end;
end;

procedure EnsureDirPath(const DirPath: string);
begin
  if DirExists(DirPath) then
    Exit;

  if not ForceDirectories(DirPath) then
    RaiseException('Nie udalo sie utworzyc folderu: ' + DirPath);
end;

function CopyDirectoryTree(const SourceDir, DestDir: string): Boolean;
var
  FindRec: TFindRec;
  SourcePath: string;
  DestPath: string;
begin
  Result := False;

  if not DirExists(SourceDir) then
  begin
    Result := True;
    Exit;
  end;

  EnsureDirPath(DestDir);

  if FindFirst(AddBackslash(SourceDir) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          SourcePath := AddBackslash(SourceDir) + FindRec.Name;
          DestPath := AddBackslash(DestDir) + FindRec.Name;

          if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
          begin
            if not CopyDirectoryTree(SourcePath, DestPath) then
              Exit;
          end
          else
          begin
            EnsureDirPath(ExtractFileDir(DestPath));
            if not CopyFile(SourcePath, DestPath, False) then
              Exit;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;

  Result := True;
end;

function LoadCustomDataDir(const ALocalDataDir: string): string;
var
  StorageConfigPath: string;
  ConfigText: AnsiString;
begin
  Result := '';
  StorageConfigPath := AddBackslash(ALocalDataDir) + 'storage-path.txt';

  if not FileExists(StorageConfigPath) then
    Exit;

  if not LoadStringFromFile(StorageConfigPath, ConfigText) then
    Exit;

  Result := Trim(string(ConfigText));
  if (Result <> '') and DirExists(Result) then
    Exit;

  Result := '';
end;

procedure CreateBackupSnapshot;
var
  AppBackupDir: string;
  LocalBackupDir: string;
  SharedBackupDir: string;
begin
  if DirExists(BackupRootDir) then
    DelTree(BackupRootDir, True, True, True);

  EnsureDirPath(BackupRootDir);

  AppBackupDir := AddBackslash(BackupRootDir) + 'App';
  LocalBackupDir := AddBackslash(BackupRootDir) + 'LocalAppData';
  SharedBackupDir := AddBackslash(BackupRootDir) + 'SharedData';

  if not CopyDirectoryTree(ExpandConstant('{app}'), AppBackupDir) then
    RaiseException('Nie udalo sie wykonac kopii folderu aplikacji.');

  if DirExists(LocalDataDir) then
  begin
    if not CopyDirectoryTree(LocalDataDir, LocalBackupDir) then
      RaiseException('Nie udalo sie wykonac kopii danych lokalnych.');
  end;

  if (CustomDataDir <> '') and DirExists(CustomDataDir) then
  begin
    if not CopyDirectoryTree(CustomDataDir, SharedBackupDir) then
      RaiseException('Nie udalo sie wykonac kopii danych wspolnych.');

    SaveStringToFile(AddBackslash(BackupRootDir) + 'custom-data-path.txt', CustomDataDir, False);
  end;

  BackupCriticalDataFiles;

  BackupCreated := True;
end;

procedure RestoreBackupSnapshot;
var
  BackupAppDir: string;
  BackupLocalDir: string;
  BackupSharedDir: string;
  SavedCustomPath: AnsiString;
  SavedCustomPathText: string;
begin
  BackupAppDir := AddBackslash(BackupRootDir) + 'App';
  BackupLocalDir := AddBackslash(BackupRootDir) + 'LocalAppData';
  BackupSharedDir := AddBackslash(BackupRootDir) + 'SharedData';

  if DirExists(BackupAppDir) then
    CopyDirectoryTree(BackupAppDir, ExpandConstant('{app}'));

  if DirExists(BackupLocalDir) then
    CopyDirectoryTree(BackupLocalDir, LocalDataDir);

  SavedCustomPath := '';
  if LoadStringFromFile(AddBackslash(BackupRootDir) + 'custom-data-path.txt', SavedCustomPath) then
  begin
    SavedCustomPathText := Trim(string(SavedCustomPath));
    if (SavedCustomPathText <> '') and DirExists(BackupSharedDir) then
      CopyDirectoryTree(BackupSharedDir, SavedCustomPathText);
  end;
end;

procedure CreateManualRestoreLauncher;
var
  LauncherPath: string;
  CmdText: string;
begin
  LauncherPath := AddBackslash(ExpandConstant('{app}')) + 'RestorePreviousVersion.cmd';

  CmdText := '';
  CmdText := CmdText + '@echo off' + #13#10;
  CmdText := CmdText + 'set "APPDIR=' + ExpandConstant('{app}') + '"' + #13#10;
  CmdText := CmdText + 'set "BACKUPROOT=' + BackupRootDir + '"' + #13#10;
  CmdText := CmdText + 'set "LOCALDATA=' + LocalDataDir + '"' + #13#10;
  CmdText := CmdText + 'set "BACKUPAPP=%BACKUPROOT%\App"' + #13#10;
  CmdText := CmdText + 'set "BACKUPLOCAL=%BACKUPROOT%\LocalAppData"' + #13#10;
  CmdText := CmdText + 'set "BACKUPSHARED=%BACKUPROOT%\SharedData"' + #13#10;
  CmdText := CmdText + 'if not exist "%BACKUPAPP%\{#MyAppExeName}" (' + #13#10;
  CmdText := CmdText + '  echo Brak kopii zapasowej poprzedniej wersji.' + #13#10;
  CmdText := CmdText + '  pause' + #13#10;
  CmdText := CmdText + '  exit /b 1' + #13#10;
  CmdText := CmdText + ')' + #13#10;
  CmdText := CmdText + 'robocopy "%BACKUPAPP%" "%APPDIR%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP' + #13#10;
  CmdText := CmdText + 'if exist "%BACKUPLOCAL%" robocopy "%BACKUPLOCAL%" "%LOCALDATA%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP' + #13#10;
  CmdText := CmdText + 'if exist "%BACKUPSHARED%" (' + #13#10;
  CmdText := CmdText + '  if exist "%LOCALDATA%\storage-path.txt" (' + #13#10;
  CmdText := CmdText + '    set /p SHAREDPATH=<"%LOCALDATA%\storage-path.txt"' + #13#10;
  CmdText := CmdText + '    if not "%SHAREDPATH%"=="" robocopy "%BACKUPSHARED%" "%SHAREDPATH%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP' + #13#10;
  CmdText := CmdText + '  )' + #13#10;
  CmdText := CmdText + ')' + #13#10;
  CmdText := CmdText + 'echo Przywracanie zakonczone.' + #13#10;
  CmdText := CmdText + 'pause' + #13#10;

  SaveStringToFile(LauncherPath, CmdText, False);
end;

function AppInstallLooksExisting(const AppDir: string): Boolean;
begin
  Result := FileExists(AddBackslash(AppDir) + '{#MyAppExeName}') or DirExists(LocalDataDir);
end;

function PrepareToInstall(var NeedsRestart: Boolean): string;
var
  Answer: Integer;
begin
  Result := '';
  BackupCreated := False;
  InstallationSucceeded := False;

  LocalDataDir := ExpandConstant('{localappdata}') + '\SystemUrlopowyCamino';
  CustomDataDir := LoadCustomDataDir(LocalDataDir);
  BackupRootDir := ExpandConstant('{commonappdata}') + '\SystemUrlopowyCamino\Backup';

  if AppInstallLooksExisting(ExpandConstant('{app}')) then
  begin
    Answer := MsgBox(
      'Wykryto istniejaca instalacje programu.' + #13#10 + #13#10 +
      '[TAK] - aktualizacja z backupem danych' + #13#10 +
      '[NIE] - anuluj instalacje',
      mbConfirmation,
      MB_YESNO);

    if Answer <> IDYES then
    begin
      Result := 'Instalacja anulowana przez uzytkownika.';
      Exit;
    end;

    try
      CreateBackupSnapshot;
    except
      Result := GetExceptionMessage;
      Exit;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then
  begin
    if BackupCreated then
      RestoreCriticalDataFilesIfNeeded;

    InstallationSucceeded := True;
    if BackupCreated then
      CreateManualRestoreLauncher;
  end;
end;

procedure DeinitializeSetup;
begin
  if BackupCreated and (not InstallationSucceeded) then
    RestoreBackupSnapshot;
end;

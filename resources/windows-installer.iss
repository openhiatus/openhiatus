; Built from the already validated, self-contained Windows package.
#ifndef AppVersion
  #error Build with npm run installer
#endif

[Setup]
AppId={#SetupAppId}
AppName={#ProductName}
AppVersion={#AppVersion}
AppPublisher=openHiatus contributors
AppPublisherURL=https://github.com/openhiatus/openhiatus
AppSupportURL=https://github.com/openhiatus/openhiatus/issues
AppUpdatesURL=https://github.com/openhiatus/openhiatus/releases
DefaultDirName={localappdata}\Programs\{#ProductName}
DefaultGroupName={#ProductName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
SetupArchitecture=x64
MinVersion=10.0.19041
WizardStyle=modern dynamic
SetupIconFile=..\dist\openhiatus.ico
UninstallDisplayIcon={app}\openHiatus.exe
OutputDir={#OutputDir}
OutputBaseFilename={#OutputName}
Compression=lzma2/normal
SolidCompression=yes
CloseApplications=no
RestartApplications=no
SetupMutex={#SetupAppId}.Setup
UninstallLogMode=append
UsePreviousTasks=yes
ShowLanguageDialog=yes
VersionInfoVersion={#AppVersion}.0
VersionInfoDescription={#ProductName} Setup

[Languages]
Name: english; MessagesFile: compiler:Default.isl
Name: spanish; MessagesFile: compiler:Languages\Spanish.isl
Name: french; MessagesFile: compiler:Languages\French.isl
Name: german; MessagesFile: compiler:Languages\German.isl
Name: chinesesimp; MessagesFile: compiler:Languages\ChineseSimplified.isl
Name: japanese; MessagesFile: compiler:Languages\Japanese.isl
Name: brazilianportuguese; MessagesFile: compiler:Languages\BrazilianPortuguese.isl

[Messages]
german.SelectTasksLabel2=Du kannst zusätzlich zum Startmenü-Eintrag ein Desktop-Symbol erstellen. Klicke danach auf Installieren.
english.SelectTasksLabel2=You can add a Desktop icon alongside the Start menu entry. Then click Install.
spanish.SelectTasksLabel2=Puedes añadir un icono en el escritorio además de la entrada en el menú Inicio. Después haz clic en Instalar.
french.SelectTasksLabel2=Vous pouvez ajouter une icône sur le Bureau en plus de l'entrée du menu Démarrer. Cliquez ensuite sur Installer.
chinesesimp.SelectTasksLabel2=除开始菜单入口外，你还可以创建桌面图标。然后点击“安装”。
japanese.SelectTasksLabel2=スタートメニューの項目に加えて、デスクトップアイコンを作成できます。その後「インストール」をクリックしてください。
brazilianportuguese.SelectTasksLabel2=Você pode adicionar um ícone na área de trabalho além da entrada no menu Iniciar. Depois clique em Instalar.

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PackageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ManifestFile}"; DestDir: "{app}"; DestName: ".openhiatus-install-files.txt"; Attribs: hidden; Flags: ignoreversion

[Icons]
#ifdef TestProfileDirectory
; Isolated acceptance builds only. Normal distribution keeps its original launch arguments.
Name: "{autoprograms}\{#ProductName}"; Filename: "{app}\openHiatus.exe"; Parameters: "--data-dir=""{#TestProfileDirectory}"""; WorkingDir: "{app}"; AppUserModelID: "local.openhiatus.assistant"
Name: "{autodesktop}\{#ProductName}"; Filename: "{app}\openHiatus.exe"; Parameters: "--data-dir=""{#TestProfileDirectory}"""; WorkingDir: "{app}"; AppUserModelID: "local.openhiatus.assistant"; Tasks: desktopicon
#else
Name: "{autoprograms}\{#ProductName}"; Filename: "{app}\openHiatus.exe"; WorkingDir: "{app}"; AppUserModelID: "local.openhiatus.assistant"
Name: "{autodesktop}\{#ProductName}"; Filename: "{app}\openHiatus.exe"; WorkingDir: "{app}"; AppUserModelID: "local.openhiatus.assistant"; Tasks: desktopicon
#endif

[Run]
#ifdef TestProfileDirectory
Filename: "{app}\openHiatus.exe"; Parameters: "--data-dir=""{#TestProfileDirectory}"""; Description: "{cm:LaunchProgram,{#ProductName}}"; Flags: nowait postinstall skipifsilent
#else
Filename: "{app}\openHiatus.exe"; Description: "{cm:LaunchProgram,{#ProductName}}"; Flags: nowait postinstall skipifsilent
#endif

[Registry]
Root: HKCU; Subkey: "Software\{#SetupAppId}"; ValueType: string; ValueName: "InstallerLanguage"; ValueData: "{code:InstallerLanguage}"; Flags: uninsdeletevalue uninsdeletekeyifempty

[CustomMessages]
german.AppInUse=openHiatus kann gerade nicht ersetzt werden. Beende die App zuerst über das Fenster und versuche es erneut. Laufende Arbeit wird durch Setup nicht abgebrochen.
english.AppInUse=openHiatus cannot be replaced right now. Close its window, then try again. Setup does not interrupt running work.
spanish.AppInUse=No se puede reemplazar openHiatus ahora. Cierra la aplicación y vuelve a intentarlo. El instalador no interrumpe el trabajo en curso.
french.AppInUse=openHiatus ne peut pas être remplacé pour le moment. Fermez l'application, puis réessayez. L'installation n'interrompt pas le travail en cours.
chinesesimp.AppInUse=目前无法替换 openHiatus。请先关闭应用窗口，然后重试。安装程序不会中断正在进行的工作。
japanese.AppInUse=現在 openHiatus を置き換えられません。アプリのウィンドウを閉じて、もう一度お試しください。実行中の作業をインストーラーが中断することはありません。
brazilianportuguese.AppInUse=Não é possível substituir o openHiatus agora. Feche o aplicativo e tente novamente. O instalador não interrompe o trabalho em andamento.
german.KeepData=Deine Einstellungen, Zugänge, dein Gedächtnis und eigene Dateien bleiben bei Updates und bei der Deinstallation erhalten.
english.KeepData=Your settings, connections, memory and personal files are preserved during updates and uninstallation.
spanish.KeepData=Tus ajustes, conexiones, memoria y archivos personales se conservan durante las actualizaciones y la desinstalación.
french.KeepData=Vos paramètres, connexions, mémoire et fichiers personnels sont conservés lors des mises à jour et de la désinstallation.
chinesesimp.KeepData=更新和卸载时，你的设置、连接、记忆和个人文件都会保留。
japanese.KeepData=更新時やアンインストール時も、設定、接続情報、メモリー、個人ファイルは保持されます。
brazilianportuguese.KeepData=Suas configurações, conexões, memória e arquivos pessoais são preservados nas atualizações e na desinstalação.
german.InstallIntro=Setup installiert openHiatus für dein Windows-Benutzerkonto und legt einen Eintrag im Startmenü an. Du benötigst keine Administratorrechte.
english.InstallIntro=Setup installs openHiatus for your Windows account and adds a Start menu entry. Administrator rights are not required.
spanish.InstallIntro=El instalador instala openHiatus para tu cuenta de Windows y añade una entrada en el menú Inicio. No se requieren permisos de administrador.
french.InstallIntro=L'installation ajoute openHiatus à votre compte Windows et au menu Démarrer. Les droits d'administrateur ne sont pas nécessaires.
chinesesimp.InstallIntro=安装程序将为你的 Windows 账户安装 openHiatus，并添加开始菜单入口。无需管理员权限。
japanese.InstallIntro=お使いの Windows アカウントに openHiatus をインストールし、スタートメニューに項目を追加します。管理者権限は不要です。
brazilianportuguese.InstallIntro=O instalador instala o openHiatus para sua conta do Windows e adiciona uma entrada no menu Iniciar. Não são necessários direitos de administrador.
german.NewerInstalled=Eine neuere openHiatus-Version ist bereits installiert. Verwende bitte ein aktuelles Setup.
english.NewerInstalled=A newer version of openHiatus is already installed. Please use a current Setup.
spanish.NewerInstalled=Ya hay instalada una versión más reciente de openHiatus. Usa un instalador actualizado.
french.NewerInstalled=Une version plus récente d'openHiatus est déjà installée. Utilisez un programme d'installation à jour.
chinesesimp.NewerInstalled=已安装更新版本的 openHiatus。请使用最新的安装程序。
japanese.NewerInstalled=新しいバージョンの openHiatus がすでにインストールされています。最新のインストーラーを使用してください。
brazilianportuguese.NewerInstalled=Uma versão mais recente do openHiatus já está instalada. Use um instalador atualizado.

[Code]
var
  PreviousFiles: TStringList;

function InstallerLanguage(Param: String): String;
begin
  case ActiveLanguage of
    'german': Result := 'de';
    'spanish': Result := 'es';
    'french': Result := 'fr';
    'chinesesimp': Result := 'zh-CN';
    'japanese': Result := 'ja';
    'brazilianportuguese': Result := 'pt-BR';
  else
    Result := 'en';
  end;
end;

function GetFileAttributesW(Name: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function InitializeSetup: Boolean;
var Installed: String; OldVersion, NewVersion: Int64;
begin
  Result := True;
  if RegQueryStringValue(HKCU64, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupAppId}_is1', 'DisplayVersion', Installed) then
    if StrToVersion(Installed, OldVersion) and StrToVersion('{#AppVersion}', NewVersion) then
      if ComparePackedVersion(OldVersion, NewVersion) > 0 then begin
        Result := False;
        if not WizardSilent then MsgBox(CustomMessage('NewerInstalled'), mbInformation, MB_OK);
      end;
end;

function AppFilesAvailable: Boolean;
var Stream: TFileStream; Attempt: Integer;
begin
  Result := True;
  if not FileExists(ExpandConstant('{app}\openHiatus.exe')) then exit;
  { File scanners and exiting child processes can briefly retain a handle. }
  for Attempt := 1 to 20 do begin
    try
      Stream := TFileStream.Create(ExpandConstant('{app}\openHiatus.exe'), fmOpenReadWrite or fmShareExclusive);
      Stream.Free;
      exit;
    except
      Sleep(100);
    end;
  end;
  Result := False;
end;

function SafeOwnedFile(Relative: String): String;
var Root, Candidate, Part: String; I: Integer; Attributes: LongWord;
begin
  Result := '';
  if Relative = '' then exit;
  if (Pos(':', Relative) > 0) or (Pos('..', Relative) > 0) or
     (Pos('/', Relative) > 0) or (Relative[1] = '\') then exit;
  if (CompareText(Relative, '.openhiatus-install-files.txt') = 0) or (Pos('unins', Lowercase(Relative)) = 1) then exit;
  Root := AddBackslash(ExpandFileName(ExpandConstant('{app}')));
  Candidate := ExpandFileName(Root + Relative);
  if CompareText(Copy(Candidate, 1, Length(Root)), Root) <> 0 then exit;
  Part := RemoveBackslashUnlessRoot(Root);
  Attributes := GetFileAttributesW(Part);
  if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then exit;
  for I := 1 to Length(Relative) do begin
    if Relative[I] = '\' then begin
      Part := Root + Copy(Relative, 1, I - 1);
      Attributes := GetFileAttributesW(Part);
      if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then exit;
    end;
  end;
  Attributes := GetFileAttributesW(Candidate);
  if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then exit;
  Result := Candidate;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not AppFilesAvailable then begin Result := CustomMessage('AppInUse'); exit; end;
  PreviousFiles := TStringList.Create;
  if FileExists(ExpandConstant('{app}\.openhiatus-install-files.txt')) then begin
    PreviousFiles.LoadFromFile(ExpandConstant('{app}\.openhiatus-install-files.txt'));
    if PreviousFiles.Count > 0 then
      if PreviousFiles[0] <> '# openhiatus:{#SetupAppId}' then PreviousFiles.Clear;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Current: TStringList; I: Integer; Target: String;
begin
  if (CurStep <> ssPostInstall) or (PreviousFiles = nil) then exit;
  Current := TStringList.Create;
  try
    Current.LoadFromFile(ExpandConstant('{app}\.openhiatus-install-files.txt'));
    Current.Sorted := True;
    for I := 1 to PreviousFiles.Count - 1 do
      if Current.IndexOf(PreviousFiles[I]) < 0 then begin
        Target := SafeOwnedFile(PreviousFiles[I]);
        if (Target <> '') and FileExists(Target) then
          if not DeleteFile(Target) then Log('Could not remove an obsolete application file.');
      end;
  finally
    Current.Free; PreviousFiles.Free; PreviousFiles := nil;
  end;
end;

procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel2.Caption := CustomMessage('InstallIntro') + #13#10#13#10 + CustomMessage('KeepData');
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID in [wpSelectTasks, wpReady] then
    WizardForm.NextButton.Caption := SetupMessage(msgButtonInstall)
  else if CurPageID = wpFinished then
    WizardForm.NextButton.Caption := SetupMessage(msgButtonFinish)
  else
    WizardForm.NextButton.Caption := SetupMessage(msgButtonNext);
end;

function InitializeUninstall: Boolean;
begin
  Result := AppFilesAvailable;
  if not Result and not UninstallSilent then MsgBox(CustomMessage('AppInUse'), mbInformation, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Command, Expected: String;
begin
  if CurUninstallStep <> usUninstall then exit;
  Expected := '"' + ExpandConstant('{app}\openHiatus.exe') + '" --autostart';
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#AutostartValueName}', Command) and
     (CompareText(Trim(Command), Expected) = 0) then begin
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', '{#AutostartValueName}');
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run', '{#AutostartValueName}');
  end;
  { No AppData deletion: profiles, credentials and user documents are never installer payload. }
end;

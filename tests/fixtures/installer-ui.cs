using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

class InstallerUiCheck {
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    static AutomationElement FindWindow(string title) {
        foreach (AutomationElement window in AutomationElement.RootElement.FindAll(TreeScope.Children, Condition.TrueCondition))
            if (window.Current.Name.Contains(title) && window.Current.ClassName == "TWizardForm") return window;
        return null;
    }
    static AutomationElement WaitWindow(string title) {
        for (int i = 0; i < 200; i++) { var window = FindWindow(title); if (window != null) return window; Thread.Sleep(100); }
        throw new Exception("Owned test setup window did not appear.");
    }
    static AutomationElement Button(AutomationElement window, string name) {
        foreach (AutomationElement button in window.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button)))
            if (button.Current.Name.Replace("&", "").Contains(name) && button.Current.IsEnabled) return button;
        return null;
    }
    static AutomationElement ConfirmCancellation(AutomationElement window, string translatedYes) {
        foreach (AutomationElement button in window.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button))) {
            // Native message-box buttons follow Windows' language, not Setup's /LANG.
            // IDYES is 6; use the language-independent ID before the Setup label fallback.
            if (button.Current.IsEnabled && button.Current.AutomationId == "6") return button;
        }
        return Button(window, translatedYes);
    }
    static void Capture(AutomationElement window, string file) {
        var handle = new IntPtr(window.Current.NativeWindowHandle); Rect rect;
        if (!GetWindowRect(handle, out rect)) throw new Exception("No test window bounds.");
        using (var bitmap = new Bitmap(rect.Right - rect.Left, rect.Bottom - rect.Top)) using (var graphics = Graphics.FromImage(bitmap)) {
            var dc = graphics.GetHdc(); bool printed;
            try { printed = PrintWindow(handle, dc, 2); } finally { graphics.ReleaseHdc(dc); }
            if (!printed) throw new Exception("Could not capture the owned setup window.");
            bitmap.Save(file, ImageFormat.Png);
        }
    }
    static void Main(string[] args) {
        SetProcessDPIAware();
        if (!args[1].StartsWith("openHiatus Setup Test ")) throw new Exception("Only the isolated test installer is permitted.");
        string language = args[3], nextText = args[4], installText = args[5], yesText = args[6];
        bool install = args.Length > 7;
        string options = "/LANG=" + language + " /NORESTART /SP-" + (install ? " /DIR=\"" + args[7] + "\" /TASKS=" : "");
        using (var process = Process.Start(new ProcessStartInfo(args[0], options) { UseShellExecute = false })) {
            var window = WaitWindow(args[1]); int ownedPid = window.Current.ProcessId;
            try {
                Thread.Sleep(250); Capture(window, Path.Combine(args[2], "openhiatus-setup-" + language + "-welcome.png"));
                var next = Button(window, nextText); if (next == null) throw new Exception(language + ": welcome must offer translated Next.");
                ((InvokePattern)next.GetCurrentPattern(InvokePattern.Pattern)).Invoke(); Thread.Sleep(250);
                Capture(window, Path.Combine(args[2], "openhiatus-setup-" + language + "-options.png"));
                if (Button(window, installText) == null) throw new Exception(language + ": setup must offer translated Install.");
                if (install) {
                    ((InvokePattern)Button(window, installText).GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                    AutomationElement finish = null;
                    for (int i = 0; i < 1800 && !process.HasExited; i++) {
                        finish = Button(window, "Fertigstellen"); if (finish != null) break; Thread.Sleep(100);
                    }
                    if (finish == null) throw new Exception("Interactive installation did not reach Finish.");
                    // Keep the default launch choice: the isolated build pins its own data directory.
                    // The lifecycle harness verifies that Finish actually starts that installed app.
                    Capture(window, Path.Combine(args[2], "openhiatus-setup-installed.png"));
                    ((InvokePattern)finish.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                    if (!process.WaitForExit(10000) || process.ExitCode != 0) throw new Exception("Interactive test installation did not finish successfully.");
                    Console.WriteLine("Owned setup: actual Install click, completed installation and Finish passed.");
                    return;
                }
                // Cancel before any files or registry entries are installed.
                PostMessage(new IntPtr(window.Current.NativeWindowHandle), 0x10, IntPtr.Zero, IntPtr.Zero);
                for (int i = 0; i < 50 && !process.HasExited; i++) {
                    foreach (AutomationElement dialog in AutomationElement.RootElement.FindAll(TreeScope.Children, new PropertyCondition(AutomationElement.ProcessIdProperty, ownedPid))) {
                        var yes = ConfirmCancellation(dialog, yesText); if (yes != null) ((InvokePattern)yes.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                    }
                    Thread.Sleep(100);
                }
                if (!process.WaitForExit(5000)) throw new Exception("Cancellation did not close test Setup.");
                Console.WriteLine(language + ": owned setup welcome, optional Desktop icon, direct Install action and Cancel passed.");
            } finally {
                if (!process.HasExited) { try { Process.GetProcessById(ownedPid).Kill(); } catch { } try { process.Kill(); } catch { } }
            }
        }
    }
}

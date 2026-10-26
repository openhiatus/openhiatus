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
        using (var process = Process.Start(new ProcessStartInfo(args[0], "/LANG=german /NORESTART /SP-") { UseShellExecute = false })) {
            var window = WaitWindow(args[1]); int ownedPid = window.Current.ProcessId;
            try {
                Thread.Sleep(250); Capture(window, Path.Combine(args[2], "openhiatus-setup-welcome.png"));
                var next = Button(window, "Weiter"); if (next == null) throw new Exception("Welcome must offer Next.");
                ((InvokePattern)next.GetCurrentPattern(InvokePattern.Pattern)).Invoke(); Thread.Sleep(250);
                Capture(window, Path.Combine(args[2], "openhiatus-setup-options.png"));
                if (Button(window, "Installieren") == null) throw new Exception("Setup must proceed directly from optional Desktop icon to Install.");
                // Cancel before any files or registry entries are installed.
                PostMessage(new IntPtr(window.Current.NativeWindowHandle), 0x10, IntPtr.Zero, IntPtr.Zero);
                for (int i = 0; i < 50 && !process.HasExited; i++) {
                    foreach (AutomationElement dialog in AutomationElement.RootElement.FindAll(TreeScope.Children, new PropertyCondition(AutomationElement.ProcessIdProperty, ownedPid))) {
                        var yes = Button(dialog, "Ja"); if (yes != null) ((InvokePattern)yes.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                    }
                    Thread.Sleep(100);
                }
                if (!process.WaitForExit(5000)) throw new Exception("Cancellation did not close test Setup.");
                Console.WriteLine("Owned setup welcome, optional Desktop icon, direct Install action and Cancel passed.");
            } finally {
                if (!process.HasExited) { try { Process.GetProcessById(ownedPid).Kill(); } catch { } try { process.Kill(); } catch { } }
            }
        }
    }
}

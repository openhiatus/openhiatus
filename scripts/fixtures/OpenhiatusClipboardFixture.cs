using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Isolated paste check only. Never activates another application's window.
internal sealed class OpenhiatusClipboardFixture : Form
{
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    private readonly string statePath;
    private readonly ObservedTextBox input = new ObservedTextBox();
    private readonly Timer timer = new Timer();
    private readonly DateTime started = DateTime.UtcNow;
    private readonly List<object> focusChanges = new List<object>();
    private bool? lastForeground;
    private bool? lastFocused;
    private int sample;

    private sealed class ObservedTextBox : TextBox
    {
        internal int PasteCount;
        internal int EnterCount;
        protected override void WndProc(ref Message message)
        {
            if (message.Msg == 0x0302) PasteCount++; // WM_PASTE
            base.WndProc(ref message);
        }
        protected override void OnKeyDown(KeyEventArgs args)
        {
            if (args.KeyCode == Keys.Enter) EnterCount++;
            base.OnKeyDown(args);
        }
    }

    private OpenhiatusClipboardFixture(string directory)
    {
        statePath = Path.Combine(directory, "Clipboard-Fixture-State.json");
        Text = "openhiatus Clipboard-Test (isoliert)";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(760, 470);
        TopMost = true;
        input.Multiline = true;
        input.AcceptsReturn = true;
        input.MaxLength = 20000;
        input.Font = new Font("Segoe UI", 12);
        input.SetBounds(24, 65, 712, 375);
        Controls.Add(new Label { Text = "Isolierter Test: einfügen, ohne Enter. Schließt automatisch.",
            Bounds = new Rectangle(24, 20, 712, 34), Font = new Font("Segoe UI", 12) });
        Controls.Add(input);
        input.TextChanged += delegate { WriteState(); };
        timer.Interval = 20;
        timer.Tick += delegate {
            WriteState();
            if ((DateTime.UtcNow - started).TotalSeconds >= 30) Close();
        };
        Shown += delegate {
            // Test setup may attach only long enough to bring THIS newly created fixture forward.
            // Product input never uses this test-only foreground setup or any application-specific focus API.
            uint owner; uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out owner);
            uint currentThread = GetCurrentThreadId();
            bool attached = foregroundThread != currentThread && AttachThreadInput(currentThread, foregroundThread, true);
            try { SetForegroundWindow(Handle); Activate(); input.Focus(); }
            finally { if (attached) AttachThreadInput(currentThread, foregroundThread, false); }
            WriteState(); timer.Start();
        };
        FormClosed += delegate { timer.Stop(); timer.Dispose(); };
    }

    private void WriteState()
    {
        bool foreground = GetForegroundWindow() == Handle;
        bool focused = input.Focused;
        if (lastForeground != foreground || lastFocused != focused)
        {
            focusChanges.Add(new { at = DateTime.UtcNow.ToString("o"), foreground = foreground, inputFocused = focused });
            lastForeground = foreground; lastFocused = focused;
        }
        string json = new JavaScriptSerializer().Serialize(new {
            pid = Process.GetCurrentProcess().Id,
            processStartedAt = Process.GetCurrentProcess().StartTime.ToUniversalTime().ToString("o"),
            handle = Handle.ToInt64().ToString(), foregroundHandle = GetForegroundWindow().ToInt64().ToString(),
            foreground = foreground, inputFocused = focused, text = input.Text,
            inputX = input.PointToScreen(new Point(input.Width / 2, input.Height / 2)).X,
            inputY = input.PointToScreen(new Point(input.Width / 2, input.Height / 2)).Y,
            ownInputAtPoint = WindowFromPoint(input.PointToScreen(new Point(input.Width / 2, input.Height / 2))) == input.Handle,
            pasteCount = input.PasteCount, enterCount = input.EnterCount, sample = ++sample,
            at = DateTime.UtcNow.ToString("o"), focusChanges = focusChanges
        });
        File.WriteAllText(statePath + ".next", json, new UTF8Encoding(false));
        File.Copy(statePath + ".next", statePath, true);
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 1 || !Path.IsPathRooted(args[0]) || !Directory.Exists(args[0])) return 64;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (OpenhiatusClipboardFixture fixture = new OpenhiatusClipboardFixture(args[0])) Application.Run(fixture);
        return 0;
    }
}

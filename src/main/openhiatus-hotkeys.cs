// Hidden Windows helper: one WM_HOTKEY per physical press, never keyboard polling/hooks.
// stdout: JSON lines (ready, then press). Any stdin input/EOF or parent exit stops it.
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class OpenhiatusHotkeys
{
    private const uint NoRepeat = 0x4000;
    private const uint WmHotkey = 0x0312;
    private const uint WmQuit = 0x0012;
    private const uint Synchronize = 0x00100000;
    private const uint WaitTimeout = 258;
    private const int F8Id = 1, F9Id = 2;
    private static uint mainThread;
    private static int stopping;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Message {
        public IntPtr Window;
        public uint Id;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public Point Position;
        public uint Private;
    }
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll", EntryPoint = "PeekMessageW", SetLastError = true)]
    private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll", EntryPoint = "GetMessageW", SetLastError = true)]
    private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll", EntryPoint = "PostThreadMessageW", SetLastError = true)]
    private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static void RequestStop() {
        Interlocked.Exchange(ref stopping, 1);
        // The queue was created before either watcher could request shutdown.
        PostThreadMessage(mainThread, WmQuit, UIntPtr.Zero, IntPtr.Zero);
    }

    private static int Main(string[] args) {
        uint parentId;
        if (args.Length != 2 || args[0] != "--parent-pid" || !UInt32.TryParse(args[1], out parentId) || parentId == 0) return 2;
        IntPtr parent = OpenProcess(Synchronize, false, parentId);
        if (parent == IntPtr.Zero) return 3;
        bool f8 = false, f9 = false;
        Thread parentWatcher = null;
        try {
            Console.OutputEncoding = new UTF8Encoding(false);
            mainThread = GetCurrentThreadId();
            Message message;
            PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
            // A retained process handle cannot accidentally attach to a reused PID.
            if (WaitForSingleObject(parent, 0) != WaitTimeout) return 3;
            parentWatcher = new Thread(delegate() {
                while (Interlocked.CompareExchange(ref stopping, 0, 0) == 0) {
                    if (WaitForSingleObject(parent, 250) != WaitTimeout) { RequestStop(); return; }
                }
            });
            parentWatcher.IsBackground = true;
            parentWatcher.Start();
            Thread inputWatcher = new Thread(delegate() {
                try { Console.In.Read(); } catch { }
                RequestStop();
            });
            inputWatcher.IsBackground = true;
            inputWatcher.Start();

            f8 = RegisterHotKey(IntPtr.Zero, F8Id, NoRepeat, 0x77);
            f9 = RegisterHotKey(IntPtr.Zero, F9Id, NoRepeat, 0x78);
            Console.WriteLine("{\"type\":\"ready\",\"registered\":{\"F8\":" + (f8 ? "true" : "false") + ",\"F9\":" + (f9 ? "true" : "false") + "}}");
            Console.Out.Flush();
            while (Interlocked.CompareExchange(ref stopping, 0, 0) == 0) {
                int result = GetMessage(out message, IntPtr.Zero, 0, 0);
                if (result == 0) break;
                if (result < 0) return 4;
                if (Interlocked.CompareExchange(ref stopping, 0, 0) != 0) break;
                if (message.Id != WmHotkey) continue;
                string key = message.WParam.ToUInt64() == F8Id && f8 ? "F8" :
                    message.WParam.ToUInt64() == F9Id && f9 ? "F9" : null;
                if (key != null) {
                    Console.WriteLine("{\"type\":\"press\",\"key\":\"" + key + "\"}");
                    Console.Out.Flush();
                }
            }
            return 0;
        } catch {
            // No desktop contents, key text, environment or exception details leave this helper.
            return 5;
        } finally {
            Interlocked.Exchange(ref stopping, 1);
            if (f8) UnregisterHotKey(IntPtr.Zero, F8Id);
            if (f9) UnregisterHotKey(IntPtr.Zero, F9Id);
            if (parentWatcher == null || parentWatcher.Join(1000)) CloseHandle(parent);
        }
    }
}

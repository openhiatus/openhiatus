// Temporary input arbitration on the ordinary Windows desktop, not a security boundary.
// No key values, pointer positions or text leave this process. Hooks never perform I/O.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

internal sealed class DesktopInputPolicy {
    internal bool Locked, Stopping, Escape;
    internal bool VoiceF8, VoiceF9;
    internal int VoicePress;
    private bool f8Down, f9Down;
    private bool leftControl, rightControl, leftAlt, rightAlt;
    internal bool Keyboard(uint key, uint flags, bool up) {
        bool injected = (flags & 0x10) != 0;
        if (!injected) {
            if (key == 0xA2) leftControl = !up; if (key == 0xA3) rightControl = !up;
            if (key == 0xA4) leftAlt = !up; if (key == 0xA5) rightAlt = !up;
            if (!up && (key == 0x1B || (key == 0x7B && (leftControl || rightControl) && (leftAlt || rightAlt)))) {
                Escape = true; Stopping = true; return true;
            }
        }
        if (!Locked) return false;
        // Key/button releases must still reach Windows when native cleanup releases held inputs.
        if (injected) return Stopping && !up;
        if (key == 0x77 && VoiceF8) { if (!up && !f8Down && !Stopping) VoicePress |= 1; f8Down = !up; return true; }
        if (key == 0x78 && VoiceF9) { if (!up && !f9Down && !Stopping) VoicePress |= 2; f9Down = !up; return true; }
        return true;
    }
    internal bool Mouse(uint flags, bool up) {
        if (!Locked) return false;
        return (flags & 1) == 0 || (Stopping && !up);
    }
}

internal static class OpenhiatusInputGuard {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Position; public uint Private; }
    [StructLayout(LayoutKind.Sequential)] struct KeyboardData { public uint Key, Scan, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct MouseData { public Point Point; public uint Data, Flags, Time; public UIntPtr Extra; }
    delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static readonly DesktopInputPolicy Policy = new DesktopInputPolicy();
    static volatile bool released, halt;
    static long lastHeartbeat;
    static int pendingAlive;
    static readonly Hook Keyboard = (code, message, data) => {
        if (code >= 0) {
            var key = (KeyboardData)Marshal.PtrToStructure(data, typeof(KeyboardData));
            if (Policy.Keyboard(key.Key, key.Flags, message.ToInt64() == 0x101 || message.ToInt64() == 0x105)) return new IntPtr(1);
        }
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    };
    static readonly Hook Mouse = (code, message, data) => {
        if (code >= 0) {
            var mouse = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
            long m = message.ToInt64();
            if (Policy.Mouse(mouse.Flags, m == 0x202 || m == 0x205 || m == 0x208 || m == 0x20C)) return new IntPtr(1);
        }
        return CallNextHookEx(IntPtr.Zero, code, message, data);
    };
    static bool KeysReleased() {
        for (int key = 1; key < 256; key++) if ((GetAsyncKeyState(key) & 0x8000) != 0) return false;
        return true;
    }
    static int Main(string[] args) {
        uint parentId;
        if (args.Length < 2 || args[0] != "--parent-pid" || !UInt32.TryParse(args[1], out parentId) || parentId == 0) return 2;
        for (int i = 2; i < args.Length; i++) {
            if (args[i] == "--f8") Policy.VoiceF8 = true;
            else if (args[i] == "--f9") Policy.VoiceF9 = true;
            else return 2;
        }
        IntPtr parent = OpenProcess(0x00100000, false, parentId), keyboard = IntPtr.Zero, mouse = IntPtr.Zero;
        if (parent == IntPtr.Zero) return 3;
        try {
            var clock = Stopwatch.StartNew(); Interlocked.Exchange(ref lastHeartbeat, Stopwatch.GetTimestamp());
            new Thread(() => {
                try {
                    string line;
                    while ((line = Console.ReadLine()) != null) {
                        if (line == "ping") { Interlocked.Exchange(ref lastHeartbeat, Stopwatch.GetTimestamp()); Interlocked.Exchange(ref pendingAlive, 1); }
                        else if (line == "halt") halt = true;
                        else break;
                    }
                } catch { } finally { released = true; }
            }) { IsBackground = true }.Start();
            keyboard = SetWindowsHookEx(13, Keyboard, GetModuleHandle(null), 0);
            mouse = SetWindowsHookEx(14, Mouse, GetModuleHandle(null), 0);
            if (keyboard == IntPtr.Zero || mouse == IntPtr.Zero) return 4;
            long stopAt = -1;
            while (!released && WaitForSingleObject(parent, 0) == 258) {
                Message message; while (PeekMessage(out message, IntPtr.Zero, 0, 0, 1)) { }
                if ((Stopwatch.GetTimestamp() - Interlocked.Read(ref lastHeartbeat)) * 1000 / Stopwatch.Frequency > 2000) return 5;
                if (halt) Policy.Stopping = true;
                if (Policy.Stopping && stopAt < 0) {
                    stopAt = clock.ElapsedMilliseconds;
                    if (Policy.Escape) { Console.WriteLine("escape"); Console.Out.Flush(); }
                }
                // An unresponsive host can never leave the user's input indefinitely blocked.
                if (stopAt >= 0 && clock.ElapsedMilliseconds - stopAt > 2000) return 6;
                if (!Policy.Locked && !Policy.Stopping && KeysReleased()) {
                    Policy.Locked = true; Console.WriteLine("ready"); Console.Out.Flush();
                }
                if (!Policy.Locked && clock.ElapsedMilliseconds > 5000) return 7;
                if (Interlocked.Exchange(ref pendingAlive, 0) != 0) { Console.WriteLine("alive"); Console.Out.Flush(); }
                if (Policy.VoicePress != 0) {
                    if ((Policy.VoicePress & 1) != 0) Console.WriteLine("f8");
                    if ((Policy.VoicePress & 2) != 0) Console.WriteLine("f9");
                    Policy.VoicePress = 0; Console.Out.Flush();
                }
                Thread.Sleep(5);
            }
            return 0;
        } catch { return 8; }
        finally {
            if (keyboard != IntPtr.Zero) UnhookWindowsHookEx(keyboard);
            if (mouse != IntPtr.Zero) UnhookWindowsHookEx(mouse);
            CloseHandle(parent);
        }
    }
}

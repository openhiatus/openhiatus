using System;
using System.Runtime.InteropServices;
using System.Threading;

// Test-only native input. It cannot type arbitrary text, click or target other apps.
internal static class HotkeyTestInput
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    private static bool Available(byte key, int id)
    {
        bool registered = RegisterHotKey(IntPtr.Zero, id, 0x4000, key);
        if (registered) UnregisterHotKey(IntPtr.Zero, id);
        return registered;
    }

    private static int Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "availability")
        {
            Console.WriteLine("{\"F8\":" + Available(0x77, 1).ToString().ToLowerInvariant() + ",\"F9\":" + Available(0x78, 2).ToString().ToLowerInvariant() + ",\"F10\":" + Available(0x79, 3).ToString().ToLowerInvariant() + "}");
            return 0;
        }
        if (args.Length == 1 && args[0] == "foreground")
        {
            Console.WriteLine(GetForegroundWindow().ToInt64());
            return 0;
        }
        if (args.Length != 4 || args[0] != "press" || (args[1] != "F8" && args[1] != "F9" && args[1] != "F10")) return 2;
        int repeats, hold;
        if (!Int32.TryParse(args[2], out repeats) || repeats < 1 || repeats > 20 || !Int32.TryParse(args[3], out hold) || hold < 50 || hold > 3000) return 2;
        foreach (int modifier in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C })
            if ((GetAsyncKeyState(modifier) & 0x8000) != 0) { Console.Error.WriteLine("Release modifier keys before the test."); return 3; }
        byte key = args[1] == "F8" ? (byte)0x77 : args[1] == "F9" ? (byte)0x78 : (byte)0x79;
        try
        {
            for (int i = 0; i < repeats; i++)
            {
                keybd_event(key, 0, 0, UIntPtr.Zero);
                Thread.Sleep(Math.Max(1, hold / repeats));
            }
        }
        finally { keybd_event(key, 0, 2, UIntPtr.Zero); }
        Console.WriteLine("{\"pressed\":\"" + args[1] + "\",\"keydowns\":" + repeats + "}");
        return 0;
    }
}

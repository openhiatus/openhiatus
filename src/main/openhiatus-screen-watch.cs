// Observe only: foreground geometry and an input revision, never key values or text.
// Both hooks always pass through. Parent exit or stdin EOF releases all handles.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
internal static class ScreenWatch {
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Position; public uint Private; }
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message message);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string module);
  static long revision; static volatile bool stopped;
  static readonly Hook Keyboard = (code,message,data) => { if(code>=0 && (message.ToInt64()==0x100 || message.ToInt64()==0x104)) Interlocked.Increment(ref revision); return CallNextHookEx(IntPtr.Zero,code,message,data); };
  static readonly Hook Mouse = (code,message,data) => { long m=message.ToInt64(); if(code>=0 && (m==0x201 || m==0x204 || m==0x207 || m==0x20A || m==0x20E || m==0x20B)) Interlocked.Increment(ref revision); return CallNextHookEx(IntPtr.Zero,code,message,data); };
  static int Main(string[] args) {
    if(args.Length!=1) return 2;
    IntPtr keyboard=IntPtr.Zero, mouse=IntPtr.Zero;
    try {
      var parent=Process.GetProcessById(int.Parse(args[0]));
      keyboard=SetWindowsHookEx(13,Keyboard,GetModuleHandle(null),0); mouse=SetWindowsHookEx(14,Mouse,GetModuleHandle(null),0);
      if(keyboard==IntPtr.Zero || mouse==IntPtr.Zero) return 3;
      new Thread(() => { try { Console.In.ReadLine(); } catch {} stopped=true; }) { IsBackground=true }.Start();
      var clock=Stopwatch.StartNew(); long lastProbe=-100;
      while(!stopped && !parent.HasExited) {
        Message message; while(PeekMessage(out message,IntPtr.Zero,0,0,1)) { TranslateMessage(ref message); DispatchMessage(ref message); }
        if(clock.ElapsedMilliseconds-lastProbe>=50) {
          lastProbe=clock.ElapsedMilliseconds; var window=GetForegroundWindow(); Rect r; if(window==IntPtr.Zero || !GetWindowRect(window,out r)) return 4;
          string stamp=window.ToInt64()+":"+r.Left+":"+r.Top+":"+r.Right+":"+r.Bottom+":"+Interlocked.Read(ref revision);
          Console.WriteLine("{\"stamp\":\""+stamp+"\"}"); Console.Out.Flush();
        }
        Thread.Sleep(5);
      }
      return 0;
    } catch { return 5; }
    finally { if(keyboard!=IntPtr.Zero) UnhookWindowsHookEx(keyboard); if(mouse!=IntPtr.Zero) UnhookWindowsHookEx(mouse); }
  }
}

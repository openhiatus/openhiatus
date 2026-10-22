// Windows-only stdio host. Build with the Windows .NET Framework C# compiler.
// The job owns the complete native child tree before the first child instruction runs.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class OpenhiatusProcessHost
{
    private const uint Synchronize = 0x00100000;
    private const uint CreateSuspended = 0x00000004;
    private const uint CreateNoWindow = 0x08000000;
    private const uint CreateNewConsole = 0x00000010;
    private const uint CreateBreakawayFromJob = 0x01000000;
    private const uint KillOnJobClose = 0x00002000;
    private const uint BreakawayOk = 0x00000800;
    private const int JobExtendedLimits = 9;
    private const int JobBasicAccounting = 1;

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits {
        public long PerProcessUserTime, PerJobUserTime;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Accounting {
        public long TotalUserTime, TotalKernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaultCount, TotalProcesses, ActiveProcesses, TotalTerminatedProcesses;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo {
        public int Size;
        public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public short ShowWindow, ReservedSize;
        public IntPtr ReservedPointer, StdInput, StdOutput, StdError;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation {
        public IntPtr Process, Thread;
        public uint ProcessId, ThreadId;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry {
        public uint Size, Usage, ProcessId;
        public UIntPtr DefaultHeap;
        public uint ModuleId, Threads, ParentId;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Executable;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr OpenJobObject(uint desiredAccess, bool inherit, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits information, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting information, uint length, IntPtr returnLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int kind, out ExtendedLimits information, uint length, IntPtr returnLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int kind, IntPtr information, uint length, IntPtr returnLength);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", EntryPoint = "Process32NextW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(string applicationName, StringBuilder commandLine, IntPtr processAttributes,
        IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string currentDirectory,
        ref StartupInfo startupInfo, out ProcessInformation processInformation);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool waitAll, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateEvent(IntPtr attributes, bool manualReset, bool initialState, string name);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr OpenEvent(uint desiredAccess, bool inheritHandle, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetEvent(IntPtr handle);

    private static string EventName(string id) {
        Guid value;
        if (!Guid.TryParse(id, out value)) throw new ArgumentException("Invalid control identifier.");
        return "Local\\openhiatusStop-" + value.ToString("N");
    }

    // The Windows CRT argv quoting rules: trailing backslashes before the final quote must double.
    private static string Quote(string value) {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char ch in value) {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
            else { result.Append('\\', slashes); result.Append(ch); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }

    // Only an explicit handoff leaves the managed job. Normal commands (including delayed
    // desktop input) still inherit its lifetime. Never use SILENT_BREAKAWAY_OK.
    private static int LaunchIndependent(string[] args) {
        int index = 1;
        bool hidden = index < args.Length && args[index] == "--hidden";
        if (hidden) index++;
        if (index + 1 >= args.Length || args[index] != "--" || !Path.IsPathRooted(args[index + 1])) return 64;
        index++;
        IntPtr owner = IntPtr.Zero;
        ProcessInformation launched = new ProcessInformation();
        bool resumed = false;
        try {
            // NULL queries can describe an outer job in a nested-job environment.
            // Check the exact openHiatus job rather than trusting that ambient result.
            string name = Environment.GetEnvironmentVariable("OPENHIATUS_HANDOFF_JOB");
            if (!String.IsNullOrEmpty(name)) owner = OpenJobObject(0x0004, false, name); // JOB_OBJECT_QUERY
            bool inJob;
            ExtendedLimits limits;
            if (owner == IntPtr.Zero || !IsProcessInJob(new IntPtr(-1), owner, out inJob) || !inJob
                || !QueryInformationJobObject(owner, JobExtendedLimits, out limits,
                    (uint)Marshal.SizeOf(typeof(ExtendedLimits)), IntPtr.Zero)
                || (limits.Basic.LimitFlags & BreakawayOk) == 0) {
                Console.Error.WriteLine("Independent launch requires an openHiatus host with explicit handoff enabled.");
                return 66;
            }
            StringBuilder command = new StringBuilder();
            for (int i = index; i < args.Length; i++) { if (i > index) command.Append(' '); command.Append(Quote(args[i])); }
            StartupInfo startup = new StartupInfo();
            startup.Size = Marshal.SizeOf(typeof(StartupInfo));
            if (hidden) { startup.Flags = 0x00000001; startup.ShowWindow = 0; }
            // No inherited stdio: independent applications cannot retain RPC pipes.
            // Verify the handoff before allowing the first application instruction.
            if (!CreateProcess(args[index], command, IntPtr.Zero, IntPtr.Zero, false,
                CreateSuspended | CreateBreakawayFromJob | (hidden ? CreateNoWindow : CreateNewConsole),
                IntPtr.Zero, Environment.CurrentDirectory, ref startup, out launched)) throw new Win32Exception();
            bool stillOwned;
            if (!IsProcessInJob(launched.Process, owner, out stillOwned) || stillOwned) throw new InvalidOperationException();
            if (ResumeThread(launched.Thread) == UInt32.MaxValue) throw new Win32Exception();
            resumed = true;
            Console.WriteLine("{\"pid\":" + launched.ProcessId + "}");
            return 0;
        }
        finally {
            if (launched.Process != IntPtr.Zero && !resumed) TerminateProcess(launched.Process, 137);
            if (launched.Thread != IntPtr.Zero) CloseHandle(launched.Thread);
            if (launched.Process != IntPtr.Zero) CloseHandle(launched.Process);
            if (owner != IntPtr.Zero) CloseHandle(owner);
        }
    }

    private static string OwnedProcessImage(uint id, IntPtr owner) {
        IntPtr process = OpenProcess(0x1000, false, id);
        if (process == IntPtr.Zero) return null;
        try {
            bool stillOwned;
            if (!IsProcessInJob(process, owner, out stillOwned) || !stillOwned) return null;
            StringBuilder image = new StringBuilder(32768); uint length = (uint)image.Capacity;
            return QueryFullProcessImageName(process, 0, image, ref length) ? image.ToString() : null;
        } finally { CloseHandle(process); }
    }

    // Query-only: count work retained inside the managed agent process tree.
    private static int InspectJob(string name, uint controlChild) {
        const string prefix = "Local\\openhiatusWork-";
        Guid identifier;
        if (controlChild == 0 || !name.StartsWith(prefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(name.Substring(prefix.Length), "N", out identifier)) return 64;
        IntPtr owner = OpenJobObject(0x0004, false, name); // JOB_OBJECT_QUERY only.
        if (owner == IntPtr.Zero) throw new Win32Exception();
        try {
            Accounting accounting;
            if (!QueryInformationJobObject(owner, JobBasicAccounting, out accounting,
                (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw new Win32Exception();
            if (accounting.ActiveProcesses == 0 || accounting.ActiveProcesses > 4096) throw new InvalidOperationException();
            int bytes = 8 + IntPtr.Size * ((int)accounting.ActiveProcesses + 32);
            IntPtr list = Marshal.AllocHGlobal(bytes);
            IntPtr snapshot = IntPtr.Zero;
            try {
                if (!QueryInformationJobObject(owner, 3, list, (uint)bytes, IntPtr.Zero)) throw new Win32Exception();
                int count = Marshal.ReadInt32(list, 4);
                if (count < 1 || count > (bytes - 8) / IntPtr.Size) throw new InvalidOperationException();
                uint[] ids = new uint[count];
                bool hasControl = false;
                for (int i = 0; i < count; i++) {
                    ids[i] = (uint)(IntPtr.Size == 8 ? Marshal.ReadInt64(list, 8 + i * 8) : Marshal.ReadInt32(list, 8 + i * 4));
                    if (ids[i] == controlChild) hasControl = true;
                }
                if (!hasControl) throw new InvalidOperationException();
                int managed = count;
                snapshot = CreateToolhelp32Snapshot(2, 0);
                if (snapshot == new IntPtr(-1)) throw new Win32Exception();
                ProcessEntry entry = new ProcessEntry(); entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
                if (!Process32First(snapshot, ref entry)) throw new Win32Exception();
                List<ProcessEntry> members = new List<ProcessEntry>();
                do { if (Array.IndexOf(ids, entry.ProcessId) >= 0) members.Add(entry); }
                while (Process32Next(snapshot, ref entry));
                HashSet<uint> consoleOwners = new HashSet<uint>(); consoleOwners.Add(controlChild);
                HashSet<uint> excludedConsoles = new HashSet<uint>();
                foreach (ProcessEntry candidate in members) {
                    if (!consoleOwners.Contains(candidate.ParentId) || excludedConsoles.Contains(candidate.ParentId)
                        || !String.Equals(candidate.Executable, "conhost.exe", StringComparison.OrdinalIgnoreCase)) continue;
                    if (!String.Equals(OwnedProcessImage(candidate.ProcessId, owner), Path.Combine(Environment.SystemDirectory, "conhost.exe"), StringComparison.OrdinalIgnoreCase)) continue;
                    excludedConsoles.Add(candidate.ParentId); managed--; // One system console per verified control owner.
                }
                Console.WriteLine("{\"activeProcesses\":" + count + ",\"managedProcesses\":" + managed + "}");
            } finally {
                if (snapshot != IntPtr.Zero && snapshot != new IntPtr(-1)) CloseHandle(snapshot);
                Marshal.FreeHGlobal(list);
            }
            return 0;
        }
        finally { CloseHandle(owner); }
    }

    private static int Main(string[] args) {
        IntPtr job = IntPtr.Zero, parent = IntPtr.Zero, stop = IntPtr.Zero;
        ProcessInformation child = new ProcessInformation();
        bool assigned = false;
        try {
            uint inspectedChild;
            if (args.Length == 3 && args[0] == "--inspect-job" && UInt32.TryParse(args[2], out inspectedChild)) return InspectJob(args[1], inspectedChild);
            if (args.Length > 0 && args[0] == "--launch-independent") return LaunchIndependent(args);
            if (args.Length == 2 && args[0] == "--stop") {
                stop = OpenEvent(0x0002, false, EventName(args[1]));
                return stop != IntPtr.Zero && SetEvent(stop) ? 0 : 2;
            }
            uint parentId;
            if (args.Length < 6 || args[0] != "--parent" || !UInt32.TryParse(args[1], out parentId)
                || args[2] != "--control") return 64;
            bool allowHandoff = args[4] == "--allow-handoff";
            int separator = allowHandoff ? 5 : 4;
            if (args.Length <= separator + 1 || args[separator] != "--") return 64;
            int executableIndex = separator + 1;
            parent = OpenProcess(Synchronize, false, parentId);
            if (parent == IntPtr.Zero) throw new Win32Exception();
            stop = CreateEvent(IntPtr.Zero, true, false, EventName(args[3]));
            if (stop == IntPtr.Zero) throw new Win32Exception();
            string jobName = "Local\\openhiatusWork-" + Guid.Parse(args[3]).ToString("N");
            job = CreateJobObject(IntPtr.Zero, jobName);
            if (job == IntPtr.Zero) throw new Win32Exception();
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.LimitFlags = KillOnJobClose | (allowHandoff ? BreakawayOk : 0);
            if (!SetInformationJobObject(job, JobExtendedLimits, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) throw new Win32Exception();
            Environment.SetEnvironmentVariable("OPENHIATUS_HANDOFF_JOB", allowHandoff ? jobName : null);

            StartupInfo startup = new StartupInfo();
            startup.Size = Marshal.SizeOf(typeof(StartupInfo));
            startup.Flags = 0x00000100; // STARTF_USESTDHANDLES
            startup.StdInput = GetStdHandle(-10); startup.StdOutput = GetStdHandle(-11); startup.StdError = GetStdHandle(-12);
            foreach (IntPtr handle in new IntPtr[] { startup.StdInput, startup.StdOutput, startup.StdError }) {
                if (!SetHandleInformation(handle, 1, 1)) throw new Win32Exception();
            }
            StringBuilder command = new StringBuilder();
            for (int i = executableIndex; i < args.Length; i++) { if (i > executableIndex) command.Append(' '); command.Append(Quote(args[i])); }
            if (!CreateProcess(args[executableIndex], command, IntPtr.Zero, IntPtr.Zero, true, CreateSuspended | CreateNoWindow,
                IntPtr.Zero, Environment.CurrentDirectory, ref startup, out child)) throw new Win32Exception();
            if (!AssignProcessToJobObject(job, child.Process)) throw new Win32Exception();
            assigned = true;
            Console.WriteLine("{\"method\":\"openhiatus/host/child\",\"params\":{\"control\":\"" + args[3] + "\",\"pid\":" + child.ProcessId + "}}");
            if (ResumeThread(child.Thread) == UInt32.MaxValue) throw new Win32Exception();
            CloseHandle(child.Thread); child.Thread = IntPtr.Zero;

            uint wait = WaitForMultipleObjects(3, new IntPtr[] { child.Process, parent, stop }, false, UInt32.MaxValue);
            if (wait == UInt32.MaxValue) throw new Win32Exception();
            uint childExit = 0;
            if (wait == 0 && !GetExitCodeProcess(child.Process, out childExit)) throw new Win32Exception();
            // Normal server exit also ends leftover workers. Stop/parent death ends the entire job.
            if (!TerminateJobObject(job, 137)) throw new Win32Exception();
            for (int attempt = 0; attempt < 500; attempt++) {
                Accounting accounting;
                if (!QueryInformationJobObject(job, JobBasicAccounting, out accounting,
                    (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw new Win32Exception();
                if (accounting.ActiveProcesses == 0) return wait == 0 ? unchecked((int)childExit) : 0;
                Thread.Sleep(10);
            }
            return 70; // no confirmed clean shutdown; closing the last job handle still enforces termination
        }
        catch (Exception) {
            // No arguments, environment, provider response or keys are written to diagnostics.
            Console.Error.WriteLine("openHiatus process containment failed.");
            return 71;
        }
        finally {
            if (child.Process != IntPtr.Zero && !assigned) TerminateProcess(child.Process, 137);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (child.Thread != IntPtr.Zero) CloseHandle(child.Thread);
            if (child.Process != IntPtr.Zero) CloseHandle(child.Process);
            if (parent != IntPtr.Zero) CloseHandle(parent);
            if (stop != IntPtr.Zero) CloseHandle(stop);
        }
    }
}

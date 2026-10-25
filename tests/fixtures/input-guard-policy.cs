using System;
internal static class InputGuardPolicyTests {
    static void Check(bool value, string label) { if (!value) throw new Exception(label); }
    static int Main() {
        var p = new DesktopInputPolicy();
        Check(!p.Keyboard(65, 0, false), "Preparing must leave input free");
        p.Locked = true;
        Check(p.Keyboard(65, 0, false) && p.Keyboard(65, 0, true), "Physical key down/up blocked");
        Check(p.Mouse(0, false) && p.Mouse(0, true), "Physical mouse blocked");
        Check(!p.Keyboard(65, 0x10, false) && !p.Mouse(1, false), "Injected agent input allowed");
        Check(!p.Keyboard(0x1B, 0x10, false) && !p.Escape, "Agent Escape must not stop the task");
        p.VoiceF8 = true; p.VoiceF9 = true;
        Check(p.Keyboard(0x77, 0, false) && p.VoicePress == 1, "F8 intercepted for voice, never sent to app");
        p.VoicePress = 0; p.Keyboard(0x77, 0, false); Check(p.VoicePress == 0, "No held-key repeats");
        p.Keyboard(0x77, 0, true); p.Keyboard(0x77, 0, false); Check(p.VoicePress == 1, "Second physical voice press");
        p.VoicePress = 0; Check(p.Keyboard(0x78, 0, false) && p.VoicePress == 2, "F9 intercepted for transcript submission");
        p.VoicePress = 0; p.Keyboard(0x78, 0, false); Check(p.VoicePress == 0, "No F9 held-key repeats");
        Check(p.Keyboard(0x1B, 0, false) && p.Escape && p.Stopping, "Physical Esc triggers immediate halt");
        Check(p.Keyboard(65, 0x10, false) && p.Mouse(1, false), "No new agent input after Esc");
        Check(!p.Keyboard(65, 0x10, true) && !p.Mouse(1, true), "Cleanup may release agent keys/buttons");
        var chord = new DesktopInputPolicy { Locked = true };
        chord.Keyboard(0xA2, 0, false); chord.Keyboard(0xA4, 0, false); chord.Keyboard(0x7B, 0, false);
        Check(chord.Escape && chord.Stopping, "Ctrl Alt F12 fallback");
        Console.WriteLine("Input guard policy passed."); return 0;
    }
}

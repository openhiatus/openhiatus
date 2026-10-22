using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// A local, disposable GUI fixture. It writes only its result file in the
// explicitly supplied test directory and never controls another application.
internal sealed class OpenhiatusComputerFixture : Form
{
    private readonly string resultPath;
    private readonly Label heading = new Label();
    private readonly Label instructions = new Label();
    private readonly Label inputLabel = new Label();
    private readonly TextBox input = new TextBox();
    private readonly Button save = new Button();
    private readonly Button changeView = new Button();
    private readonly Label status = new Label();
    private readonly List<object> history = new List<object>();
    private int layout = 1;
    private int clickCount = 0;
    private int layoutChanges = 0;

    private OpenhiatusComputerFixture(string testDirectory)
    {
        resultPath = Path.Combine(testDirectory, "Computer-Test-Ergebnis.json");
        Text = "openhiatus Computer-Test";
        AccessibleName = Text;
        StartPosition = FormStartPosition.CenterScreen;
        TopMost = true; // Keep the isolated fixture visible during the foreground-input test.
        ClientSize = new Size(920, 600);
        MinimumSize = new Size(780, 560);
        Font = new Font("Segoe UI", 12F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(243, 246, 250);

        heading.Font = new Font("Segoe UI", 21F, FontStyle.Bold);
        heading.ForeColor = Color.FromArgb(27, 43, 66);
        instructions.Text = "Trage den beauftragten Prüftext ein und speichere ihn.\n„Ansicht wechseln“ ordnet dieselben Bedienelemente neu an.";
        inputLabel.Text = "Prüftext";
        inputLabel.Font = new Font(Font, FontStyle.Bold);
        input.AccessibleName = "Prüftext";
        input.Multiline = true;
        input.AcceptsReturn = true;
        input.ScrollBars = ScrollBars.Vertical;
        input.TabIndex = 0;
        save.Text = "Prüftext speichern";
        save.AccessibleName = save.Text;
        save.TabIndex = 1;
        save.BackColor = Color.FromArgb(209, 233, 255);
        save.Click += SaveResult;
        changeView.Text = "Ansicht wechseln";
        changeView.AccessibleName = changeView.Text;
        changeView.TabIndex = 2;
        changeView.Click += delegate {
            layout = layout == 1 ? 2 : 1;
            layoutChanges++;
            ApplyLayout();
            status.Text = "Ansicht gewechselt. Der bisherige Prüftext bleibt erhalten.";
        };
        status.ForeColor = Color.FromArgb(35, 76, 54);
        status.Text = "Bereit. Noch kein Prüftext gespeichert.";

        Controls.AddRange(new Control[] { heading, instructions, inputLabel, input, save, changeView, status });
        Resize += delegate { ApplyLayout(); };
        ApplyLayout();
    }

    private void ApplyLayout()
    {
        int width = ClientSize.Width;
        int height = ClientSize.Height;
        heading.Text = "Computer-Test · Ansicht " + layout;
        heading.SetBounds(30, 22, width - 60, 55);
        instructions.SetBounds(32, 83, width - 64, 65);
        if (layout == 1)
        {
            inputLabel.SetBounds(32, 167, width - 64, 30);
            input.SetBounds(32, 201, width - 64, Math.Max(110, height - 337));
            save.SetBounds(32, height - 111, 235, 49);
            changeView.SetBounds(width - 267, height - 111, 235, 49);
        }
        else
        {
            inputLabel.SetBounds(337, 167, width - 369, 30);
            input.SetBounds(337, 201, width - 369, Math.Max(110, height - 274));
            save.SetBounds(32, 213, 255, 61);
            changeView.SetBounds(32, 329, 255, 61);
        }
        status.SetBounds(32, height - 46, width - 64, 35);
    }

    private void SaveResult(object sender, EventArgs args)
    {
        int nextCount = clickCount + 1;
        string savedAt = DateTime.UtcNow.ToString("o");
        object entry = new { text = input.Text, clickCount = nextCount, layout = layout, savedAt = savedAt };
        history.Add(entry);
        try
        {
            string json = new JavaScriptSerializer().Serialize(new {
                text = input.Text,
                clickCount = nextCount,
                layout = layout,
                layoutChanges = layoutChanges,
                savedAt = savedAt,
                history = history
            });
            File.WriteAllText(resultPath, json + Environment.NewLine, new UTF8Encoding(false));
            clickCount = nextCount;
            status.Text = "Gespeichert: " + clickCount + " · Ansicht " + layout;
        }
        catch (Exception error)
        {
            history.RemoveAt(history.Count - 1);
            status.Text = "Speichern fehlgeschlagen: " + error.Message;
        }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 2 || args[0] != "--test-directory" || !Path.IsPathRooted(args[1])) return 64;
        string testDirectory = Path.GetFullPath(args[1]);
        if (!Directory.Exists(testDirectory)) return 66;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (OpenhiatusComputerFixture fixture = new OpenhiatusComputerFixture(testDirectory))
        {
            Application.Run(fixture);
        }
        return 0;
    }
}

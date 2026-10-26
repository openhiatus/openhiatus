// Build-time rendering of the application's existing crossed-ellipse mark.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
class OpenhiatusIcon {
    static Bitmap Draw(int size) {
        var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap)) {
            g.SmoothingMode = SmoothingMode.AntiAlias; g.ScaleTransform(size / 256f, size / 256f);
            using (var background = new SolidBrush(Color.FromArgb(24, 32, 25)))
            using (var contour = new Pen(Color.FromArgb(63, 79, 45), 3))
            using (var outline = new GraphicsPath()) {
                outline.AddArc(2, 2, 72, 72, 180, 90); outline.AddArc(182, 2, 72, 72, 270, 90);
                outline.AddArc(182, 182, 72, 72, 0, 90); outline.AddArc(2, 182, 72, 72, 90, 90); outline.CloseFigure();
                g.FillPath(background, outline); g.DrawPath(contour, outline);
                var accent = Color.FromArgb(210, 231, 166);
                using (var stroke = new Pen(accent, 8)) using (var fill = new SolidBrush(accent)) {
                    foreach (float rotation in new float[] {29, -29}) {
                        var state = g.Save(); g.TranslateTransform(128, 128); g.RotateTransform(rotation);
                        g.DrawEllipse(stroke, -58, -89, 116, 178); g.Restore(state);
                    }
                    g.FillEllipse(fill, 117, 117, 22, 22);
                    g.FillEllipse(background, 193, 70, 26, 26); g.DrawEllipse(stroke, 193, 70, 26, 26);
                }
            }
        }
        return bitmap;
    }
    static void Main(string[] args) {
        int[] sizes = {16, 24, 32, 48, 64, 128, 256}; var images = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++) using (var bitmap = Draw(sizes[i])) using (var data = new MemoryStream()) {
            bitmap.Save(data, ImageFormat.Png); images[i] = data.ToArray();
            if (sizes[i] == 256) bitmap.Save(args[1], ImageFormat.Png);
        }
        using (var writer = new BinaryWriter(File.Create(args[0]))) {
            writer.Write((ushort)0); writer.Write((ushort)1); writer.Write((ushort)sizes.Length);
            int offset = 6 + 16 * sizes.Length;
            for (int i = 0; i < sizes.Length; i++) {
                writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i])); writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
                writer.Write((byte)0); writer.Write((byte)0); writer.Write((ushort)1); writer.Write((ushort)32);
                writer.Write(images[i].Length); writer.Write(offset); offset += images[i].Length;
            }
            foreach (var data in images) writer.Write(data);
        }
    }
}

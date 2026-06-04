using System.IO;
using System.Text.Json;

namespace DesktopAdmin.Services;

public sealed class AppSettings
{
    private static readonly string SettingsPath = Path.Combine(
        AppContext.BaseDirectory,
        "settings.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    public string ApiUrl { get; set; } = "https://urlopy-api-svvhqvitka-lm.a.run.app";

    public string LastEmail { get; set; } = "serwis@kotlycamino.pl";

    // Window geometry per window key
    public Dictionary<string, WindowGeometry> Windows { get; set; } = new();

    // Column widths per window key, per column header
    public Dictionary<string, Dictionary<string, double>> ColumnWidths { get; set; } = new();

    public WindowGeometry GetWindow(string key) =>
        Windows.TryGetValue(key, out var g) ? g : new WindowGeometry();

    public void SetWindow(string key, WindowGeometry geometry) =>
        Windows[key] = geometry;

    public Dictionary<string, double> GetColumns(string key) =>
        ColumnWidths.TryGetValue(key, out var c) ? c : new Dictionary<string, double>();

    public void SetColumns(string key, Dictionary<string, double> columns) =>
        ColumnWidths[key] = columns;

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                return JsonSerializer.Deserialize<AppSettings>(json, JsonOptions) ?? new AppSettings();
            }
        }
        catch
        {
            // Return defaults on any error.
        }

        return new AppSettings();
    }

    public void Save()
    {
        try
        {
            File.WriteAllText(SettingsPath, JsonSerializer.Serialize(this, JsonOptions));
        }
        catch
        {
            // Don't crash the app on settings save failure.
        }
    }
}

public sealed class WindowGeometry
{
    public double Left { get; set; } = double.NaN;
    public double Top { get; set; } = double.NaN;
    public double Width { get; set; } = double.NaN;
    public double Height { get; set; } = double.NaN;
    public bool Maximized { get; set; } = false;
}

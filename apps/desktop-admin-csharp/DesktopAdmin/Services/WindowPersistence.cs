using System.Windows;
using System.Windows.Controls;

namespace DesktopAdmin.Services;

/// <summary>
/// Attaches window geometry and DataGrid column width persistence to a window.
/// Call Attach() once in the window constructor after InitializeComponent().
/// </summary>
public static class WindowPersistence
{
    public static void Attach(Window window, AppSettings settings, string windowKey, params DataGrid[] grids)
    {
        // Restore geometry
        var geo = settings.GetWindow(windowKey);

        if (!double.IsNaN(geo.Width) && geo.Width > 100)
        {
            window.Width = geo.Width;
        }

        if (!double.IsNaN(geo.Height) && geo.Height > 100)
        {
            window.Height = geo.Height;
        }

        if (!double.IsNaN(geo.Left) && !double.IsNaN(geo.Top))
        {
            window.WindowStartupLocation = WindowStartupLocation.Manual;
            window.Left = geo.Left;
            window.Top = geo.Top;
        }

        if (geo.Maximized)
        {
            window.WindowState = WindowState.Maximized;
        }

        // Restore column widths once grids are loaded
        window.Loaded += (_, _) =>
        {
            var saved = settings.GetColumns(windowKey);
            foreach (var grid in grids)
            {
                RestoreColumns(grid, saved);
            }
        };

        // Save on close
        window.Closing += (_, _) =>
        {
            if (window.WindowState == WindowState.Maximized)
            {
                settings.SetWindow(windowKey, new WindowGeometry { Maximized = true });
            }
            else if (window.WindowState == WindowState.Normal)
            {
                settings.SetWindow(windowKey, new WindowGeometry
                {
                    Left = window.Left,
                    Top = window.Top,
                    Width = window.ActualWidth,
                    Height = window.ActualHeight,
                    Maximized = false,
                });
            }

            var columnSnapshot = new Dictionary<string, double>();
            foreach (var grid in grids)
            {
                SaveColumns(grid, columnSnapshot);
            }

            settings.SetColumns(windowKey, columnSnapshot);
            settings.Save();
        };
    }

    private static void RestoreColumns(DataGrid grid, Dictionary<string, double> saved)
    {
        foreach (var col in grid.Columns)
        {
            var header = col.Header?.ToString();
            if (header is not null && saved.TryGetValue(header, out var width) && width > 10)
            {
                col.Width = new DataGridLength(width, DataGridLengthUnitType.Pixel);
            }
        }
    }

    private static void SaveColumns(DataGrid grid, Dictionary<string, double> target)
    {
        foreach (var col in grid.Columns)
        {
            var header = col.Header?.ToString();
            if (header is not null)
            {
                target[header] = col.ActualWidth;
            }
        }
    }
}

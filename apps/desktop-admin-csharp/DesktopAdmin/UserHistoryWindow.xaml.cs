using DesktopAdmin.Models;
using Microsoft.Win32;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.IO;
using System.Windows;

namespace DesktopAdmin;

public partial class UserHistoryWindow : Window
{
    private readonly string _userDisplay;
    private readonly List<UserActivityEntry> _history;

    public UserHistoryWindow(UserSummary user, IEnumerable<UserActivityEntry> history)
    {
        InitializeComponent();
        _userDisplay = $"{user.Name} ({user.Email})";
        _history = history.ToList();
        HeaderTextBlock.Text = $"Historia użytkownika: {_userDisplay}";
        HistoryGrid.ItemsSource = _history;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void ExportPdfButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var saveDialog = new SaveFileDialog
            {
                Title = "Zapisz historię jako PDF",
                Filter = "Plik PDF (*.pdf)|*.pdf",
                FileName = $"historia-{SanitizeFileName(_userDisplay)}-{DateTime.Now:yyyyMMdd-HHmm}.pdf",
                AddExtension = true,
                DefaultExt = ".pdf",
            };

            if (saveDialog.ShowDialog(this) != true)
            {
                return;
            }

            QuestPDF.Settings.License = LicenseType.Community;

            Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.Margin(20);

                    page.Header().Column(column =>
                    {
                        column.Item().Text("Historia użytkownika").Bold().FontSize(18);
                        column.Item().Text($"Użytkownik: {_userDisplay}");
                        column.Item().Text($"Data eksportu: {DateTime.Now:dd.MM.yyyy HH:mm:ss}").FontSize(10);
                    });

                    page.Content().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(140);
                            columns.ConstantColumn(180);
                            columns.RelativeColumn();
                        });

                        table.Header(header =>
                        {
                            header.Cell().Element(CellStyle).Text("Data").Bold();
                            header.Cell().Element(CellStyle).Text("Akcja").Bold();
                            header.Cell().Element(CellStyle).Text("Szczegóły").Bold();
                        });

                        foreach (var item in _history)
                        {
                            table.Cell().Element(CellStyle).Text(item.CreatedAt ?? string.Empty);
                            table.Cell().Element(CellStyle).Text(item.Action ?? string.Empty);
                            table.Cell().Element(CellStyle).Text(item.Details ?? string.Empty);
                        }
                    });

                    page.Footer().AlignRight().Text(x =>
                    {
                        x.CurrentPageNumber();
                        x.Span(" / ");
                        x.TotalPages();
                    });
                });
            }).GeneratePdf(saveDialog.FileName);

            MessageBox.Show("Wyeksportowano historię do PDF.", "Sukces", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Nie udało się wyeksportować PDF: {ex.Message}", "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private static IContainer CellStyle(IContainer container)
    {
        return container.BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingVertical(4).PaddingHorizontal(3);
    }

    private static string SanitizeFileName(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var safe = new string(value.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray());
        return safe.Replace(' ', '-');
    }
}

using DesktopAdmin.Services;
using Microsoft.Win32;
using System.IO;
using System.Windows;

namespace DesktopAdmin;

public partial class OptionsWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly AppSettings _settings;
    private LeaveArchiveStore _archiveStore;
    private bool _passwordVisible = false;
    private static readonly string ChangeLogPath = Path.Combine(AppContext.BaseDirectory, "docs", "desktop-admin-changelog-1.0.md");

    public bool ApiSettingsChanged { get; private set; }
    public bool StoragePathChanged { get; private set; }

    public OptionsWindow(ApiClient apiClient)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _settings = AppSettings.Load();
        _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
        WindowPersistence.Attach(this, _settings, "Options");

        LoadChangeLog();
        LoadApiData();
        LoadStoragePathData();
        LoadCompanyData();
        Loaded += async (_, _) =>
        {
            await LoadEmailDataAsync();
            LoadTrashData();
        };
    }

    private void LoadChangeLog()
    {
        try
        {
            if (File.Exists(ChangeLogPath))
            {
                ChangeLogTextBox.Text = File.ReadAllText(ChangeLogPath);
                return;
            }
        }
        catch
        {
            // Fallback below.
        }

        ChangeLogTextBox.Text = "System Urlopowy Camino 1.0\r\n\r\nBrak pliku rejestru zmian.";
    }

    private void LoadApiData()
    {
        ApiUrlTextBox.Text = _settings.ApiUrl;
    }

    private void LoadStoragePathData()
    {
        StoragePathTextBox.Text = AppDataPaths.StorageDirectory;
    }

    private void LoadCompanyData()
    {
        CompanyNameTextBox.Text = _settings.CompanyName;
        CompanyAddressTextBox.Text = _settings.CompanyAddress;
        CompanyTaxIdTextBox.Text = _settings.CompanyTaxId;
        CompanyPhoneTextBox.Text = _settings.CompanyPhone;
    }

    private async Task LoadEmailDataAsync()
    {
        try
        {
            var mail = await _apiClient.GetMailSettingsAsync();
            GmailAddressTextBox.Text = string.IsNullOrWhiteSpace(mail.SmtpUser)
                ? mail.ImapUser
                : mail.SmtpUser;

            GmailPasswordBox.Clear();
            StatusTextBlock.Text = "Załadowano ustawienia adresu email.";
        }
        catch (Exception ex)
        {
            StatusTextBlock.Text = $"Błąd ładowania email: {ex.Message}";
        }
    }

    private void SaveCompanyButton_Click(object sender, RoutedEventArgs e)
    {
        _settings.CompanyName = CompanyNameTextBox.Text.Trim();
        _settings.CompanyAddress = CompanyAddressTextBox.Text.Trim();
        _settings.CompanyTaxId = CompanyTaxIdTextBox.Text.Trim();
        _settings.CompanyPhone = CompanyPhoneTextBox.Text.Trim();
        _settings.Save();

        StatusTextBlock.Text = "Zapisano dane firmy.";
    }

    private void SaveApiButton_Click(object sender, RoutedEventArgs e)
    {
        var apiUrl = ApiUrlTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(apiUrl))
        {
            MessageBox.Show("Podaj API URL.", "Brak URL", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var changed = !string.Equals(_settings.ApiUrl, apiUrl, StringComparison.OrdinalIgnoreCase);
        _settings.ApiUrl = apiUrl;
        _settings.Save();
        ApiSettingsChanged = changed;
        StatusTextBlock.Text = "Zapisano ustawienia API.";
    }

    private void BrowseStorageButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog
        {
            Title = "Wybierz katalog danych programu",
            InitialDirectory = StoragePathTextBox.Text,
        };

        if (dialog.ShowDialog() == true)
        {
            StoragePathTextBox.Text = dialog.FolderName;
        }
    }

    private void UseOneDriveButton_Click(object sender, RoutedEventArgs e)
    {
        StoragePathTextBox.Text = AppDataPaths.GetOneDriveSuggestedDirectory();
    }

    private void SaveStorageButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var changed = AppDataPaths.SetStorageDirectory(StoragePathTextBox.Text);
            StoragePathChanged = StoragePathChanged || changed;
            _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
            _settings.Save();
            LoadStoragePathData();
            LoadTrashData();
            StatusTextBlock.Text = changed
                ? "Zapisano katalog danych."
                : "Katalog danych bez zmian.";
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
            StatusTextBlock.Text = $"Błąd zapisu katalogu: {ex.Message}";
        }
    }

    private async void RefreshEmailButton_Click(object sender, RoutedEventArgs e)
    {
        await LoadEmailDataAsync();
    }

    private async void SaveEmailButton_Click(object sender, RoutedEventArgs e)
    {
        var gmail = GmailAddressTextBox.Text.Trim();
        var pass = _passwordVisible ? GmailPasswordVisibleTextBox.Text : GmailPasswordBox.Password;

        if (string.IsNullOrWhiteSpace(gmail) || string.IsNullOrWhiteSpace(pass))
        {
            MessageBox.Show("Podaj adres Gmail i hasło do emaila.", "Brak danych", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!gmail.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show("Użyj konta Gmail (adres musi kończyć się na @gmail.com).", "Nieprawidłowy adres", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            await _apiClient.UpdateMailSettingsAsync(new Models.UpdateMailSettingsRequest
            {
                SmtpHost = "smtp.gmail.com",
                SmtpPort = 587,
                SmtpUser = gmail,
                SmtpFrom = gmail,
                ImapHost = "imap.gmail.com",
                ImapPort = 993,
                ImapUser = gmail,
                ImapSecure = true,
                CommunicationMode = "MULTI",
                SmtpPass = pass,
                ImapPass = pass,
            });

            GmailPasswordBox.Clear();
            StatusTextBlock.Text = "Zapisano ustawienia Gmail.";
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
            StatusTextBlock.Text = $"Błąd zapisu email: {ex.Message}";
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void LoadTrashData()
    {
        TrashGrid.ItemsSource = _archiveStore.LoadTrash();
    }

    private void RefreshTrashButton_Click(object sender, RoutedEventArgs e)
    {
        LoadTrashData();
        StatusTextBlock.Text = "Odświeżono kosz.";
    }

    private void RestoreSelectedTrashButton_Click(object sender, RoutedEventArgs e)
    {
        var selected = TrashGrid.SelectedItems.Cast<Models.DeletedLeaveRequest>().ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show("Wybierz pozycje do przywrócenia.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        foreach (var item in selected)
        {
            _archiveStore.RestoreFromTrash(item);
        }

        LoadTrashData();
        StatusTextBlock.Text = $"Przywrócono {selected.Count} pozycji z kosza.";
    }

    private void RestoreAllTrashButton_Click(object sender, RoutedEventArgs e)
    {
        var all = _archiveStore.LoadTrash();
        if (all.Count == 0)
        {
            StatusTextBlock.Text = "Kosz jest pusty.";
            return;
        }

        foreach (var item in all)
        {
            _archiveStore.RestoreFromTrash(item);
        }

        LoadTrashData();
        StatusTextBlock.Text = "Przywrócono wszystkie pozycje z kosza.";
    }

    private void DeleteSelectedTrashButton_Click(object sender, RoutedEventArgs e)
    {
        var selected = TrashGrid.SelectedItems.Cast<Models.DeletedLeaveRequest>().ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show("Wybierz pozycje do usunięcia.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (MessageBox.Show("Usunąć trwale zaznaczone pozycje z kosza?", "Potwierdzenie", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            return;
        }

        foreach (var item in selected)
        {
            _archiveStore.RemoveFromTrash(item.Id);
        }

        LoadTrashData();
        StatusTextBlock.Text = $"Trwale usunięto {selected.Count} pozycji z kosza.";
    }

    private void ClearTrashButton_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Opróżnić cały kosz?", "Potwierdzenie", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            return;
        }

        _archiveStore.ClearTrash();
        LoadTrashData();
        StatusTextBlock.Text = "Opróżniono kosz.";
    }

    private void TogglePasswordButton_Click(object sender, RoutedEventArgs e)
    {
        if (_passwordVisible)
        {
            // Ukryj hasło
            GmailPasswordVisibleTextBox.Visibility = Visibility.Collapsed;
            GmailPasswordBox.Visibility = Visibility.Visible;
            GmailPasswordBox.Password = GmailPasswordVisibleTextBox.Text;
            TogglePasswordButton.Content = "Pokaż";
            _passwordVisible = false;
        }
        else
        {
            // Pokaż hasło
            GmailPasswordVisibleTextBox.Text = GmailPasswordBox.Password;
            GmailPasswordBox.Visibility = Visibility.Collapsed;
            GmailPasswordVisibleTextBox.Visibility = Visibility.Visible;
            TogglePasswordButton.Content = "Ukryj";
            _passwordVisible = true;
        }
    }
}

using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;
using System.Windows.Controls;
using System.Threading.Tasks;

namespace DesktopAdmin;

public partial class LoginWindow : Window
{
    private readonly AppSettings _settings = AppSettings.Load();
    private readonly LeaveArchiveStore _archiveStore;
    private readonly string? _rememberedUserEmail;
    private bool _isInitializing;

    public LoginWindow()
    {
        _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
        var loginMemory = _archiveStore.LoadLoginMemory();
        _rememberedUserEmail = loginMemory?.SelectedUserEmail;

        InitializeComponent();

        _isInitializing = true;
        WindowPersistence.Attach(this, _settings, "Login");

        RememberMeCheckBox.IsChecked = loginMemory?.RememberMe == true || _settings.RememberMe;
        PasswordBox.Password = "12345678";
        _isInitializing = false;

        Loaded += LoginWindow_Loaded;
    }

    private async void LoginWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await LoadUsersAsync();
    }

    private async Task LoadUsersAsync()
    {
        try
        {
            var apiClient = new ApiClient(_settings.ApiUrl);
            var users = await apiClient.GetLoginListAsync();
            UserComboBox.ItemsSource = users.ToList();

            var emailToRestore = !string.IsNullOrWhiteSpace(_rememberedUserEmail)
                ? _rememberedUserEmail
                : _settings.LastEmail;

            if (!string.IsNullOrEmpty(emailToRestore))
            {
                UserComboBox.SelectedValue = emailToRestore;
            }
        }
        catch (Exception ex)
        {
            ErrorTextBlock.Text = "Błąd ładowania listy użytkowników: " + ex.Message;
        }
    }

    private void OpenNextWindow(ApiClient apiClient, LoginResponse session)
    {
        Window nextWindow = session.User.Role switch
        {
            "ADMIN" => new MainWindow(apiClient, session),
            "EMPLOYEE" => new EmployeeWindow(apiClient, session),
            _ => throw new InvalidOperationException($"Nieobsługiwana rola: {session.User.Role}"),
        };

        nextWindow.Show();
        Close();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorTextBlock.Text = string.Empty;

        var apiUrl = _settings.ApiUrl;
        var email = UserComboBox.SelectedValue?.ToString();
        var password = ShowPasswordCheckBox.IsChecked == true ? PasswordTextBox.Text : PasswordBox.Password;

        if (string.IsNullOrWhiteSpace(apiUrl) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ErrorTextBlock.Text = "Wpisz email i hasło.";
            return;
        }

        try
        {
            IsEnabled = false;

            var apiClient = new ApiClient(apiUrl);
            var session = await apiClient.LoginAsync(email, password);

            _settings.Save();

            if (RememberMeCheckBox.IsChecked == true)
            {
                _archiveStore.SaveLoginMemory(email, email);
                _settings.RememberMe = true;
            }
            else
            {
                _archiveStore.ClearLoginMemory();
                _settings.RememberMe = false;
            }

            OpenNextWindow(apiClient, session);
        }
        catch (Exception ex)
        {
            ErrorTextBlock.Text = ex.Message;
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private void SwitchAccountButton_Click(object sender, RoutedEventArgs e)
    {
        PasswordBox.Clear();
        ErrorTextBlock.Text = string.Empty;
        UserComboBox.Focus();
    }

    private void ShowPassword_Checked(object sender, RoutedEventArgs e)
    {
        PasswordTextBox.Text = PasswordBox.Password;
        PasswordTextBox.Visibility = Visibility.Visible;
        PasswordBox.Visibility = Visibility.Collapsed;
    }

    private void ShowPassword_Unchecked(object sender, RoutedEventArgs e)
    {
        PasswordBox.Password = PasswordTextBox.Text;
        PasswordBox.Visibility = Visibility.Visible;
        PasswordTextBox.Visibility = Visibility.Collapsed;
    }

    private void UserComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isInitializing)
        {
            return;
        }
    }
}

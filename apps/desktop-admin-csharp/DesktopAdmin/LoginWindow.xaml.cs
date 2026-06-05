using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;

namespace DesktopAdmin;

public partial class LoginWindow : Window
{
    private readonly AppSettings _settings = AppSettings.Load();

    public LoginWindow()
    {
        InitializeComponent();

        WindowPersistence.Attach(this, _settings, "Login");

        ApiUrlTextBox.Text = _settings.ApiUrl;
        RememberMeCheckBox.IsChecked = _settings.RememberMe;
        PasswordBox.Password = "";

        Loaded += LoginWindow_Loaded;
    }

    private async void LoginWindow_Loaded(object sender, RoutedEventArgs e)
    {
        if (_settings.RememberMe && _settings.SavedSession != null)
        {
            var apiClient = new ApiClient(_settings.ApiUrl);
            apiClient.RestoreSession(_settings.SavedSession);

            OpenNextWindow(apiClient, _settings.SavedSession);
            return;
        }

        await LoadUsersListAsync();
    }

    private async Task LoadUsersListAsync()
    {
        try
        {
            IsEnabled = false;
            var apiUrl = ApiUrlTextBox.Text.Trim();
            if (string.IsNullOrWhiteSpace(apiUrl)) return;

            var apiClient = new ApiClient(apiUrl);
            var users = await apiClient.GetLoginListAsync();
            
            UserComboBox.ItemsSource = users;
            
            if (!string.IsNullOrEmpty(_settings.LastEmail))
            {
                UserComboBox.SelectedValue = _settings.LastEmail;
            }
            else if (users.Count > 0)
            {
                UserComboBox.SelectedIndex = 0;
            }
        }
        catch (Exception ex)
        {
            ErrorTextBlock.Text = "Nie udało się pobrać listy użytkowników: " + ex.Message;
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private void OpenNextWindow(ApiClient apiClient, LoginResponse session)
    {
        Window nextWindow = session.User.Role switch
        {
            "ADMIN" => new MainWindow(apiClient, session),
            "EMPLOYEE" => new EmployeeWindow(apiClient, session),
            _ => throw new InvalidOperationException($"Nieobslugiwana rola: {session.User.Role}"),
        };

        nextWindow.Show();
        Close();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorTextBlock.Text = string.Empty;

        var apiUrl = ApiUrlTextBox.Text.Trim();
        var email = UserComboBox.SelectedValue as string;
        var password = PasswordBox.Password;

        if (string.IsNullOrWhiteSpace(apiUrl) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ErrorTextBlock.Text = "Wybierz użytkownika i wpisz hasło.";
            return;
        }

        try
        {
            IsEnabled = false;

            var apiClient = new ApiClient(apiUrl);
            var session = await apiClient.LoginAsync(email, password);

            _settings.ApiUrl = apiUrl;
            _settings.LastEmail = email;
            _settings.RememberMe = RememberMeCheckBox.IsChecked == true;
            
            if (_settings.RememberMe)
            {
                _settings.SavedSession = session;
            }
            else
            {
                _settings.SavedSession = null;
            }
            
            _settings.Save();

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
}

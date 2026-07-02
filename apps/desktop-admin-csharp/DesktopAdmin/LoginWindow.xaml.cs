using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;
using System.Windows.Controls;
using System.Threading.Tasks;

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
        PasswordBox.Password = "12345678";

        Loaded += LoginWindow_Loaded;
    }

    private async void LoginWindow_Loaded(object sender, RoutedEventArgs e)
    {
        // Load users from API
        await LoadUsersAsync();

        if (_settings.RememberMe && _settings.SavedSession != null)
        {
            try
            {
                var apiClient = new ApiClient(_settings.ApiUrl);
                apiClient.RestoreSession(_settings.SavedSession);

                // Attempt to refresh token proactively if a saved session exists
                // This will throw UnauthorizedAccessException if refresh token is expired/invalid
                await apiClient.GetUsersAsync(); 

                OpenNextWindow(apiClient, _settings.SavedSession);
                return;
            }
            catch (UnauthorizedAccessException)
            {
                // Saved session is invalid, clear it and proceed to normal login
                _settings.SavedSession = null;
                _settings.RememberMe = false;
                _settings.Save();
                ErrorTextBlock.Text = "Zapisana sesja wygasła. Zaloguj się ponownie.";
            }
            catch (Exception ex)
            {
                ErrorTextBlock.Text = "Błąd automatycznego logowania: " + ex.Message;
            }
        }
    }

    private async Task LoadUsersAsync()
    {
        try
        {
            var apiClient = new ApiClient(_settings.ApiUrl);
            var users = await apiClient.GetLoginListAsync();
            UserComboBox.ItemsSource = users.ToList();

            if (!string.IsNullOrEmpty(_settings.LastEmail))
            {
                UserComboBox.SelectedValue = _settings.LastEmail;
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

        var apiUrl = ApiUrlTextBox.Text.Trim();
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

            _settings.ApiUrl = apiUrl;
            _settings.LastEmail = UserComboBox.SelectedValue?.ToString();
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
        EmailTextBox.Focus();
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

    private void ApiUrlTextBox_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        if (_settings != null)
        {
            _settings.SavedSession = null;
            _settings.RememberMe = false;
            _settings.Save();

            if (RememberMeCheckBox != null)
            {
                RememberMeCheckBox.IsChecked = false;
            }
        }
    }

    private void UserComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (UserComboBox.SelectedItem is UserSummary selectedUser)
        {
            EmailTextBox.Text = selectedUser.Email;
        }
    }
}

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
        EmailTextBox.Text = _settings.LastEmail;
        PasswordBox.Password = "12345678";
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        ErrorTextBlock.Text = string.Empty;

        var apiUrl = ApiUrlTextBox.Text.Trim();
        var email = EmailTextBox.Text.Trim();
        var password = PasswordBox.Password;

        if (string.IsNullOrWhiteSpace(apiUrl) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ErrorTextBlock.Text = "Wpisz API URL, email i haslo.";
            return;
        }

        try
        {
            IsEnabled = false;

            var apiClient = new ApiClient(apiUrl);
            var session = await apiClient.LoginAsync(email, password);

            _settings.ApiUrl = apiUrl;
            _settings.LastEmail = email;
            _settings.Save();

            Window nextWindow = session.User.Role switch
            {
                "ADMIN" => new MainWindow(apiClient, session),
                "EMPLOYEE" => new EmployeeWindow(apiClient, session),
                _ => throw new InvalidOperationException($"Nieobslugiwana rola: {session.User.Role}"),
            };

            nextWindow.Show();
            Close();
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
        EmailTextBox.Clear();
        PasswordBox.Clear();
        ErrorTextBlock.Text = string.Empty;
        EmailTextBox.Focus();
    }
}

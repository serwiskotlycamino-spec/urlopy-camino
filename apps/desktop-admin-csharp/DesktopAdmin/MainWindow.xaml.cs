using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;
using System.Windows.Controls;

namespace DesktopAdmin;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private const string DefaultApiUrl = "https://urlopy-api-svvhqvitka-lm.a.run.app";

    private ApiClient _apiClient;
    private LoginResponse? _session;

    public MainWindow()
        : this(new ApiClient(DefaultApiUrl), null)
    {
    }

    public MainWindow(ApiClient apiClient, LoginResponse? session)
    {
        InitializeComponent();
        _apiClient = apiClient;

        var settings = AppSettings.Load();
        WindowPersistence.Attach(this, settings, "Admin", PendingGrid, UsersGrid);

        ApiUrlTextBox.Text = _apiClient.BaseUrl;
        EmailTextBox.Text = "serwis@kotlycamino.pl";
        PasswordBox.Password = "Camino2023?";

        NewUserRoleCombo.ItemsSource = new[] { "ADMIN", "EMPLOYEE" };
        NewUserRoleCombo.SelectedIndex = 1;

        UpdateRoleCombo.ItemsSource = new[] { "ADMIN", "EMPLOYEE" };
        UpdateRoleCombo.SelectedIndex = 1;

        CommunicationModeCombo.ItemsSource = new[] { "MULTI", "EMAIL_ONLY" };
        CommunicationModeCombo.SelectedIndex = 0;

        if (session is not null)
        {
            _session = session;
            CurrentUserTextBlock.Text = $"Zalogowano: {session.User.Name} ({session.User.Role})";
            LoginPanel.Visibility = Visibility.Collapsed;
            ApplyApiButton.IsEnabled = false;
            MainTabs.IsEnabled = true;

            Loaded += async (_, _) =>
            {
                await RunBusyAsync(LoadAdminDataAsync);
            };
        }
    }

    private void SetStatus(string message)
    {
        StatusTextBlock.Text = message;
    }

    private bool IsAdmin()
    {
        return _session?.User.Role is "ADMIN";
    }

    private async Task RunBusyAsync(Func<Task> work)
    {
        try
        {
            IsEnabled = false;
            await work();
        }
        catch (Exception ex)
        {
            SetStatus($"Blad: {ex.Message}");
            MessageBox.Show(ex.Message, "Blad", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private async Task LoadAdminDataAsync()
    {
        var pending = await _apiClient.GetPendingAsync();
        PendingGrid.ItemsSource = pending;

        var users = await _apiClient.GetUsersAsync();
        UsersGrid.ItemsSource = users;

        var mail = await _apiClient.GetMailSettingsAsync();
        SmtpHostTextBox.Text = mail.SmtpHost;
        SmtpPortTextBox.Text = mail.SmtpPort.ToString();
        SmtpUserTextBox.Text = mail.SmtpUser;
        SmtpFromTextBox.Text = mail.SmtpFrom;
        ImapHostTextBox.Text = mail.ImapHost;
        ImapPortTextBox.Text = mail.ImapPort.ToString();
        ImapUserTextBox.Text = mail.ImapUser;
        ImapSecureCheck.IsChecked = mail.ImapSecure;
        CommunicationModeCombo.SelectedItem = mail.CommunicationMode;

        SetStatus("Dane administratora zaladowane.");
    }

    private LeaveRequest? GetSelectedLeaveRequest()
    {
        return PendingGrid.SelectedItem as LeaveRequest;
    }

    private UserSummary? GetSelectedUser()
    {
        return UsersGrid.SelectedItem as UserSummary;
    }

    private async Task DecideAsync(string decision)
    {
        var request = GetSelectedLeaveRequest();
        if (request is null)
        {
            MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var comment = DecisionCommentTextBox.Text.Trim();
        await _apiClient.DecideAsync(request.Id, decision, string.IsNullOrWhiteSpace(comment) ? null : comment);
        await LoadAdminDataAsync();
        SetStatus($"Wniosek #{request.Id} -> {decision}");
    }

    private void ApplyApiButton_Click(object sender, RoutedEventArgs e)
    {
        var url = ApiUrlTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(url))
        {
            MessageBox.Show("Podaj API URL.", "Brak URL", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        _apiClient = new ApiClient(url);
        MainTabs.IsEnabled = false;
        CurrentUserTextBlock.Text = string.Empty;
        _session = null;
        SetStatus($"Ustawiono API: {url}");
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var email = EmailTextBox.Text.Trim();
            var password = PasswordBox.Password;

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                throw new InvalidOperationException("Email i haslo sa wymagane.");
            }

            var session = await _apiClient.LoginAsync(email, password);
            _session = session;

            CurrentUserTextBlock.Text = $"Zalogowano: {session.User.Name} ({session.User.Role})";

            if (!IsAdmin())
            {
                MainTabs.IsEnabled = false;
                throw new InvalidOperationException("Ten panel jest przeznaczony tylko dla ADMIN.");
            }

            MainTabs.IsEnabled = true;
            await LoadAdminDataAsync();
        });
    }

    private async void RefreshPendingButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            PendingGrid.ItemsSource = await _apiClient.GetPendingAsync();
            SetStatus("Odswiezono liste oczekujacych.");
        });
    }

    private async void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("APPROVED"));
    }

    private async void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("REJECTED"));
    }

    private async void RefreshUsersButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            SetStatus("Odswiezono liste uzytkownikow.");
        });
    }

    private async void CreateUserButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var name = NewUserNameTextBox.Text.Trim();
            var email = NewUserEmailTextBox.Text.Trim();
            var password = NewUserPasswordTextBox.Text;
            var role = (NewUserRoleCombo.SelectedItem as string) ?? "EMPLOYEE";

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                throw new InvalidOperationException("Imie, email i haslo sa wymagane.");
            }

            await _apiClient.CreateUserAsync(new CreateUserRequest
            {
                Name = name,
                Email = email,
                Password = password,
                Role = role,
            });

            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            NewUserNameTextBox.Clear();
            NewUserEmailTextBox.Clear();
            NewUserPasswordTextBox.Clear();
            NewUserRoleCombo.SelectedIndex = 1;
            SetStatus($"Dodano uzytkownika: {email}");
        });
    }

    private async void UpdateRoleButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selected = GetSelectedUser();
            if (selected is null)
            {
                throw new InvalidOperationException("Wybierz uzytkownika do zmiany roli.");
            }

            var role = (UpdateRoleCombo.SelectedItem as string) ?? "EMPLOYEE";

            await _apiClient.UpdateUserRoleAsync(selected.Id, new UpdateRoleRequest
            {
                Role = role,
            });

            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            SetStatus($"Zmieniono role uzytkownika #{selected.Id}.");
        });
    }

    private async void RefreshMailButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var mail = await _apiClient.GetMailSettingsAsync();
            SmtpHostTextBox.Text = mail.SmtpHost;
            SmtpPortTextBox.Text = mail.SmtpPort.ToString();
            SmtpUserTextBox.Text = mail.SmtpUser;
            SmtpFromTextBox.Text = mail.SmtpFrom;
            ImapHostTextBox.Text = mail.ImapHost;
            ImapPortTextBox.Text = mail.ImapPort.ToString();
            ImapUserTextBox.Text = mail.ImapUser;
            ImapSecureCheck.IsChecked = mail.ImapSecure;
            CommunicationModeCombo.SelectedItem = mail.CommunicationMode;
            SetStatus("Odswiezono ustawienia mail.");
        });
    }

    private async void SaveMailButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            if (!int.TryParse(SmtpPortTextBox.Text.Trim(), out var smtpPort))
            {
                throw new InvalidOperationException("SMTP port musi byc liczba.");
            }

            if (!int.TryParse(ImapPortTextBox.Text.Trim(), out var imapPort))
            {
                throw new InvalidOperationException("IMAP port musi byc liczba.");
            }

            var request = new UpdateMailSettingsRequest
            {
                SmtpHost = SmtpHostTextBox.Text.Trim(),
                SmtpPort = smtpPort,
                SmtpUser = SmtpUserTextBox.Text.Trim(),
                SmtpFrom = SmtpFromTextBox.Text.Trim(),
                ImapHost = ImapHostTextBox.Text.Trim(),
                ImapPort = imapPort,
                ImapUser = ImapUserTextBox.Text.Trim(),
                ImapSecure = ImapSecureCheck.IsChecked == true,
                CommunicationMode = (CommunicationModeCombo.SelectedItem as string) ?? "MULTI",
                SmtpPass = string.IsNullOrWhiteSpace(SmtpPassBox.Password) ? null : SmtpPassBox.Password,
                ImapPass = string.IsNullOrWhiteSpace(ImapPassBox.Password) ? null : ImapPassBox.Password,
            };

            await _apiClient.UpdateMailSettingsAsync(request);
            SmtpPassBox.Clear();
            ImapPassBox.Clear();
            SetStatus("Zapisano ustawienia mail.");
        });
    }

    private void PendingGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (GetSelectedLeaveRequest() is { } selected)
        {
            DecisionCommentTextBox.Text = selected.ManagerComment ?? string.Empty;
        }
    }

    private void UsersGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (GetSelectedUser() is { } selected)
        {
            UpdateRoleCombo.SelectedItem = selected.Role;
            EditUserNameTextBox.Text = selected.Name;
            EditUserEmailTextBox.Text = selected.Email;
            EditUserPasswordTextBox.Text = string.Empty; // Hasła nie odczytujemy
        }
        else
        {
            EditUserNameTextBox.Text = string.Empty;
            EditUserEmailTextBox.Text = string.Empty;
            EditUserPasswordTextBox.Text = string.Empty;
        }
    }

    private async void UpdateUserButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selectedUser = GetSelectedUser();
            if (selectedUser is null)
            {
                MessageBox.Show("Wybierz użytkownika do edycji z tabeli powyżej.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var request = new UpdateUserSettingsRequest();
            
            if (!string.IsNullOrWhiteSpace(EditUserNameTextBox.Text) && EditUserNameTextBox.Text.Trim() != selectedUser.Name)
            {
                request.Name = EditUserNameTextBox.Text.Trim();
            }

            if (!string.IsNullOrWhiteSpace(EditUserEmailTextBox.Text) && EditUserEmailTextBox.Text.Trim() != selectedUser.Email)
            {
                request.Email = EditUserEmailTextBox.Text.Trim();
            }

            if (!string.IsNullOrWhiteSpace(EditUserPasswordTextBox.Text))
            {
                request.Password = EditUserPasswordTextBox.Text;
            }

            if (request.Name == null && request.Email == null && request.Password == null)
            {
                SetStatus("Brak zmian do zapisania.");
                return;
            }

            await _apiClient.UpdateUserSettingsAsync(selectedUser.Id, request);
            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            EditUserPasswordTextBox.Text = string.Empty;
            SetStatus($"Zaktualizowano dane użytkownika #{selectedUser.Id}.");
        });
    }

    private async void LogoutButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            try
            {
                await _apiClient.LogoutAsync();
            }
            catch
            {
                // Allow local logout even if API session is already invalid.
            }

            var settings = AppSettings.Load();
            settings.RememberMe = false;
            settings.SavedSession = null;
            settings.Save();

            var loginWindow = new LoginWindow();
            loginWindow.Show();
            Close();
        });
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void DeleteUserButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selectedUser = GetSelectedUser();
            if (selectedUser is null)
            {
                MessageBox.Show("Wybierz użytkownika do usunięcia.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var result = MessageBox.Show($"Czy na pewno chcesz usunąć użytkownika {selectedUser.Name} ({selectedUser.Email})?",
                                         "Potwierdź usunięcie",
                                         MessageBoxButton.YesNo,
                                         MessageBoxImage.Warning);

            if (result == MessageBoxResult.Yes)
            {
                await _apiClient.DeleteUserAsync(selectedUser.Id);
                UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
                SetStatus($"Usunięto użytkownika: {selectedUser.Email}");
            }
        });
    }
}
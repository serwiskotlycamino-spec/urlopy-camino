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
    private System.Windows.Threading.DispatcherTimer? _refreshTimer;
    public MainWindow()
        : this(new ApiClient(DefaultApiUrl), null)
    {
    }

    public MainWindow(ApiClient apiClient, LoginResponse? session)
    {
        InitializeComponent();
        _apiClient = apiClient;
        var settings = AppSettings.Load();
        WindowPersistence.Attach(this, settings, "Admin", RequestsGrid, UsersGrid);
        ApiUrlTextBox.Text = _apiClient.BaseUrl;
        EmailTextBox.Text = "serwis@kotlycamino.pl";
        PasswordBox.Password = "Camino2023?";

        NewUserRoleCombo.ItemsSource = new[] { "ADMIN", "EMPLOYEE" };
        NewUserRoleCombo.SelectedIndex = 1;
        UpdateRoleCombo.ItemsSource = new[] { "ADMIN", "EMPLOYEE" };
        UpdateRoleCombo.SelectedIndex = 1;
        CommunicationModeCombo.ItemsSource = new[] { "MULTI", "TYLKO EMAIL" };
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
                await RunBusyAsync(LoadAllTabsAsync);
                StartAutoRefresh();
            };
        }
    }

    private void StartAutoRefresh()
    {
        _refreshTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(30)
        };
        _refreshTimer.Tick += async (s, e) => await RefreshAllTabsAsync();
        _refreshTimer.Start();
    }

    private async Task RefreshAllTabsAsync()
    {
        await RunBusyAsync(LoadAllTabsAsync, showErrors: false);
    }
    private void SetStatus(string message)
    {
        StatusTextBlock.Text = message;
    }

    private bool IsAdmin()
    {
        return _session?.User.Role is "ADMIN";
    }

    private async Task RunBusyAsync(Func<Task> work, bool showErrors = true)
    {
        try
        {
            IsEnabled = false;
            await work();
        }
        catch (UnauthorizedAccessException)
        {
            if (_refreshTimer != null) _refreshTimer.Stop();
            await _apiClient.LogoutAsync(); // Wylogowanie z API
            _session = null;
            CurrentUserTextBlock.Text = string.Empty;
            LoginPanel.Visibility = Visibility.Visible;
            ApplyApiButton.IsEnabled = true;
            MainTabs.IsEnabled = false;
            SetStatus("Sesja wygasła. Zaloguj się ponownie.");
            if (showErrors) MessageBox.Show("Sesja wygasła. Zaloguj się ponownie.", "Błąd autentykacji", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        catch (Exception ex)
        {
            SetStatus($"Błąd: {ex.Message}");
            if (showErrors) MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }
    private async Task LoadAllTabsAsync()
    {
        var requests = await _apiClient.GetAllLeaveRequestsAsync();
        var users = await _apiClient.GetUsersAsync();
        var userMap = users.ToDictionary(u => u.Id, u => u.Name);

        foreach (var req in requests)
        {
            if (string.IsNullOrEmpty(req.UserName) && userMap.TryGetValue(req.UserId, out var userName))
            {
                req.UserName = userName;
            }
        }

        RequestsGrid.ItemsSource = requests;

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

        var workTrips = await _apiClient.GetAllWorkTripsAsync();
        WorkTripsGrid.ItemsSource = workTrips;

        WorkTripUserComboBox.ItemsSource = users;
        if (users.Count > 0)
        {
            WorkTripUserComboBox.SelectedIndex = 0;
        }

        WorkTripDatePicker.SelectedDate = DateTime.Today;

        SetStatus("Dane załadowane.");
    }
    private WorkTrip? GetSelectedWorkTrip() => WorkTripsGrid.SelectedItem as WorkTrip;
    private async void ApproveWorkTripButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selected = GetSelectedWorkTrip();
            if (selected is null)
            {
                MessageBox.Show("Wybierz wyjazd z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            var request = new ReviewWorkTripRequest
            {
                Decision = "APPROVED",
                Comment = WorkTripCommentTextBox.Text.Trim()
            };
            await _apiClient.ReviewWorkTripAsync(selected.Id, request);
            await RefreshAllTabsAsync();
            SetStatus($"Wyjazd #{selected.Id} został zaakceptowany.");
        });
    }

    private async void RejectWorkTripButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selected = GetSelectedWorkTrip();
            if (selected is null)
            {
                MessageBox.Show("Wybierz wyjazd z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            var request = new ReviewWorkTripRequest
            {
                Decision = "REJECTED",
                Comment = WorkTripCommentTextBox.Text.Trim()
            };
            await _apiClient.ReviewWorkTripAsync(selected.Id, request);
            await RefreshAllTabsAsync();
            SetStatus($"Wyjazd #{selected.Id} został odrzucony.");
        });
    }
    private LeaveRequest? GetSelectedLeaveRequest()
    {
        return RequestsGrid.SelectedItem as LeaveRequest;
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
        var updated = await _apiClient.DecideAsync(request.Id, decision, string.IsNullOrWhiteSpace(comment) ? null : comment);
        
        request.Status = updated.Status;
        request.ManagerComment = updated.ManagerComment;
        if (string.IsNullOrEmpty(request.UserName) && !string.IsNullOrEmpty(updated.UserName))
        {
            request.UserName = updated.UserName;
        }
        
        RequestsGrid.Items.Refresh();
        SetStatus($"Wniosek #{request.Id} -> {(decision == "APPROVED" ? "Zaakceptowany" : "Odrzucony")}");
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
                throw new InvalidOperationException("Email i hasło są wymagane.");
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
            await LoadAllTabsAsync();
        });
    }
    private async void RefreshPendingButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            RequestsGrid.ItemsSource = await _apiClient.GetAllLeaveRequestsAsync();
            SetStatus("Odświeżono listę wniosków.");
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
     private async void SaveCommentButton_Click(object sender, RoutedEventArgs e)
    {
        var request = GetSelectedLeaveRequest();
        if (request is null)
        {
            MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        await RunBusyAsync(async () =>
        {
            var comment = DecisionCommentTextBox.Text.Trim();
            await _apiClient.DecideAsync(request.Id, request.Status, string.IsNullOrWhiteSpace(comment) ? null : comment);
            await LoadAllTabsAsync();
            SetStatus($"Zaktualizowano komentarz dla wniosku #{request.Id}");
        });
    }

    private async void DeleteLeaveButton_Click(object sender, RoutedEventArgs e)
    {
        var selected = GetSelectedLeaveRequest();
        if (selected is null)
        {
            MessageBox.Show("Wybierz wniosek do usunięcia.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (MessageBox.Show($"Czy na pewno chcesz usunąć wniosek #{selected.Id}?", "Potwierdzenie", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
        {
            return;
        }

        await RunBusyAsync(async () =>
        {
            await _apiClient.DeleteLeaveRequestForAdminAsync(selected.Id);
            await LoadAllTabsAsync();
            SetStatus($"Wniosek #{selected.Id} został usunięty.");
        });
    }
    private async void RefreshUsersButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            SetStatus("Odświeżono listę użytkowników.");
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
                throw new InvalidOperationException("Imię, email i hasło są wymagane.");
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
            SetStatus($"Dodano użytkownika: {email}");
        });
    }

    private async void UpdateRoleButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var selected = GetSelectedUser();
            if (selected is null)
            {
                throw new InvalidOperationException("Wybierz użytkownika do zmiany roli.");
            }

            var role = (UpdateRoleCombo.SelectedItem as string) ?? "EMPLOYEE";

            await _apiClient.UpdateUserRoleAsync(selected.Id, new UpdateRoleRequest
            {
                Role = role,
            });

            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
            SetStatus($"Zmieniono rolę użytkownika #{selected.Id}.");
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
            SetStatus("Odświeżono ustawienia mail.");
        });
    }

    private async void SaveMailButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            if (!int.TryParse(SmtpPortTextBox.Text.Trim(), out var smtpPort))
            {
                throw new InvalidOperationException("Port SMTP musi być liczbą.");
            }

            if (!int.TryParse(ImapPortTextBox.Text.Trim(), out var imapPort))
            {
                throw new InvalidOperationException("Port IMAP musi być liczbą.");
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
        }
    }

    private async void UsersGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (GetSelectedUser() is { } selectedUser)
        {
            var editWindow = new EditUserWindow(_apiClient, selectedUser);
            if (editWindow.ShowDialog() == true)
            {
                await RunBusyAsync(async () =>
                {
                    UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
                    SetStatus($"Zaktualizowano dane użytkownika #{selectedUser.Id}.");
                });
            }
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

            // Logika przeniesiona do EditUserWindow
            
            if (request.Name == null && request.Email == null && request.Password == null)
            {
                SetStatus("Brak zmian do zapisania.");
                return;
            }

            await _apiClient.UpdateUserSettingsAsync(selectedUser.Id, request);
            UsersGrid.ItemsSource = await _apiClient.GetUsersAsync();
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
    private void RefreshWorkTripsButton_Click(object sender, RoutedEventArgs e) { }
    private void AddWorkTripButton_Click(object sender, RoutedEventArgs e) { }
    private void UpdateWorkTripButton_Click(object sender, RoutedEventArgs e) { }
    private void DeleteWorkTripButton_Click(object sender, RoutedEventArgs e) { }
}
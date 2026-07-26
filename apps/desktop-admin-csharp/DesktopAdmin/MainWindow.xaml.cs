using DesktopAdmin.Models;
using DesktopAdmin.Services;
using Microsoft.Win32;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace DesktopAdmin;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private const string DefaultApiUrl = "https://urlopy-api-622924376884.europe-central2.run.app";
    private static readonly RoleOption[] RoleOptions =
    [
        new("ADMIN", "Administrator"),
        new("EMPLOYEE", "Pracownik"),
    ];

    private readonly List<LeaveRequest> _leaveRequests = [];
    private readonly List<LeaveRequest> _archivedLeaveRequests = [];
    private readonly List<UserSummary> _users = [];
    private readonly List<EmployeeLeaveSummary> _leaveLimits = [];
    private readonly List<WorkTrip> _workTrips = [];
    private LeaveArchiveStore _archiveStore;
    private bool _historyEditMode;
    private HistoryEditSnapshot? _historyEditSnapshot;
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
        _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
        _leaveRequests.AddRange(_archiveStore.LoadActiveRequests());
        _archivedLeaveRequests.AddRange(_archiveStore.Load());
        var settings = AppSettings.Load();
        WindowPersistence.Attach(this, settings, "Admin", RequestsGrid, UsersGrid);
        EmailTextBox.Text = "serwis@kotlycamino.pl";
        PasswordBox.Password = "Camino2023?";

        NewUserRoleCombo.ItemsSource = RoleOptions;
        NewUserRoleCombo.DisplayMemberPath = nameof(RoleOption.Label);
        NewUserRoleCombo.SelectedValuePath = nameof(RoleOption.Value);
        NewUserRoleCombo.SelectedValue = "EMPLOYEE";

        UpdateRoleCombo.ItemsSource = RoleOptions;
        UpdateRoleCombo.DisplayMemberPath = nameof(RoleOption.Label);
        UpdateRoleCombo.SelectedValuePath = nameof(RoleOption.Value);
        UpdateRoleCombo.SelectedValue = "EMPLOYEE";

        if (session is not null)
        {
            _session = session;
            CurrentUserTextBlock.Text = $"Zalogowano: {session.User.Name} ({TranslateRole(session.User.Role)})";
            LoginPanel.Visibility = Visibility.Collapsed;
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

    private void SortLeaveRequestsNewestFirst()
    {
        _leaveRequests.Sort((left, right) => right.CreatedAtValue.CompareTo(left.CreatedAtValue));
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
        if (requests.Count == 0)
        {
            var cached = _archiveStore.LoadActiveRequests();
            if (cached.Count > 0)
            {
                requests = cached;
            }
        }

        var users = await _apiClient.GetUsersAsync();
        var leaveLimits = await _apiClient.GetLeaveLimitsAsync();
        var userMap = users.ToDictionary(u => u.Id, u => u.Name);

        MergeLeaveRequests(requests, userMap, _apiClient.LastLeaveRequestsSnapshotIsComplete);
    SortLeaveRequestsNewestFirst();

        _users.Clear();
        _users.AddRange(users);

        _leaveLimits.Clear();
        _leaveLimits.AddRange(leaveLimits);

        RequestsGrid.ItemsSource = _leaveRequests;
        ArchiveGrid.ItemsSource = _archivedLeaveRequests;
        UsersGrid.ItemsSource = _users;
        HistoryUsersList.ItemsSource = _users;

        RefreshHistoryPanel();

        var workTrips = await _apiClient.GetAllWorkTripsAsync();
        _workTrips.Clear();
        _workTrips.AddRange(workTrips);
        WorkTripsGrid.ItemsSource = _workTrips;

        WorkTripUserComboBox.ItemsSource = users;
        if (users.Count > 0)
        {
            WorkTripUserComboBox.SelectedIndex = 0;
        }

        WorkTripDatePicker.SelectedDate = DateTime.Today;

        SetStatus("Dane załadowane.");
    }

    private void MergeLeaveRequests(IEnumerable<LeaveRequest> incomingRequests, Dictionary<int, string> userMap, bool isCompleteSnapshot)
    {
        var incomingList = incomingRequests.ToList();
        var archivedIds = _archivedLeaveRequests.Select(x => x.Id).ToHashSet();
        var visibleIds = new HashSet<int>();

        foreach (var incoming in incomingList)
        {
            if (archivedIds.Contains(incoming.Id))
            {
                _archiveStore.RemoveActiveRequest(incoming.Id);
                continue;
            }

            visibleIds.Add(incoming.Id);

            if (string.IsNullOrEmpty(incoming.UserName) && userMap.TryGetValue(incoming.UserId, out var userName))
            {
                incoming.UserName = userName;
            }

            var existing = _leaveRequests.FirstOrDefault(r => r.Id == incoming.Id);
            if (existing is null)
            {
                _leaveRequests.Add(incoming);
                _archiveStore.AddOrUpdateActiveRequest(incoming);
                continue;
            }

            existing.Status = incoming.Status;
            existing.ManagerComment = incoming.ManagerComment;
            existing.LeaveType = incoming.LeaveType;
            existing.StartDate = incoming.StartDate;
            existing.EndDate = incoming.EndDate;
            existing.Reason = incoming.Reason;
            existing.ManagerId = incoming.ManagerId;
            existing.UserId = incoming.UserId;
            existing.CreatedAt = incoming.CreatedAt;
            if (string.IsNullOrWhiteSpace(existing.UserName))
            {
                existing.UserName = incoming.UserName;
            }

            _archiveStore.AddOrUpdateActiveRequest(existing);
        }

        var canPruneByMissingIds = isCompleteSnapshot && incomingList.Count > 0;
        if (canPruneByMissingIds)
        {
            var toRemove = _leaveRequests
                .Where(x => !visibleIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToList();

            if (toRemove.Count > 0)
            {
                _leaveRequests.RemoveAll(x => toRemove.Contains(x.Id));
                foreach (var requestId in toRemove)
                {
                    _archiveStore.RemoveActiveRequest(requestId);
                }
            }
        }

        RequestsGrid.Items.Refresh();
    }

    private WorkTrip? GetSelectedWorkTrip() => WorkTripsGrid.SelectedItem as WorkTrip;
    private async void ReviewWorkTripButton_Click(object sender, RoutedEventArgs e)
    {
        var selected = GetSelectedWorkTrip();
        if (selected is null)
        {
            MessageBox.Show("Wybierz wyjazd z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var decisionWindow = new WorkTripDecisionWindow(selected.ManagerComment)
        {
            Owner = this,
        };

        if (decisionWindow.ShowDialog() != true || string.IsNullOrWhiteSpace(decisionWindow.Decision))
        {
            return;
        }

        await RunBusyAsync(async () =>
        {
            await _apiClient.ReviewWorkTripAsync(selected.Id, new ReviewWorkTripRequest
            {
                Decision = decisionWindow.Decision,
                Comment = decisionWindow.Comment,
            });

            await RefreshAllTabsAsync();
            SetStatus($"Wyjazd #{selected.Id} -> {(decisionWindow.Decision == "APPROVED" ? "zaakceptowany" : "odrzucony")}");
        });
    }

    private async void WorkTripsGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        var selected = GetSelectedWorkTrip();
        if (selected is null)
        {
            return;
        }

        var editWindow = new WorkTripEditWindow(selected)
        {
            Owner = this,
        };

        if (editWindow.ShowDialog() != true || editWindow.Result is null)
        {
            return;
        }

        await RunBusyAsync(async () =>
        {
            await _apiClient.UpdateWorkTripAsync(selected.Id, editWindow.Result);
            await RefreshAllTabsAsync();
            SetStatus($"Zaktualizowano wyjazd #{selected.Id}.");
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

        if (request.Status is "APPROVED" or "REJECTED")
        {
            _archiveStore.AddUserActivity(request.UserId, "Decyzja dla zgłoszenia", $"Wniosek #{request.Id}: {request.StatusPl}");
        }

        _archiveStore.AddOrUpdateActiveRequest(request);
        SortLeaveRequestsNewestFirst();
        
        RequestsGrid.Items.Refresh();
        SetStatus($"Wniosek #{request.Id} -> {(decision == "APPROVED" ? "Zaakceptowany" : "Odrzucony")}");
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

            CurrentUserTextBlock.Text = $"Zalogowano: {session.User.Name} ({TranslateRole(session.User.Role)})";

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
            var requests = await _apiClient.GetAllLeaveRequestsAsync();
            var users = await _apiClient.GetUsersAsync();
            var userMap = users.ToDictionary(u => u.Id, u => u.Name);
            MergeLeaveRequests(requests, userMap, _apiClient.LastLeaveRequestsSnapshotIsComplete);
            SortLeaveRequestsNewestFirst();
            RequestsGrid.ItemsSource = _leaveRequests;
            SetStatus("Odświeżono listę wniosków.");
        });
    }

    private async void AddLeaveButton_Click(object sender, RoutedEventArgs e)
    {
        var users = await _apiClient.GetUsersAsync();
        var window = new AddLeaveRequestWindow(_apiClient, users);
        var result = window.ShowDialog();
        if (result == true)
        {
            var requests = await _apiClient.GetAllLeaveRequestsAsync();
            var userMap = users.ToDictionary(u => u.Id, u => u.Name);
            MergeLeaveRequests(requests, userMap, _apiClient.LastLeaveRequestsSnapshotIsComplete);
            SortLeaveRequestsNewestFirst();
            RequestsGrid.ItemsSource = _leaveRequests;
            SetStatus("Dodano nowy wniosek.");
        }
    }
    private async void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("APPROVED"));
    }

    private async void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("REJECTED"));
    }

    private async void ArchiveLeaveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() =>
        {
            var request = GetSelectedLeaveRequest();
            if (request is null)
            {
                MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return Task.CompletedTask;
            }

            if (!string.IsNullOrWhiteSpace(request.UserName))
            {
                _archiveStore.AddOrUpdate(request);
                _archiveStore.RemoveActiveRequest(request.Id);
                _archiveStore.AddUserActivity(request.UserId, "Ręczne archiwizowanie", $"Wniosek #{request.Id} przeniesiono do archiwum.");
            }

            _leaveRequests.RemoveAll(x => x.Id == request.Id);
            RequestsGrid.ItemsSource = _leaveRequests;
            RequestsGrid.Items.Refresh();

            _archivedLeaveRequests.Clear();
            _archivedLeaveRequests.AddRange(_archiveStore.Load());
            ArchiveGrid.ItemsSource = _archivedLeaveRequests;
            ArchiveGrid.Items.Refresh();
            SetStatus($"Wniosek #{request.Id} zapisano w archiwum.");
            return Task.CompletedTask;
        });
    }

    private async void RestoreFromArchiveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() =>
        {
            var request = ArchiveGrid.SelectedItem as LeaveRequest;
            if (request is null)
            {
                MessageBox.Show("Wybierz wniosek z archiwum.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return Task.CompletedTask;
            }

            _archiveStore.Remove(request.Id);
            _archivedLeaveRequests.RemoveAll(x => x.Id == request.Id);
            ArchiveGrid.Items.Refresh();
            _archiveStore.AddUserActivity(request.UserId, "Przywrócenie z archiwum", $"Wniosek #{request.Id} przywrócono na listę.");
            if (_leaveRequests.All(x => x.Id != request.Id))
            {
                _leaveRequests.Add(request);
            }
            SortLeaveRequestsNewestFirst();
            _archiveStore.AddOrUpdateActiveRequest(request);
            RequestsGrid.ItemsSource = _leaveRequests;
            RequestsGrid.Items.Refresh();
            SetStatus($"Przywrócono wniosek #{request.Id} do listy.");
            return Task.CompletedTask;
        });
    }

    private async void DeleteFromArchiveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() =>
        {
            var request = ArchiveGrid.SelectedItem as LeaveRequest;
            if (request is null)
            {
                MessageBox.Show("Wybierz wniosek z archiwum.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
                return Task.CompletedTask;
            }

            _archiveStore.Remove(request.Id);
            _archivedLeaveRequests.RemoveAll(x => x.Id == request.Id);
            ArchiveGrid.Items.Refresh();
            _archiveStore.AddToTrash(request, "ARCHIVE");
            _archiveStore.AddUserActivity(request.UserId, "Usunięcie z archiwum", $"Wniosek #{request.Id} usunięto z archiwum.");
            SetStatus($"Usunięto wniosek #{request.Id} z archiwum.");
            return Task.CompletedTask;
        });
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
            _archiveStore.AddUserActivity(request.UserId, "Aktualizacja komentarza", $"Wniosek #{request.Id} - zmieniono komentarz managera.");
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
            _archiveStore.AddToTrash(selected, "ACTIVE");
            _archiveStore.RemoveActiveRequest(selected.Id);
            _leaveRequests.RemoveAll(x => x.Id == selected.Id);
            SortLeaveRequestsNewestFirst();
            RequestsGrid.Items.Refresh();
            _archiveStore.AddUserActivity(selected.UserId, "Usunięcie zgłoszenia", $"Usunięto wniosek #{selected.Id}.");
            await LoadAllTabsAsync();
            SetStatus($"Wniosek #{selected.Id} został usunięty.");
        });
    }
    private async void RefreshUsersButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            var users = await _apiClient.GetUsersAsync();
            _users.Clear();
            _users.AddRange(users);
            UsersGrid.ItemsSource = _users;
            HistoryUsersList.ItemsSource = _users;
            RefreshHistoryPanel();
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
            var role = (NewUserRoleCombo.SelectedValue as string) ?? "EMPLOYEE";

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                throw new InvalidOperationException("Imię, email i hasło są wymagane.");
            }

            var created = await _apiClient.CreateUserAsync(new CreateUserRequest
            {
                Name = name,
                Email = email,
                Password = password,
                Role = role,
            });

            _archiveStore.AddUserActivity(created.Id, "Utworzenie użytkownika", $"Dodano konto {created.Email}");

            var users = await _apiClient.GetUsersAsync();
            _users.Clear();
            _users.AddRange(users);
            UsersGrid.ItemsSource = _users;
            HistoryUsersList.ItemsSource = _users;
            RefreshHistoryPanel();
            NewUserNameTextBox.Clear();
            NewUserEmailTextBox.Clear();
            NewUserPasswordTextBox.Clear();
            NewUserRoleCombo.SelectedValue = "EMPLOYEE";
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

            var role = (UpdateRoleCombo.SelectedValue as string) ?? "EMPLOYEE";

            await _apiClient.UpdateUserRoleAsync(selected.Id, new UpdateRoleRequest
            {
                Role = role,
            });

            _archiveStore.AddUserActivity(selected.Id, "Zmiana roli", $"Nowa rola: {TranslateRole(role)}");

            var users = await _apiClient.GetUsersAsync();
            _users.Clear();
            _users.AddRange(users);
            UsersGrid.ItemsSource = _users;
            HistoryUsersList.ItemsSource = _users;
            RefreshHistoryPanel();
            SetStatus($"Zmieniono rolę użytkownika #{selected.Id}.");
        });
    }

    private void OptionsButton_Click(object sender, RoutedEventArgs e)
    {
        var optionsWindow = new OptionsWindow(_apiClient)
        {
            Owner = this,
        };

        optionsWindow.ShowDialog();

        if (optionsWindow.StoragePathChanged)
        {
            _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
            _leaveRequests.Clear();
            _leaveRequests.AddRange(_archiveStore.LoadActiveRequests());
            SortLeaveRequestsNewestFirst();
            _archivedLeaveRequests.Clear();
            _archivedLeaveRequests.AddRange(_archiveStore.Load());
            RequestsGrid.ItemsSource = _leaveRequests;
            ArchiveGrid.ItemsSource = _archivedLeaveRequests;
            RequestsGrid.Items.Refresh();
            ArchiveGrid.Items.Refresh();
            SetStatus($"Zmieniono katalog danych: {AppDataPaths.StorageDirectory}");
        }

        if (!optionsWindow.ApiSettingsChanged)
        {
            return;
        }

        var settings = AppSettings.Load();
        _apiClient = new ApiClient(settings.ApiUrl);
        _session = null;
        CurrentUserTextBlock.Text = string.Empty;
        LoginPanel.Visibility = Visibility.Visible;
        MainTabs.IsEnabled = false;
        _refreshTimer?.Stop();
        SetStatus($"Zmieniono API na: {settings.ApiUrl}");
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
            UpdateRoleCombo.SelectedValue = selected.Role;
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
                    if (editWindow.UpdatedUserId != editWindow.OriginalUserId)
                    {
                        _archiveStore.RemapUserId(editWindow.OriginalUserId, editWindow.UpdatedUserId);
                    }

                    _archiveStore.AddUserActivity(editWindow.UpdatedUserId, "Edycja danych konta", "Zmieniono dane użytkownika w edytorze.");

                    var users = await _apiClient.GetUsersAsync();
                    _users.Clear();
                    _users.AddRange(users);
                    UsersGrid.ItemsSource = _users;
                    HistoryUsersList.ItemsSource = _users;
                    RefreshHistoryPanel();
                    SetStatus($"Zaktualizowano dane użytkownika #{editWindow.UpdatedUserId}.");
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
    private async void CalendarButton_Click(object sender, RoutedEventArgs e)
    {
        if (!IsAdmin())
        {
            MessageBox.Show("Ta funkcja jest dostępna tylko dla administratora.", "Brak uprawnień", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        await RunBusyAsync(LoadAllTabsAsync);

        var calendarWindow = new LeaveCalendarWindow(_apiClient, _leaveRequests)
        {
            Owner = this
        };

        if (calendarWindow.ShowDialog() == true || calendarWindow.HasChanges)
        {
            await RunBusyAsync(LoadAllTabsAsync);
        }
    }
    private void MontageButton_Click(object sender, RoutedEventArgs e)
    {
        MessageBox.Show("Moduł Montaże będzie dodany w kolejnym kroku.", "Informacja", MessageBoxButton.OK, MessageBoxImage.Information);
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
                _archiveStore.AddUserActivity(selectedUser.Id, "Usunięcie użytkownika", $"Usunięto konto {selectedUser.Email}");
                await _apiClient.DeleteUserAsync(selectedUser.Id);

                var users = await _apiClient.GetUsersAsync();
                _users.Clear();
                _users.AddRange(users);
                UsersGrid.ItemsSource = _users;
                HistoryUsersList.ItemsSource = _users;
                RefreshHistoryPanel();
                SetStatus($"Usunięto użytkownika: {selectedUser.Email}");
            }
        });
    }
    private void RefreshWorkTripsButton_Click(object sender, RoutedEventArgs e) { }
    private void AddWorkTripButton_Click(object sender, RoutedEventArgs e) { }
    private void UpdateWorkTripButton_Click(object sender, RoutedEventArgs e) { }
    private void DeleteWorkTripButton_Click(object sender, RoutedEventArgs e) { }

    private void HistoryUsersList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        ExitHistoryEditMode();
        RefreshHistoryPanel();
    }

    private async void SaveAnnualLimitButton_Click(object sender, RoutedEventArgs e)
    {
        if (HistoryUsersList.SelectedItem is not UserSummary selected)
        {
            MessageBox.Show("Wybierz użytkownika z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!int.TryParse(AnnualLimitTextBox.Text.Trim(), out var annualDays) || annualDays < 0)
        {
            MessageBox.Show("Podaj poprawną liczbę dni limitu urlopu.", "Nieprawidłowa wartość", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        await RunBusyAsync(async () =>
        {
            var oldAnnualDays = _leaveLimits.FirstOrDefault(x => x.UserId == selected.Id)?.AnnualDays ?? 26;

            await _apiClient.SetLeaveLimitAsync(selected.Id, new SetLeaveLimitRequest
            {
                AnnualDays = annualDays,
                Year = DateTime.Today.Year,
            });

            _archiveStore.AddUserActivity(selected.Id, "Ręczna edycja limitu", $"Roczny limit urlopu: {oldAnnualDays} -> {annualDays}");

            var leaveLimits = await _apiClient.GetLeaveLimitsAsync();
            _leaveLimits.Clear();
            _leaveLimits.AddRange(leaveLimits);
            RefreshHistoryPanel();
            SetStatus($"Zapisano limit urlopu użytkownika #{selected.Id}.");
        });
    }

    private async void EditHistoryUserButton_Click(object sender, RoutedEventArgs e)
    {
        if (HistoryUsersList.SelectedItem is not UserSummary selected)
        {
            MessageBox.Show("Wybierz użytkownika z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        if (!_historyEditMode)
        {
            _historyEditMode = true;
            SetHistoryFieldsReadOnly(false);
            _historyEditSnapshot = CaptureHistoryEditSnapshot();
            EditHistoryUserButton.Content = "Zapisz zmiany";
            SetStatus($"Tryb edycji danych użytkownika #{selected.Id}.");
            return;
        }

        await RunBusyAsync(async () =>
        {
            var previous = _historyEditSnapshot ?? CaptureHistoryEditSnapshot();
            var newName = HistoryNameTextBox.Text.Trim();
            var newEmail = HistoryEmailTextBox.Text.Trim();
            var newPhone = HistoryPhoneTextBox.Text.Trim();
            var newAddress = HistoryAddressTextBox.Text.Trim();
            var newNotes = HistoryNotesTextBox.Text.Trim();

            var totalRequests = ParseStatsField(StatsTotalRequestsText.Text, "Ilość zgłoszeń");
            var pendingRequests = ParseStatsField(StatsPendingRequestsText.Text, "Aktualnie przetwarzane");
            var approvedRequests = ParseStatsField(StatsApprovedRequestsText.Text, "Zgłoszenia zatwierdzone");
            var rejectedRequests = ParseStatsField(StatsRejectedRequestsText.Text, "Zgłoszenia odrzucone");
            var cancelledRequests = ParseStatsField(StatsCancelledRequestsText.Text, "Zgłoszenia anulowane");
            var annualUsed = ParseStatsField(StatsAnnualUsedText.Text, "Wykorzystany urlop roczny");
            var onDemandUsed = ParseStatsField(StatsOnDemandUsedText.Text, "Wykorzystane na żądanie");
            var remainingLeave = ParseStatsField(StatsRemainingLeaveText.Text, "Pozostały urlop");
            var sickUsed = ParseStatsField(StatsSickUsedText.Text, "Wykorzystane chorobowe");
            var tripsTotal = ParseStatsField(StatsTripsTotalText.Text, "Wyjazdy służbowe (łącznie)");
            var tripsPending = ParseStatsField(StatsTripsPendingText.Text, "Wyjazdy służbowe (przetwarzane)");

            if (string.IsNullOrWhiteSpace(newName) || string.IsNullOrWhiteSpace(newEmail))
            {
                throw new InvalidOperationException("Imię i email nie mogą być puste.");
            }

            var updateRequest = new UpdateUserSettingsRequest();
            if (!string.Equals(selected.Name, newName, StringComparison.Ordinal))
            {
                updateRequest.Name = newName;
            }
            if (!string.Equals(selected.Email, newEmail, StringComparison.OrdinalIgnoreCase))
            {
                updateRequest.Email = newEmail;
            }

            if (updateRequest.Name is not null || updateRequest.Email is not null)
            {
                await _apiClient.UpdateUserSettingsAsync(selected.Id, updateRequest);
            }

            var profile = new UserLocalProfile
            {
                UserId = selected.Id,
                Address = newAddress,
                Phone = newPhone,
                Notes = newNotes,
            };

            _archiveStore.SaveUserProfile(profile);

            var statsOverride = new UserStatsOverride
            {
                UserId = selected.Id,
                TotalRequests = totalRequests,
                PendingRequests = pendingRequests,
                ApprovedRequests = approvedRequests,
                RejectedRequests = rejectedRequests,
                CancelledRequests = cancelledRequests,
                AnnualUsed = annualUsed,
                OnDemandUsed = onDemandUsed,
                RemainingLeave = remainingLeave,
                SickUsed = sickUsed,
                TripsTotal = tripsTotal,
                TripsPending = tripsPending,
            };
            _archiveStore.SaveUserStatsOverride(statsOverride);

            var details = new List<string>();
            AddChange(details, "Imię", previous.Name, newName);
            AddChange(details, "Email", previous.Email, newEmail);
            AddChange(details, "Telefon", previous.Phone, newPhone);
            AddChange(details, "Adres", previous.Address, newAddress);
            AddChange(details, "Dodatkowe dane", previous.Notes, newNotes);
            AddChange(details, "Ilość zgłoszeń", previous.TotalRequests, totalRequests);
            AddChange(details, "Aktualnie przetwarzane", previous.PendingRequests, pendingRequests);
            AddChange(details, "Zgłoszenia zatwierdzone", previous.ApprovedRequests, approvedRequests);
            AddChange(details, "Zgłoszenia odrzucone", previous.RejectedRequests, rejectedRequests);
            AddChange(details, "Zgłoszenia anulowane", previous.CancelledRequests, cancelledRequests);
            AddChange(details, "Wykorzystany urlop roczny", previous.AnnualUsed, annualUsed);
            AddChange(details, "Wykorzystane na żądanie", previous.OnDemandUsed, onDemandUsed);
            AddChange(details, "Pozostały urlop", previous.RemainingLeave, remainingLeave);
            AddChange(details, "Wykorzystane chorobowe", previous.SickUsed, sickUsed);
            AddChange(details, "Wyjazdy służbowe (łącznie)", previous.TripsTotal, tripsTotal);
            AddChange(details, "Wyjazdy służbowe (przetwarzane)", previous.TripsPending, tripsPending);

            var detailsText = details.Count == 0 ? "Brak zmian wartości." : string.Join("; ", details);
            _archiveStore.AddUserActivity(selected.Id, "Ręczna edycja danych", detailsText);

            var users = await _apiClient.GetUsersAsync();
            _users.Clear();
            _users.AddRange(users);
            UsersGrid.ItemsSource = _users;
            HistoryUsersList.ItemsSource = _users;

            ExitHistoryEditMode();
            RefreshHistoryPanel();
            SetStatus($"Zapisano ręczne dane użytkownika #{selected.Id}.");
        });
    }

    private void UserHistoryButton_Click(object sender, RoutedEventArgs e)
    {
        if (HistoryUsersList.SelectedItem is not UserSummary selected)
        {
            MessageBox.Show("Wybierz użytkownika z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var history = _archiveStore.GetUserActivities(selected.Id);
        var window = new UserHistoryWindow(selected, history)
        {
            Owner = this,
        };
        window.ShowDialog();
    }

    private void ExportUserPdfButton_Click(object sender, RoutedEventArgs e)
    {
        if (HistoryUsersList.SelectedItem is not UserSummary selected)
        {
            MessageBox.Show("Wybierz użytkownika z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            var saveDialog = new SaveFileDialog
            {
                Title = "Zapisz raport użytkownika jako PDF",
                Filter = "Plik PDF (*.pdf)|*.pdf",
                FileName = $"raport-uzytkownika-{SanitizeFileName(selected.Name)}-{DateTime.Now:yyyyMMdd-HHmm}.pdf",
                AddExtension = true,
                DefaultExt = ".pdf",
            };

            if (saveDialog.ShowDialog(this) != true)
            {
                return;
            }

            var requests = GetUserRequests(selected.Id)
                .OrderByDescending(x => x.Id)
                .ToList();

            QuestPDF.Settings.License = LicenseType.Community;

            Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.Margin(20);

                    page.Header().Column(column =>
                    {
                        column.Item().Text("Raport danych użytkownika").Bold().FontSize(18);
                        column.Item().Text($"Użytkownik: {selected.Name} ({selected.Email})");
                        column.Item().Text($"Data eksportu: {DateTime.Now:dd.MM.yyyy HH:mm:ss}").FontSize(10);
                    });

                    page.Content().PaddingTop(10).Column(column =>
                    {
                        column.Spacing(8);

                        column.Item().Text($"Rola: {HistoryRoleTextBox.Text}");
                        column.Item().Text($"Telefon: {HistoryPhoneTextBox.Text}");
                        column.Item().Text($"Adres: {HistoryAddressTextBox.Text}");
                        column.Item().Text($"Dodatkowe dane: {HistoryNotesTextBox.Text}");
                        column.Item().Text($"Roczny limit urlopu: {AnnualLimitTextBox.Text}");

                        column.Item().PaddingTop(6).Text("Podliczenia").Bold();
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.RelativeColumn(2);
                                columns.RelativeColumn(1);
                            });

                            AddStatsRow(table, "Ilość zgłoszeń", StatsTotalRequestsText.Text);
                            AddStatsRow(table, "Aktualnie przetwarzane", StatsPendingRequestsText.Text);
                            AddStatsRow(table, "Zgłoszenia zatwierdzone", StatsApprovedRequestsText.Text);
                            AddStatsRow(table, "Zgłoszenia odrzucone", StatsRejectedRequestsText.Text);
                            AddStatsRow(table, "Zgłoszenia anulowane", StatsCancelledRequestsText.Text);
                            AddStatsRow(table, "Wykorzystany urlop roczny", StatsAnnualUsedText.Text);
                            AddStatsRow(table, "Wykorzystane na żądanie", StatsOnDemandUsedText.Text);
                            AddStatsRow(table, "Pozostały urlop", StatsRemainingLeaveText.Text);
                            AddStatsRow(table, "Wykorzystane chorobowe", StatsSickUsedText.Text);
                            AddStatsRow(table, "Wyjazdy służbowe (łącznie)", StatsTripsTotalText.Text);
                            AddStatsRow(table, "Wyjazdy służbowe (przetwarzane)", StatsTripsPendingText.Text);
                        });

                        column.Item().PaddingTop(6).Text("Wnioski użytkownika").Bold();
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns =>
                            {
                                columns.ConstantColumn(50);
                                columns.ConstantColumn(100);
                                columns.ConstantColumn(90);
                                columns.ConstantColumn(90);
                                columns.ConstantColumn(100);
                                columns.RelativeColumn();
                            });

                            table.Header(header =>
                            {
                                header.Cell().Element(PdfCellStyle).Text("ID").Bold();
                                header.Cell().Element(PdfCellStyle).Text("Typ").Bold();
                                header.Cell().Element(PdfCellStyle).Text("Od").Bold();
                                header.Cell().Element(PdfCellStyle).Text("Do").Bold();
                                header.Cell().Element(PdfCellStyle).Text("Status").Bold();
                                header.Cell().Element(PdfCellStyle).Text("Komentarz").Bold();
                            });

                            foreach (var item in requests)
                            {
                                table.Cell().Element(PdfCellStyle).Text(item.Id.ToString());
                                table.Cell().Element(PdfCellStyle).Text(item.LeaveTypePl);
                                table.Cell().Element(PdfCellStyle).Text(item.StartDateOnly);
                                table.Cell().Element(PdfCellStyle).Text(item.EndDateOnly);
                                table.Cell().Element(PdfCellStyle).Text(item.StatusPl);
                                table.Cell().Element(PdfCellStyle).Text(item.ManagerComment ?? string.Empty);
                            }
                        });
                    });

                    page.Footer().AlignRight().Text(x =>
                    {
                        x.CurrentPageNumber();
                        x.Span(" / ");
                        x.TotalPages();
                    });
                });
            }).GeneratePdf(saveDialog.FileName);

            SetStatus($"Wyeksportowano PDF danych użytkownika #{selected.Id}.");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Nie udało się wyeksportować PDF: {ex.Message}", "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void HistoryRecentGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (HistoryRecentGrid.SelectedItem is not LeaveRequest request)
        {
            return;
        }

        var editWindow = new EditLeaveRequestWindow(_apiClient, request)
        {
            Owner = this,
        };

        if (editWindow.ShowDialog() == true)
        {
            _archiveStore.AddUserActivity(request.UserId, "Edycja zgłoszenia", $"Ręcznie edytowano wniosek #{request.Id}.");
            await RunBusyAsync(LoadAllTabsAsync);
        }
    }

    private async void RequestsGrid_MouseDoubleClick(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        var request = GetSelectedLeaveRequest();
        if (request is null)
        {
            return;
        }

        var editWindow = new EditLeaveRequestWindow(_apiClient, request)
        {
            Owner = this,
        };

        if (editWindow.ShowDialog() == true)
        {
            _archiveStore.AddUserActivity(request.UserId, "Edycja zgłoszenia", $"Ręcznie edytowano wniosek #{request.Id}.");
            await RunBusyAsync(LoadAllTabsAsync);
        }
    }

    private void RefreshHistoryPanel()
    {
        if (HistoryUsersList.SelectedItem is not UserSummary selected)
        {
            if (_users.Count == 0)
            {
                HistoryUserHeaderText.Text = "Brak użytkowników do wyświetlenia.";
                HistoryNameTextBox.Text = string.Empty;
                HistoryEmailTextBox.Text = string.Empty;
                HistoryRoleTextBox.Text = string.Empty;
                HistoryPhoneTextBox.Text = string.Empty;
                HistoryAddressTextBox.Text = string.Empty;
                HistoryNotesTextBox.Text = string.Empty;
                StatsTotalRequestsText.Text = "0";
                StatsPendingRequestsText.Text = "0";
                StatsApprovedRequestsText.Text = "0";
                StatsRejectedRequestsText.Text = "0";
                StatsCancelledRequestsText.Text = "0";
                StatsAnnualUsedText.Text = "0 dni";
                StatsOnDemandUsedText.Text = "0 dni";
                StatsRemainingLeaveText.Text = "0 dni";
                StatsSickUsedText.Text = "0 dni";
                StatsTripsTotalText.Text = "0";
                StatsTripsPendingText.Text = "0";
                AnnualLimitTextBox.Text = "26";
                HistoryRecentGrid.ItemsSource = null;
                return;
            }

            HistoryUsersList.SelectedIndex = 0;
            return;
        }

        var profile = _archiveStore.GetUserProfile(selected.Id);
        HistoryUserHeaderText.Text = $"Dane użytkownika: {selected.Name}";
        HistoryNameTextBox.Text = selected.Name;
        HistoryEmailTextBox.Text = selected.Email;
        HistoryRoleTextBox.Text = TranslateRole(selected.Role);
        HistoryPhoneTextBox.Text = profile.Phone;
        HistoryAddressTextBox.Text = profile.Address;
        HistoryNotesTextBox.Text = profile.Notes;

        var requests = GetUserRequests(selected.Id);
        var pending = requests.Where(x => x.Status == "PENDING").ToList();
        var approved = requests.Where(x => x.Status == "APPROVED").ToList();
        var rejected = requests.Where(x => x.Status == "REJECTED").ToList();
        var cancelled = requests.Where(x => x.Status == "CANCELLED").ToList();

        var annualUsed = approved.Where(x => x.LeaveType == "ANNUAL").Sum(CalculateDaysInclusive);
        var onDemandUsed = approved.Where(x => x.LeaveType == "ON_DEMAND").Sum(CalculateDaysInclusive);
        var sickDays = approved.Where(x => x.LeaveType == "SICK").Sum(CalculateDaysInclusive);

        var leaveSummary = _leaveLimits.FirstOrDefault(x => x.UserId == selected.Id);
        var annualDays = leaveSummary?.AnnualDays ?? 26;
        var remaining = leaveSummary?.RemainingDays ?? Math.Max(0, annualDays - annualUsed - onDemandUsed);

        var userTrips = _workTrips.Where(x => x.UserId == selected.Id).ToList();
        var userTripsPending = userTrips.Count(x => x.Status == "PENDING");

        var statsOverride = _archiveStore.GetUserStatsOverride(selected.Id);
        var totalRequests = statsOverride.TotalRequests ?? requests.Count;
        var pendingCount = statsOverride.PendingRequests ?? pending.Count;
        var approvedCount = statsOverride.ApprovedRequests ?? approved.Count;
        var rejectedCount = statsOverride.RejectedRequests ?? rejected.Count;
        var cancelledCount = statsOverride.CancelledRequests ?? cancelled.Count;
        var annualUsedValue = statsOverride.AnnualUsed ?? annualUsed;
        var onDemandUsedValue = statsOverride.OnDemandUsed ?? onDemandUsed;
        var remainingValue = statsOverride.RemainingLeave ?? remaining;
        var sickValue = statsOverride.SickUsed ?? sickDays;
        var tripsTotalValue = statsOverride.TripsTotal ?? userTrips.Count;
        var tripsPendingValue = statsOverride.TripsPending ?? userTripsPending;

        AnnualLimitTextBox.Text = annualDays.ToString();

        StatsTotalRequestsText.Text = totalRequests.ToString();
        StatsPendingRequestsText.Text = pendingCount.ToString();
        StatsApprovedRequestsText.Text = approvedCount.ToString();
        StatsRejectedRequestsText.Text = rejectedCount.ToString();
        StatsCancelledRequestsText.Text = cancelledCount.ToString();
        StatsAnnualUsedText.Text = annualUsedValue.ToString();
        StatsOnDemandUsedText.Text = onDemandUsedValue.ToString();
        StatsRemainingLeaveText.Text = remainingValue.ToString();
        StatsSickUsedText.Text = sickValue.ToString();
        StatsTripsTotalText.Text = tripsTotalValue.ToString();
        StatsTripsPendingText.Text = tripsPendingValue.ToString();

        HistoryRecentGrid.ItemsSource = requests
            .OrderByDescending(x => x.Id)
            .Take(200)
            .ToList();

            SetHistoryFieldsReadOnly(!_historyEditMode);
    }

    private List<LeaveRequest> GetUserRequests(int userId)
    {
        var merged = new Dictionary<int, LeaveRequest>();

        foreach (var request in _leaveRequests.Where(x => x.UserId == userId))
        {
            merged[request.Id] = request;
        }

        foreach (var request in _archivedLeaveRequests.Where(x => x.UserId == userId))
        {
            merged[request.Id] = request;
        }

        return merged.Values.ToList();
    }

    private static int CalculateDaysInclusive(LeaveRequest request)
    {
        if (!DateTime.TryParse(request.StartDate, out var start) || !DateTime.TryParse(request.EndDate, out var end))
        {
            return 0;
        }

        var days = (end.Date - start.Date).Days + 1;
        return days < 0 ? 0 : days;
    }

    private static int ParseStatsField(string value, string fieldName)
    {
        var cleaned = value.Replace("dni", string.Empty, StringComparison.OrdinalIgnoreCase).Trim();
        if (!int.TryParse(cleaned, out var parsed) || parsed < 0)
        {
            throw new InvalidOperationException($"Pole '{fieldName}' musi być liczbą całkowitą >= 0.");
        }

        return parsed;
    }

    private static void AddStatsRow(QuestPDF.Fluent.TableDescriptor table, string label, string value)
    {
        table.Cell().Element(PdfCellStyle).Text(label);
        table.Cell().Element(PdfCellStyle).Text(value ?? string.Empty);
    }

    private static IContainer PdfCellStyle(IContainer container)
    {
        return container.BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingVertical(3).PaddingHorizontal(4);
    }

    private static string SanitizeFileName(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var safe = new string(value.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray());
        return safe.Replace(' ', '-');
    }

    private void SetHistoryFieldsReadOnly(bool readOnly)
    {
        HistoryNameTextBox.IsReadOnly = readOnly;
        HistoryEmailTextBox.IsReadOnly = readOnly;
        HistoryPhoneTextBox.IsReadOnly = readOnly;
        HistoryAddressTextBox.IsReadOnly = readOnly;
        HistoryNotesTextBox.IsReadOnly = readOnly;

        StatsTotalRequestsText.IsReadOnly = readOnly;
        StatsPendingRequestsText.IsReadOnly = readOnly;
        StatsApprovedRequestsText.IsReadOnly = readOnly;
        StatsRejectedRequestsText.IsReadOnly = readOnly;
        StatsCancelledRequestsText.IsReadOnly = readOnly;
        StatsAnnualUsedText.IsReadOnly = readOnly;
        StatsOnDemandUsedText.IsReadOnly = readOnly;
        StatsRemainingLeaveText.IsReadOnly = readOnly;
        StatsSickUsedText.IsReadOnly = readOnly;
        StatsTripsTotalText.IsReadOnly = readOnly;
        StatsTripsPendingText.IsReadOnly = readOnly;
    }

    private void ExitHistoryEditMode()
    {
        _historyEditMode = false;
        _historyEditSnapshot = null;
        EditHistoryUserButton.Content = "Edytuj";
        SetHistoryFieldsReadOnly(true);
    }

    private HistoryEditSnapshot CaptureHistoryEditSnapshot()
    {
        return new HistoryEditSnapshot
        {
            Name = HistoryNameTextBox.Text.Trim(),
            Email = HistoryEmailTextBox.Text.Trim(),
            Phone = HistoryPhoneTextBox.Text.Trim(),
            Address = HistoryAddressTextBox.Text.Trim(),
            Notes = HistoryNotesTextBox.Text.Trim(),
            TotalRequests = ParseStatsField(StatsTotalRequestsText.Text, "Ilość zgłoszeń"),
            PendingRequests = ParseStatsField(StatsPendingRequestsText.Text, "Aktualnie przetwarzane"),
            ApprovedRequests = ParseStatsField(StatsApprovedRequestsText.Text, "Zgłoszenia zatwierdzone"),
            RejectedRequests = ParseStatsField(StatsRejectedRequestsText.Text, "Zgłoszenia odrzucone"),
            CancelledRequests = ParseStatsField(StatsCancelledRequestsText.Text, "Zgłoszenia anulowane"),
            AnnualUsed = ParseStatsField(StatsAnnualUsedText.Text, "Wykorzystany urlop roczny"),
            OnDemandUsed = ParseStatsField(StatsOnDemandUsedText.Text, "Wykorzystane na żądanie"),
            RemainingLeave = ParseStatsField(StatsRemainingLeaveText.Text, "Pozostały urlop"),
            SickUsed = ParseStatsField(StatsSickUsedText.Text, "Wykorzystane chorobowe"),
            TripsTotal = ParseStatsField(StatsTripsTotalText.Text, "Wyjazdy służbowe (łącznie)"),
            TripsPending = ParseStatsField(StatsTripsPendingText.Text, "Wyjazdy służbowe (przetwarzane)"),
        };
    }

    private static void AddChange(List<string> changes, string label, string oldValue, string newValue)
    {
        var oldNormalized = oldValue.Trim();
        var newNormalized = newValue.Trim();
        if (!string.Equals(oldNormalized, newNormalized, StringComparison.Ordinal))
        {
            changes.Add($"{label}: {oldNormalized} -> {newNormalized}");
        }
    }

    private static void AddChange(List<string> changes, string label, int oldValue, int newValue)
    {
        if (oldValue != newValue)
        {
            changes.Add($"{label}: {oldValue} -> {newValue}");
        }
    }

    private static string TranslateRole(string role)
    {
        return role switch
        {
            "ADMIN" => "Administrator",
            "EMPLOYEE" => "Pracownik",
            _ => role,
        };
    }

    private sealed record RoleOption(string Value, string Label);

    private sealed class HistoryEditSnapshot
    {
        public string Name { get; init; } = string.Empty;
        public string Email { get; init; } = string.Empty;
        public string Phone { get; init; } = string.Empty;
        public string Address { get; init; } = string.Empty;
        public string Notes { get; init; } = string.Empty;
        public int TotalRequests { get; init; }
        public int PendingRequests { get; init; }
        public int ApprovedRequests { get; init; }
        public int RejectedRequests { get; init; }
        public int CancelledRequests { get; init; }
        public int AnnualUsed { get; init; }
        public int OnDemandUsed { get; init; }
        public int RemainingLeave { get; init; }
        public int SickUsed { get; init; }
        public int TripsTotal { get; init; }
        public int TripsPending { get; init; }
    }
}
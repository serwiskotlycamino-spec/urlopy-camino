using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;
using System.Windows.Controls;

namespace DesktopAdmin;

public partial class ManagerWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly LoginResponse _session;

    public ManagerWindow(ApiClient apiClient, LoginResponse session)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _session = session;

        var settings = AppSettings.Load();
        WindowPersistence.Attach(this, settings, "Manager", PendingGrid);

        HeaderTextBlock.Text = $"Panel szefa - {_session.User.Name}";
        ApiInfoTextBlock.Text = $"API: {_apiClient.BaseUrl}";

        Loaded += async (_, _) => await RunBusyAsync(LoadPendingAsync);
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
            StatusTextBlock.Text = ex.Message;
            MessageBox.Show(ex.Message, "Blad", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private async Task LoadPendingAsync()
    {
        PendingGrid.ItemsSource = await _apiClient.GetPendingAsync();
        StatusTextBlock.Text = "Zaladowano liste oczekujacych wnioskow.";
    }

    private LeaveRequest? GetSelectedLeaveRequest() => PendingGrid.SelectedItem as LeaveRequest;

    private async Task DecideAsync(string decision)
    {
        var selected = GetSelectedLeaveRequest();
        if (selected is null)
        {
            throw new InvalidOperationException("Wybierz wniosek z listy.");
        }

        var comment = DecisionCommentTextBox.Text.Trim();
        await _apiClient.DecideAsync(selected.Id, decision, string.IsNullOrWhiteSpace(comment) ? null : comment);
        await LoadPendingAsync();
        StatusTextBlock.Text = $"Wniosek #{selected.Id} oznaczono jako {decision}.";
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(LoadPendingAsync);
    }

    private async void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("APPROVED"));
    }

    private async void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(() => DecideAsync("REJECTED"));
    }

    private void PendingGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (GetSelectedLeaveRequest() is { } selected)
        {
            DecisionCommentTextBox.Text = selected.ManagerComment ?? string.Empty;
        }
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

            var loginWindow = new LoginWindow();
            loginWindow.Show();
            Close();
        });
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}

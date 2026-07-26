using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;

namespace DesktopAdmin;

public partial class DayRequestsActionWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly LeaveArchiveStore _archiveStore;
    private readonly DateTime _day;
    private readonly List<LeaveRequest> _requests;
    private bool _hasChanges;

    public DayRequestsActionWindow(ApiClient apiClient, DateTime day, IEnumerable<LeaveRequest> requests)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
        _day = day.Date;
        _requests = requests
            .OrderBy(x => x.Id)
            .ToList();

        HeaderTextBlock.Text = $"Wnioski z dnia {_day:yyyy-MM-dd}";
        RequestsGrid.ItemsSource = _requests;
    }

    private void RefreshDayListFromSharedStore()
    {
        var refreshed = _archiveStore.LoadActiveRequests()
            .Where(x => IsOnDay(x, _day) && x.Status is "PENDING" or "APPROVED")
            .OrderBy(x => x.Id)
            .ToList();

        _requests.Clear();
        _requests.AddRange(refreshed);
        RequestsGrid.Items.Refresh();
    }

    private static bool IsOnDay(LeaveRequest request, DateTime day)
    {
        if (!DateTime.TryParse(request.StartDate, out var start))
        {
            return false;
        }

        if (!DateTime.TryParse(request.EndDate, out var end))
        {
            return false;
        }

        var date = day.Date;
        return start.Date <= date && end.Date >= date;
    }

    private LeaveRequest? GetSelectedRequest() => RequestsGrid.SelectedItem as LeaveRequest;

    private async Task DecideAsync(string decision)
    {
        var selected = GetSelectedRequest();
        if (selected is null)
        {
            MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            IsEnabled = false;
            var comment = string.IsNullOrWhiteSpace(CommentTextBox.Text) ? null : CommentTextBox.Text.Trim();
            var updated = await _apiClient.DecideAsync(selected.Id, decision, comment);
            selected.Status = updated.Status;
            selected.ManagerComment = updated.ManagerComment;
            _archiveStore.AddOrUpdateActiveRequest(selected);
            RefreshDayListFromSharedStore();
            _hasChanges = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private async void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        await DecideAsync("APPROVED");
    }

    private async void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        await DecideAsync("REJECTED");
    }

    private async void EditButton_Click(object sender, RoutedEventArgs e)
    {
        var selected = GetSelectedRequest();
        if (selected is null)
        {
            MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var editor = new EditLeaveRequestWindow(_apiClient, selected)
        {
            Owner = this,
        };

        if (editor.ShowDialog() == true)
        {
            _archiveStore.AddOrUpdateActiveRequest(selected);
            RefreshDayListFromSharedStore();
            _hasChanges = true;
        }
    }

    private async void AddButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            IsEnabled = false;
            var users = await _apiClient.GetUsersAsync();
            var addWindow = new AddLeaveRequestWindow(_apiClient, users)
            {
                Owner = this,
            };

            if (addWindow.ShowDialog() == true)
            {
                if (addWindow.CreatedRequest is not null)
                {
                    _archiveStore.AddOrUpdateActiveRequest(addWindow.CreatedRequest);
                }

                RefreshDayListFromSharedStore();
                _hasChanges = true;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = _hasChanges;
        Close();
    }
}

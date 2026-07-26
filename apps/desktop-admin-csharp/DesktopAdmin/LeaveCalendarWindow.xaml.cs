using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using System.Text;

namespace DesktopAdmin;

public partial class LeaveCalendarWindow : Window
{
    [Flags]
    private enum DayState
    {
        None = 0,
        Approved = 1,
        Pending = 2,
    }

    private readonly ApiClient _apiClient;
    private readonly LeaveArchiveStore _archiveStore;
    private List<LeaveRequest> _requests;
    private bool _hasChanges;

    public LeaveCalendarWindow(ApiClient apiClient, IEnumerable<LeaveRequest> requests)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _archiveStore = new LeaveArchiveStore(AppDataPaths.StorageDirectory);
        SeedSharedStore(requests);
        _requests = [];

        RequestsCalendar.SelectedDate = DateTime.Today;
        Activated += (_, _) => RefreshFromSharedStore();
        RefreshFromSharedStore();
        RefreshViews();
    }

    public bool HasChanges => _hasChanges;

    private static DateTime ParseDate(string value)
    {
        if (DateTime.TryParse(value, out var parsed))
        {
            return parsed.Date;
        }

        return DateTime.MinValue;
    }

    private static bool OverlapsMonth(LeaveRequest request, DateTime month)
    {
        var start = ParseDate(request.StartDate);
        var end = ParseDate(request.EndDate);
        var monthStart = new DateTime(month.Year, month.Month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        return start <= monthEnd && end >= monthStart;
    }

    private static bool IsOnDay(LeaveRequest request, DateTime day)
    {
        var start = ParseDate(request.StartDate);
        var end = ParseDate(request.EndDate);
        var date = day.Date;
        return start <= date && end >= date;
    }

    private void RefreshViews()
    {
        var display = RequestsCalendar.DisplayDate;
        var monthItems = _requests
            .Where(x => OverlapsMonth(x, display))
            .ToList();

        MonthRequestsGrid.ItemsSource = monthItems;

        var selectedDate = RequestsCalendar.SelectedDate ?? DateTime.Today;
        var selectedItems = _requests
            .Where(x => IsOnDay(x, selectedDate))
            .ToList();

        SelectedDateRequestsGrid.ItemsSource = selectedItems;
        SelectedDayHeaderTextBlock.Text = $"Wnioski dla dnia: {selectedDate:yyyy-MM-dd}";
        SummaryTextBlock.Text = $"Miesiąc: {display:yyyy-MM} | Wnioski: {monthItems.Count} | Wybrany dzień: {selectedItems.Count}";
        RefreshCalendarDayColors();
    }

    private void RefreshCalendarDayColors()
    {
        var dayStates = BuildDayStateMap();
        var dayRequests = BuildDayRequestsMap();

        RequestsCalendar.Dispatcher.BeginInvoke(() =>
        {
            foreach (var button in FindVisualChildren<CalendarDayButton>(RequestsCalendar))
            {
                if (button.DataContext is not DateTime date)
                {
                    continue;
                }

                if (dayStates.TryGetValue(date.Date, out var state) && state != DayState.None)
                {
                    button.Background = CreateBrushForDayState(state);
                    button.Foreground = Brushes.White;

                    button.FontWeight = FontWeights.SemiBold;

                    if (dayRequests.TryGetValue(date.Date, out var requestsForDay) && requestsForDay.Count > 0)
                    {
                        button.ToolTip = BuildDayTooltip(date.Date, requestsForDay);
                    }
                    else
                    {
                        button.ToolTip = null;
                    }
                }
                else
                {
                    button.ClearValue(Control.BackgroundProperty);
                    button.ClearValue(Control.ForegroundProperty);
                    button.ClearValue(Control.FontWeightProperty);
                    button.ToolTip = null;
                }
            }
        }, DispatcherPriority.Loaded);
    }

    private Dictionary<DateTime, DayState> BuildDayStateMap()
    {
        var map = new Dictionary<DateTime, DayState>();

        foreach (var request in _requests.Where(x => x.Status is "PENDING" or "APPROVED"))
        {
            var start = ParseDate(request.StartDate);
            var end = ParseDate(request.EndDate);

            if (start == DateTime.MinValue || end == DateTime.MinValue || end < start)
            {
                continue;
            }

            var state = string.Equals(request.Status, "APPROVED", StringComparison.Ordinal)
                ? DayState.Approved
                : DayState.Pending;

            for (var day = start.Date; day <= end.Date; day = day.AddDays(1))
            {
                if (!map.TryGetValue(day, out var existingState))
                {
                    map[day] = state;
                    continue;
                }

                map[day] = existingState | state;
            }
        }

        return map;
    }

    private Dictionary<DateTime, List<LeaveRequest>> BuildDayRequestsMap()
    {
        var map = new Dictionary<DateTime, List<LeaveRequest>>();

        foreach (var request in _requests.Where(x => x.Status is "PENDING" or "APPROVED"))
        {
            var start = ParseDate(request.StartDate);
            var end = ParseDate(request.EndDate);
            if (start == DateTime.MinValue || end == DateTime.MinValue || end < start)
            {
                continue;
            }

            for (var day = start.Date; day <= end.Date; day = day.AddDays(1))
            {
                if (!map.TryGetValue(day, out var list))
                {
                    list = [];
                    map[day] = list;
                }

                list.Add(request);
            }
        }

        return map;
    }

    private static Brush CreateBrushForDayState(DayState state)
    {
        var approved = Color.FromRgb(40, 167, 69);
        var pending = Color.FromRgb(220, 53, 69);

        if (state.HasFlag(DayState.Approved) && state.HasFlag(DayState.Pending))
        {
            return new LinearGradientBrush(
                new GradientStopCollection
                {
                    new GradientStop(approved, 0.0),
                    new GradientStop(approved, 0.5),
                    new GradientStop(pending, 0.5),
                    new GradientStop(pending, 1.0),
                },
                new Point(0.5, 0),
                new Point(0.5, 1));
        }

        if (state.HasFlag(DayState.Approved))
        {
            return new SolidColorBrush(approved);
        }

        return new SolidColorBrush(pending);
    }

    private static string BuildDayTooltip(DateTime day, List<LeaveRequest> requests)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Dzień: {day:yyyy-MM-dd}");
        sb.AppendLine("Aktywności:");

        foreach (var request in requests.OrderBy(x => x.UserName).ThenBy(x => x.Id))
        {
            var status = request.Status switch
            {
                "APPROVED" => "zatwierdzony",
                "PENDING" => "przetwarzany",
                _ => request.Status,
            };

            var userName = string.IsNullOrWhiteSpace(request.UserName)
                ? $"ID {request.UserId}"
                : request.UserName;

            sb.AppendLine($"- #{request.Id} {userName}: {request.LeaveTypePl}, {status}");
        }

        return sb.ToString().TrimEnd();
    }

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject parent) where T : DependencyObject
    {
        if (parent is null)
        {
            yield break;
        }

        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            var child = VisualTreeHelper.GetChild(parent, i);
            if (child is T typedChild)
            {
                yield return typedChild;
            }

            foreach (var nested in FindVisualChildren<T>(child))
            {
                yield return nested;
            }
        }
    }

    private void SeedSharedStore(IEnumerable<LeaveRequest> requests)
    {
        foreach (var request in requests)
        {
            _archiveStore.AddOrUpdateActiveRequest(request);
        }
    }

    private void RefreshFromSharedStore()
    {
        _requests = _archiveStore.LoadActiveRequests()
            .Where(x => x.Status is "PENDING" or "APPROVED")
            .OrderBy(x => ParseDate(x.StartDate))
            .ThenBy(x => x.Id)
            .ToList();

        RefreshViews();
    }

    private async Task EditSelectedAsync(LeaveRequest? request)
    {
        if (request is null)
        {
            return;
        }

        var editor = new EditLeaveRequestWindow(_apiClient, request)
        {
            Owner = this
        };

        if (editor.ShowDialog() == true)
        {
            _archiveStore.AddOrUpdateActiveRequest(request);
            _hasChanges = true;
            RefreshFromSharedStore();
        }
    }

    private LeaveRequest? GetSelectedRequest()
    {
        return SelectedDateRequestsGrid.SelectedItem as LeaveRequest
            ?? MonthRequestsGrid.SelectedItem as LeaveRequest;
    }

    private async Task DecideSelectedAsync(string decision)
    {
        var selected = GetSelectedRequest();
        if (selected is null)
        {
            MessageBox.Show("Wybierz wniosek z listy.", "Brak wyboru", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var decisionWindow = new LeaveRequestDecisionWindow(selected.ManagerComment)
        {
            Owner = this,
        };

        if (decisionWindow.ShowDialog() != true || string.IsNullOrWhiteSpace(decisionWindow.Decision))
        {
            return;
        }

        try
        {
            IsEnabled = false;

            var updated = await _apiClient.DecideAsync(selected.Id, decisionWindow.Decision, decisionWindow.Comment);
            selected.Status = updated.Status;
            selected.ManagerComment = updated.ManagerComment;

            _archiveStore.AddOrUpdateActiveRequest(selected);
            _hasChanges = true;
            RefreshFromSharedStore();
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

    private async void MonthRequestsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        await EditSelectedAsync(MonthRequestsGrid.SelectedItem as LeaveRequest);
    }

    private async void SelectedDateRequestsGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        await EditSelectedAsync(SelectedDateRequestsGrid.SelectedItem as LeaveRequest);
    }

    private void RequestsCalendar_SelectedDatesChanged(object sender, SelectionChangedEventArgs e)
    {
        RefreshViews();
    }

    private void RequestsCalendar_DisplayModeChanged(object sender, CalendarModeChangedEventArgs e)
    {
        RefreshViews();
    }

    private void RequestsCalendar_DisplayDateChanged(object sender, CalendarDateChangedEventArgs e)
    {
        RefreshViews();
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            IsEnabled = false;
            RefreshFromSharedStore();
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

    private async void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = _hasChanges;
        Close();
    }

    private async void RequestsCalendar_PreviewMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        var calendar = sender as Calendar;
        if (calendar?.SelectedDate.HasValue == true)
        {
            await OpenSelectedDayAsync(calendar.SelectedDate.Value.Date);
        }
    }

    private async void AddNewRequestButton_Click(object sender, RoutedEventArgs e)
    {
        ShowAddNewRequestWindow();
    }

    private async void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        await DecideSelectedAsync("APPROVED");
    }

    private async void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        await DecideSelectedAsync("REJECTED");
    }

    private async void ShowAddNewRequestWindow()
    {
        try
        {
            IsEnabled = false;
            var users = await _apiClient.GetUsersAsync();

            var addWindow = new AddLeaveRequestWindow(_apiClient, users)
            {
                Owner = this
            };

            if (addWindow.ShowDialog() == true)
            {
                if (addWindow.CreatedRequest is not null)
                {
                    _archiveStore.AddOrUpdateActiveRequest(addWindow.CreatedRequest);
                }

                _hasChanges = true;
                RefreshFromSharedStore();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Błąd: {ex.Message}", "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private async Task OpenSelectedDayAsync(DateTime day)
    {
        var requestsForDay = _requests
            .Where(x => IsOnDay(x, day) && x.Status is "PENDING" or "APPROVED")
            .OrderBy(x => x.Id)
            .ToList();

        if (requestsForDay.Count == 0)
        {
            ShowAddNewRequestWindow();
            return;
        }

        var dayWindow = new DayRequestsActionWindow(_apiClient, day, requestsForDay)
        {
            Owner = this,
        };

        if (dayWindow.ShowDialog() == true)
        {
            _hasChanges = true;
            RefreshFromSharedStore();
        }
    }
}

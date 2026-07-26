using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;

namespace DesktopAdmin;

public partial class EditLeaveRequestWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly LeaveRequest _source;

    private readonly string _originalStatus;
    private readonly string _originalType;
    private readonly string _originalStartDate;
    private readonly string _originalEndDate;
    private readonly string? _originalReason;
    private readonly string? _originalManagerComment;

    private static string NormalizeDateOnly(string value)
    {
        if (DateTime.TryParse(value, out var parsed))
        {
            return parsed.ToString("yyyy-MM-dd");
        }

        return value;
    }

    public EditLeaveRequestWindow(ApiClient apiClient, LeaveRequest request)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _source = request;

        LeaveTypeComboBox.ItemsSource = new[]
        {
            new KeyValuePair<string, string>("ANNUAL", "Urlop roczny"),
            new KeyValuePair<string, string>("ON_DEMAND", "Urlop na żądanie"),
            new KeyValuePair<string, string>("SICK", "Urlop chorobowy"),
            new KeyValuePair<string, string>("UNPAID", "Urlop bezpłatny"),
            new KeyValuePair<string, string>("OTHER", "Inny")
        };
        LeaveTypeComboBox.DisplayMemberPath = "Value";
        LeaveTypeComboBox.SelectedValuePath = "Key";

        StatusComboBox.ItemsSource = new[]
        {
            new KeyValuePair<string, string>("PENDING", "Przetwarzany"),
            new KeyValuePair<string, string>("APPROVED", "Zatwierdzony"),
            new KeyValuePair<string, string>("REJECTED", "Odrzucony"),
            new KeyValuePair<string, string>("CANCELLED", "Anulowany")
        };
        StatusComboBox.DisplayMemberPath = "Value";
        StatusComboBox.SelectedValuePath = "Key";

        IdTextBox.Text = request.Id.ToString();
        UserTextBox.Text = string.IsNullOrWhiteSpace(request.UserName) ? request.UserId.ToString() : $"{request.UserName} (ID: {request.UserId})";
        LeaveTypeComboBox.SelectedValue = request.LeaveType;
        StatusComboBox.SelectedValue = request.Status switch
        {
            "APPROVED" => "APPROVED",
            "REJECTED" => "REJECTED",
            "CANCELLED" => "CANCELLED",
            _ => "PENDING",
        };

        if (DateTime.TryParse(request.StartDate, out var start))
        {
            StartDatePicker.SelectedDate = start;
        }
        else
        {
            StartDatePicker.SelectedDate = DateTime.Today;
        }

        if (DateTime.TryParse(request.EndDate, out var end))
        {
            EndDatePicker.SelectedDate = end;
        }
        else
        {
            EndDatePicker.SelectedDate = DateTime.Today;
        }

        ReasonTextBox.Text = request.Reason ?? string.Empty;
        ManagerCommentTextBox.Text = request.ManagerComment ?? string.Empty;

        _originalStatus = request.Status switch
        {
            "APPROVED" => "APPROVED",
            "REJECTED" => "REJECTED",
            "CANCELLED" => "CANCELLED",
            _ => "PENDING",
        };
        _originalType = request.LeaveType;
        _originalStartDate = NormalizeDateOnly(request.StartDate);
        _originalEndDate = NormalizeDateOnly(request.EndDate);
        _originalReason = request.Reason;
        _originalManagerComment = request.ManagerComment;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private async void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (LeaveTypeComboBox.SelectedValue is not string leaveType)
        {
            MessageBox.Show("Wybierz typ urlopu.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (StatusComboBox.SelectedValue is not string status)
        {
            MessageBox.Show("Wybierz status.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (StartDatePicker.SelectedDate is null || EndDatePicker.SelectedDate is null)
        {
            MessageBox.Show("Uzupełnij daty.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (StartDatePicker.SelectedDate.Value.Date > EndDatePicker.SelectedDate.Value.Date)
        {
            MessageBox.Show("Data rozpoczęcia nie może być późniejsza niż data zakończenia.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var startDate = StartDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd");
        var endDate = EndDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd");
        var reason = string.IsNullOrWhiteSpace(ReasonTextBox.Text) ? null : ReasonTextBox.Text.Trim();
        var managerComment = string.IsNullOrWhiteSpace(ManagerCommentTextBox.Text) ? null : ManagerCommentTextBox.Text.Trim();

        try
        {
            SaveButton.IsEnabled = false;

            var changedCoreData =
                !string.Equals(_originalType, leaveType, StringComparison.Ordinal) ||
                !string.Equals(NormalizeDateOnly(_originalStartDate), startDate, StringComparison.Ordinal) ||
                !string.Equals(NormalizeDateOnly(_originalEndDate), endDate, StringComparison.Ordinal) ||
                !string.Equals(_originalReason ?? string.Empty, reason ?? string.Empty, StringComparison.Ordinal);

            if (changedCoreData)
            {
                await _apiClient.UpdateLeaveRequestForAdminAsync(_source.Id, new UpdateLeaveRequestRequest
                {
                    LeaveType = leaveType,
                    StartDate = startDate,
                    EndDate = endDate,
                    Reason = reason,
                });
            }

            var changedDecisionData =
                !string.Equals(_originalStatus, status, StringComparison.Ordinal) ||
                !string.Equals(_originalManagerComment ?? string.Empty, managerComment ?? string.Empty, StringComparison.Ordinal);

            if (changedDecisionData)
            {
                await _apiClient.DecideAsync(_source.Id, status, managerComment);
            }

            _source.LeaveType = leaveType;
            _source.StartDate = startDate;
            _source.EndDate = endDate;
            _source.Reason = reason;
            _source.Status = status;
            _source.ManagerComment = managerComment;

            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            SaveButton.IsEnabled = true;
        }
    }
}

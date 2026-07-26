using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;

namespace DesktopAdmin;

public partial class AddLeaveRequestWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly List<UserSummary> _users;

    public LeaveRequest? CreatedRequest { get; private set; }

    public AddLeaveRequestWindow(ApiClient apiClient, IEnumerable<UserSummary> users)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _users = users.ToList();

        UserComboBox.ItemsSource = _users;
        UserComboBox.DisplayMemberPath = "Name";
        UserComboBox.SelectedValuePath = "Id";
        UserComboBox.SelectedIndex = 0;

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
        LeaveTypeComboBox.SelectedIndex = 0;

        StartDatePicker.SelectedDate = DateTime.Today;
        EndDatePicker.SelectedDate = DateTime.Today;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e) => Close();

    private async void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (UserComboBox.SelectedValue is not int userId)
        {
            MessageBox.Show("Wybierz użytkownika.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (LeaveTypeComboBox.SelectedValue is not string leaveType)
        {
            MessageBox.Show("Wybierz typ urlopu.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (StartDatePicker.SelectedDate is null || EndDatePicker.SelectedDate is null)
        {
            MessageBox.Show("Uzupełnij daty.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var request = new CreateLeaveRequestRequest
        {
            LeaveType = leaveType,
            StartDate = StartDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd"),
            EndDate = EndDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd"),
            Reason = ReasonTextBox.Text.Trim()
        };

        try
        {
            SaveButton.IsEnabled = false;
            CreatedRequest = await _apiClient.CreateLeaveRequestForAdminAsync(userId, request);
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

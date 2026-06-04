using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System.Windows;

namespace DesktopAdmin;

public partial class EmployeeWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly LoginResponse _session;

    public EmployeeWindow(ApiClient apiClient, LoginResponse session)
    {
        InitializeComponent();
        _apiClient = apiClient;
        _session = session;

        var settings = AppSettings.Load();
        WindowPersistence.Attach(this, settings, "Employee", MineGrid);

        HeaderTextBlock.Text = $"Panel pracownika - {_session.User.Name}";
        ApiInfoTextBlock.Text = $"API: {_apiClient.BaseUrl}";

        LeaveTypeCombo.ItemsSource = new[] { "ANNUAL", "ON_DEMAND", "SICK", "UNPAID" };
        LeaveTypeCombo.SelectedIndex = 0;

        var today = DateTime.Today;
        StartDatePicker.SelectedDate = today;
        EndDatePicker.SelectedDate = today;

        Loaded += async (_, _) => await RunBusyAsync(LoadMineAsync);
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

    private async Task LoadMineAsync()
    {
        MineGrid.ItemsSource = await _apiClient.GetMineAsync();
        StatusTextBlock.Text = "Zaladowano Twoje wnioski.";
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(LoadMineAsync);
    }

    private async void CreateButton_Click(object sender, RoutedEventArgs e)
    {
        await RunBusyAsync(async () =>
        {
            if (StartDatePicker.SelectedDate is null || EndDatePicker.SelectedDate is null)
            {
                throw new InvalidOperationException("Wybierz date rozpoczecia i zakonczenia.");
            }

            if (EndDatePicker.SelectedDate.Value.Date < StartDatePicker.SelectedDate.Value.Date)
            {
                throw new InvalidOperationException("Data zakonczenia nie moze byc wczesniejsza niz data rozpoczecia.");
            }

            var request = new CreateLeaveRequestRequest
            {
                LeaveType = (LeaveTypeCombo.SelectedItem as string) ?? "ANNUAL",
                StartDate = StartDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd"),
                EndDate = EndDatePicker.SelectedDate.Value.ToString("yyyy-MM-dd"),
                Reason = string.IsNullOrWhiteSpace(ReasonTextBox.Text) ? null : ReasonTextBox.Text.Trim(),
            };

            await _apiClient.CreateLeaveRequestAsync(request);
            ReasonTextBox.Clear();
            await LoadMineAsync();
            StatusTextBlock.Text = "Wniosek zostal zlozony.";
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

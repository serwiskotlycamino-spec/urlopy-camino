using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System;
using System.Windows;

namespace DesktopAdmin;

public partial class EditUserWindow : Window
{
    private static readonly RoleOption[] RoleOptions =
    [
        new("ADMIN", "Administrator"),
        new("EMPLOYEE", "Pracownik"),
    ];

    private sealed record RoleOption(string Value, string Label);

    private readonly ApiClient _apiClient;
    private readonly UserSummary _user;

    public int OriginalUserId => _user.Id;
    public int UpdatedUserId { get; private set; }

    public EditUserWindow(ApiClient apiClient, UserSummary user)
    {
        InitializeComponent();
        if (Application.Current.MainWindow != this)
        {
            Owner = Application.Current.MainWindow;
        }

        _apiClient = apiClient;
        _user = user;

        RoleComboBox.ItemsSource = RoleOptions;
        RoleComboBox.DisplayMemberPath = nameof(RoleOption.Label);
        RoleComboBox.SelectedValuePath = nameof(RoleOption.Value);
        RoleComboBox.SelectedValue = user.Role;

        IdTextBox.Text = _user.Id.ToString();
        NameTextBox.Text = _user.Name;
        EmailTextBox.Text = _user.Email;
        UpdatedUserId = _user.Id;
    }

    private async void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        var request = new UpdateUserSettingsRequest();
        bool profileChanged = false;

        if (!int.TryParse(IdTextBox.Text.Trim(), out var newUserId) || newUserId <= 0)
        {
            MessageBox.Show("ID użytkownika musi być dodatnią liczbą całkowitą.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (newUserId != _user.Id)
        {
            request.Id = newUserId;
            profileChanged = true;
        }

        string newName = NameTextBox.Text.Trim();
        if (!string.IsNullOrWhiteSpace(newName) && newName != _user.Name)
        {
            request.Name = newName;
            profileChanged = true;
        }

        string newEmail = EmailTextBox.Text.Trim();
        if (!string.IsNullOrWhiteSpace(newEmail) && newEmail != _user.Email)
        {
            request.Email = newEmail;
            profileChanged = true;
        }

        string newPassword = PasswordTextBox.Text;
        if (!string.IsNullOrWhiteSpace(newPassword))
        {
            request.Password = newPassword;
            profileChanged = true;
        }

        var newRole = (RoleComboBox.SelectedValue as string) ?? "EMPLOYEE";
        var roleChanged = newRole != _user.Role;

        if (!profileChanged && !roleChanged)
        {
            MessageBox.Show("Nie wprowadzono żadnych zmian.", "Informacja", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            if (roleChanged)
            {
                await _apiClient.UpdateUserRoleAsync(_user.Id, new UpdateRoleRequest { Role = newRole });
            }

            if (profileChanged)
            {
                await _apiClient.UpdateUserSettingsAsync(_user.Id, request);
            }

            UpdatedUserId = newUserId;

            DialogResult = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Wystąpił błąd podczas zapisywania zmian: {ex.Message}", "Błąd", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }
}

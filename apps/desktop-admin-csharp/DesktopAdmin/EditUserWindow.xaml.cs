using DesktopAdmin.Models;
using DesktopAdmin.Services;
using System;
using System.Windows;

namespace DesktopAdmin;

public partial class EditUserWindow : Window
{
    private readonly ApiClient _apiClient;
    private readonly UserSummary _user;

    public EditUserWindow(ApiClient apiClient, UserSummary user)
    {
        InitializeComponent();
        if (Application.Current.MainWindow != this)
        {
            Owner = Application.Current.MainWindow;
        }

        _apiClient = apiClient;
        _user = user;

        NameTextBox.Text = _user.Name;
        EmailTextBox.Text = _user.Email;
    }

    private async void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        var request = new UpdateUserSettingsRequest();
        bool hasChanges = false;

        string newName = NameTextBox.Text.Trim();
        if (!string.IsNullOrWhiteSpace(newName) && newName != _user.Name)
        {
            request.Name = newName;
            hasChanges = true;
        }

        string newEmail = EmailTextBox.Text.Trim();
        if (!string.IsNullOrWhiteSpace(newEmail) && newEmail != _user.Email)
        {
            request.Email = newEmail;
            hasChanges = true;
        }

        string newPassword = PasswordTextBox.Text;
        if (!string.IsNullOrWhiteSpace(newPassword))
        {
            request.Password = newPassword;
            hasChanges = true;
        }

        if (!hasChanges)
        {
            MessageBox.Show("Nie wprowadzono żadnych zmian.", "Informacja", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            await _apiClient.UpdateUserSettingsAsync(_user.Id, request);
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

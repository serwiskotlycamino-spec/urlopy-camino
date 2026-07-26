using DesktopAdmin.Models;
using System.Windows;

namespace DesktopAdmin;

public partial class WorkTripEditWindow : Window
{
    public UpdateWorkTripRequest? Result { get; private set; }

    private static bool TryNormalizeTime(string input, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var value = input.Trim();
        var formats = new[] { "HH:mm", "H:mm", "HH:mm:ss", "H:mm:ss" };
        if (DateTime.TryParseExact(value, formats, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var parsed))
        {
            normalized = parsed.ToString("HH:mm");
            return true;
        }

        return false;
    }

    public WorkTripEditWindow(WorkTrip trip)
    {
        InitializeComponent();
        UserTextBox.Text = string.IsNullOrWhiteSpace(trip.UserName) ? $"ID: {trip.UserId}" : trip.UserName;
        DateTextBox.Text = trip.TripDatePl;
        StartTimeTextBox.Text = trip.StartTime;
        EndTimeTextBox.Text = trip.EndTime;
        DestinationTextBox.Text = trip.Destination ?? string.Empty;
        DescriptionTextBox.Text = trip.Description ?? string.Empty;
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (!TryNormalizeTime(StartTimeTextBox.Text, out var start) || !TryNormalizeTime(EndTimeTextBox.Text, out var end))
        {
            MessageBox.Show("Godziny muszą mieć format HH:mm lub HH:mm:ss.", "Błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        Result = new UpdateWorkTripRequest
        {
            StartTime = start,
            EndTime = end,
            Destination = string.IsNullOrWhiteSpace(DestinationTextBox.Text) ? null : DestinationTextBox.Text.Trim(),
            Description = string.IsNullOrWhiteSpace(DescriptionTextBox.Text) ? null : DescriptionTextBox.Text.Trim(),
        };

        DialogResult = true;
        Close();
    }
}

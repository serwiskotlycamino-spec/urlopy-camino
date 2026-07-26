using System.Windows;

namespace DesktopAdmin;

public partial class LeaveRequestDecisionWindow : Window
{
    public string? Decision { get; private set; }
    public string? Comment { get; private set; }

    public LeaveRequestDecisionWindow(string? initialComment)
    {
        InitializeComponent();
        CommentTextBox.Text = initialComment ?? string.Empty;
    }

    private void ApproveButton_Click(object sender, RoutedEventArgs e)
    {
        Decision = "APPROVED";
        Comment = string.IsNullOrWhiteSpace(CommentTextBox.Text) ? null : CommentTextBox.Text.Trim();
        DialogResult = true;
        Close();
    }

    private void RejectButton_Click(object sender, RoutedEventArgs e)
    {
        Decision = "REJECTED";
        Comment = string.IsNullOrWhiteSpace(CommentTextBox.Text) ? null : CommentTextBox.Text.Trim();
        DialogResult = true;
        Close();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
namespace DesktopAdmin.Models;

public sealed class DeletedLeaveRequest
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int? ManagerId { get; set; }
    public string LeaveType { get; set; } = string.Empty;
    public string StartDate { get; set; } = string.Empty;
    public string EndDate { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ManagerComment { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string DeletedAt { get; set; } = string.Empty;
    public string Source { get; set; } = "ACTIVE";

    public string LeaveTypePl => LeaveType switch
    {
        "ANNUAL" => "Urlop roczny",
        "SICK" => "Urlop chorobowy",
        "UNPAID" => "Urlop bezpłatny",
        "ON_DEMAND" => "Urlop na żądanie",
        "OTHER" => "Inny",
        _ => LeaveType,
    };

    public string StatusPl => Status switch
    {
        "PENDING" => "Przetwarzany",
        "APPROVED" => "Zatwierdzony",
        "REJECTED" => "Odrzucony",
        "CANCELLED" => "Anulowany",
        _ => Status,
    };

    public string StartDateOnly => DateTime.TryParse(StartDate, out var date) ? date.ToString("yyyy-MM-dd") : StartDate;
    public string EndDateOnly => DateTime.TryParse(EndDate, out var date) ? date.ToString("yyyy-MM-dd") : EndDate;

    public LeaveRequest ToLeaveRequest()
    {
        return new LeaveRequest
        {
            Id = Id,
            UserId = UserId,
            UserName = UserName,
            ManagerId = ManagerId,
            LeaveType = LeaveType,
            StartDate = StartDate,
            EndDate = EndDate,
            Reason = Reason,
            Status = Status,
            ManagerComment = ManagerComment,
            CreatedAt = CreatedAt,
        };
    }
}

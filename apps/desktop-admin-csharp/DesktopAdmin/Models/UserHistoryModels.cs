namespace DesktopAdmin.Models;

public sealed class UserLocalProfile
{
    public int UserId { get; set; }

    public string Address { get; set; } = string.Empty;

    public string Phone { get; set; } = string.Empty;

    public string Notes { get; set; } = string.Empty;
}

public sealed class UserActivityEntry
{
    public long Id { get; set; }

    public int UserId { get; set; }

    public string Action { get; set; } = string.Empty;

    public string Details { get; set; } = string.Empty;

    public string CreatedAt { get; set; } = string.Empty;
}

public sealed class UserStatsOverride
{
    public int UserId { get; set; }

    public int? TotalRequests { get; set; }
    public int? PendingRequests { get; set; }
    public int? ApprovedRequests { get; set; }
    public int? RejectedRequests { get; set; }
    public int? CancelledRequests { get; set; }

    public int? AnnualUsed { get; set; }
    public int? OnDemandUsed { get; set; }
    public int? SickUsed { get; set; }
    public int? RemainingLeave { get; set; }

    public int? TripsTotal { get; set; }
    public int? TripsPending { get; set; }
}

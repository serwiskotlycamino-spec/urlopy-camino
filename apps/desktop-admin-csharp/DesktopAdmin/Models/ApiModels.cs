using System.Text.Json.Serialization;
using System.Globalization;

namespace DesktopAdmin.Models;

public sealed class LoginResponse
{
    [JsonPropertyName("accessToken")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("refreshToken")]
    public string RefreshToken { get; set; } = string.Empty;

    [JsonPropertyName("user")]
    public UserSummary User { get; set; } = new();
}

public sealed class RefreshResponse
{
    [JsonPropertyName("accessToken")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("refreshToken")]
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed class UserSummary
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    public string RolePl
    {
        get
        {
            return Role switch
            {
                "ADMIN" => "Administrator",
                "EMPLOYEE" => "Pracownik",
                _ => Role,
            };
        }
    }

    [JsonPropertyName("managerId")]
    public int? ManagerId { get; set; }

    [JsonPropertyName("manager_id")]
    public int? ManagerIdLegacy
    {
        get => ManagerId;
        set => ManagerId = value;
    }
}

public sealed class LeaveRequest
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("user_id")]
    public int UserId { get; set; }

    [JsonPropertyName("user_name")]
    public string UserName { get; set; } = string.Empty;

    [JsonPropertyName("manager_id")]
    public int? ManagerId { get; set; }

    [JsonPropertyName("leave_type")]
    public string LeaveType { get; set; } = string.Empty;

    public string LeaveTypePl
    {
        get
        {
            return LeaveType switch
            {
                "ANNUAL" => "Urlop roczny",
                "SICK" => "Urlop chorobowy",
                "UNPAID" => "Urlop bezpłatny",
                "ON_DEMAND" => "Urlop na żądanie",
                "OTHER" => "Inny",
                _ => LeaveType,
            };
        }
    }

    [JsonPropertyName("start_date")]
    public string StartDate { get; set; } = string.Empty;

    public string StartDateOnly
    {
        get
        {
            if (DateTime.TryParse(StartDate, out var date))
                return date.ToString("yyyy-MM-dd");
            return StartDate;
        }
    }

    [JsonPropertyName("end_date")]
    public string EndDate { get; set; } = string.Empty;

    public string EndDateOnly
    {
        get
        {
            if (DateTime.TryParse(EndDate, out var date))
                return date.ToString("yyyy-MM-dd");
            return EndDate;
        }
    }

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    public string StatusPl
    {
        get
        {
            return Status switch
            {
                "PENDING" => "Przetwarzany",
                "APPROVED" => "Zatwierdzony",
                "REJECTED" => "Odrzucony",
                "CANCELLED" => "Anulowany",
                _ => Status,
            };
        }
    }

    [JsonPropertyName("manager_comment")]
    public string? ManagerComment { get; set; }

    [JsonPropertyName("created_at")]
    public string CreatedAt { get; set; } = string.Empty;

    public DateTime CreatedAtValue
    {
        get
        {
            if (DateTime.TryParse(CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
            {
                return parsed;
            }

            if (DateTime.TryParse(CreatedAt, out parsed))
            {
                return parsed;
            }

            return DateTime.MinValue;
        }
    }

    public string CreatedAtDisplay => CreatedAtValue == DateTime.MinValue
        ? CreatedAt
        : CreatedAtValue.ToString("HH:mm dd.MM.yyyy");
}

public sealed class MailSettings
{
    [JsonPropertyName("smtpHost")]
    public string SmtpHost { get; set; } = string.Empty;

    [JsonPropertyName("smtpPort")]
    public int SmtpPort { get; set; }

    [JsonPropertyName("smtpUser")]
    public string SmtpUser { get; set; } = string.Empty;

    [JsonPropertyName("smtpFrom")]
    public string SmtpFrom { get; set; } = string.Empty;

    [JsonPropertyName("imapHost")]
    public string ImapHost { get; set; } = string.Empty;

    [JsonPropertyName("imapPort")]
    public int ImapPort { get; set; }

    [JsonPropertyName("imapUser")]
    public string ImapUser { get; set; } = string.Empty;

    [JsonPropertyName("imapSecure")]
    public bool ImapSecure { get; set; }

    [JsonPropertyName("communicationMode")]
    public string CommunicationMode { get; set; } = "MULTI";

    [JsonPropertyName("smtpPassConfigured")]
    public bool SmtpPassConfigured { get; set; }

    [JsonPropertyName("imapPassConfigured")]
    public bool ImapPassConfigured { get; set; }
}

public sealed class CreateUserRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = "EMPLOYEE";

    [JsonPropertyName("managerId")]
    public int? ManagerId { get; set; }
}

public sealed class UpdateRoleRequest
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "EMPLOYEE";

    [JsonPropertyName("managerId")]
    public int? ManagerId { get; set; }
}

public sealed class UpdateUserSettingsRequest
{
    [JsonPropertyName("id")]
    public int? Id { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("password")]
    public string? Password { get; set; }
}

public sealed class UpdateMailSettingsRequest
{
    [JsonPropertyName("smtpHost")]
    public string SmtpHost { get; set; } = string.Empty;

    [JsonPropertyName("smtpPort")]
    public int SmtpPort { get; set; }

    [JsonPropertyName("smtpUser")]
    public string SmtpUser { get; set; } = string.Empty;

    [JsonPropertyName("smtpFrom")]
    public string SmtpFrom { get; set; } = string.Empty;

    [JsonPropertyName("imapHost")]
    public string ImapHost { get; set; } = string.Empty;

    [JsonPropertyName("imapPort")]
    public int ImapPort { get; set; }

    [JsonPropertyName("imapUser")]
    public string ImapUser { get; set; } = string.Empty;

    [JsonPropertyName("imapSecure")]
    public bool ImapSecure { get; set; }

    [JsonPropertyName("communicationMode")]
    public string CommunicationMode { get; set; } = "MULTI";

    [JsonPropertyName("smtpPass")]
    public string? SmtpPass { get; set; }

    [JsonPropertyName("imapPass")]
    public string? ImapPass { get; set; }
}

public sealed class CreateLeaveRequestRequest
{
    [JsonPropertyName("leaveType")]
    public string LeaveType { get; set; } = "ANNUAL";

    [JsonPropertyName("startDate")]
    public string StartDate { get; set; } = string.Empty;

    [JsonPropertyName("endDate")]
    public string EndDate { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class UpdateLeaveRequestRequest
{
    [JsonPropertyName("leaveType")]
    public string LeaveType { get; set; } = "ANNUAL";

    [JsonPropertyName("startDate")]
    public string StartDate { get; set; } = string.Empty;

    [JsonPropertyName("endDate")]
    public string EndDate { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public sealed class CreateWorkTripRequest
{
    [JsonPropertyName("userId")]
    public int UserId { get; set; }

    [JsonPropertyName("tripDate")]
    public string TripDate { get; set; } = string.Empty;

    [JsonPropertyName("startTime")]
    public string StartTime { get; set; } = string.Empty;

    [JsonPropertyName("endTime")]
    public string EndTime { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string? Destination { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public sealed class UpdateWorkTripRequest
{
    [JsonPropertyName("tripDate")]
    public string? TripDate { get; set; }

    [JsonPropertyName("startTime")]
    public string? StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public string? EndTime { get; set; }

    [JsonPropertyName("destination")]
    public string? Destination { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public sealed class ReviewWorkTripRequest
{
    [JsonPropertyName("decision")]
    public string Decision { get; set; } = string.Empty;

    [JsonPropertyName("startTime")]
    public string? StartTime { get; set; }

    [JsonPropertyName("endTime")]
    public string? EndTime { get; set; }

    [JsonPropertyName("comment")]
    public string? Comment { get; set; }
}

public sealed class WorkTrip
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("user_id")]
    public int UserId { get; set; }

    [JsonPropertyName("trip_date")]
    public string TripDate { get; set; } = string.Empty;

    public string TripDatePl
    {
        get
        {
            if (DateTime.TryParse(TripDate, out var date))
            {
                return date.ToString("dd.MM.yyyy");
            }

            return TripDate;
        }
    }

    [JsonPropertyName("start_time")]
    public string StartTime { get; set; } = string.Empty;

    [JsonPropertyName("end_time")]
    public string EndTime { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string? Destination { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("user_name")]
    public string? UserName { get; set; }

    [JsonPropertyName("user_email")]
    public string? UserEmail { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("manager_comment")]
    public string? ManagerComment { get; set; }

    public string StatusPl
    {
        get
        {
            return Status switch
            {
                "PENDING" => "Oczekujący",
                "APPROVED" => "Zatwierdzony",
                "REJECTED" => "Odrzucony",
                "ADJUSTED" => "Skorygowany",
                _ => Status,
            };
        }
    }
}

public sealed class EmployeeLeaveSummary
{
    [JsonPropertyName("userId")]
    public int UserId { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("year")]
    public int Year { get; set; }

    [JsonPropertyName("annualDays")]
    public int AnnualDays { get; set; }

    [JsonPropertyName("usedDays")]
    public int UsedDays { get; set; }

    [JsonPropertyName("remainingDays")]
    public int RemainingDays { get; set; }
}

public sealed class SetLeaveLimitRequest
{
    [JsonPropertyName("annualDays")]
    public int AnnualDays { get; set; }

    [JsonPropertyName("year")]
    public int? Year { get; set; }
}

using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DesktopAdmin.Models;

namespace DesktopAdmin.Services;

public sealed class ApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _httpClient;
    private string? _accessToken;
    private string? _refreshToken;

    public ApiClient(string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new ArgumentException("Base URL API jest wymagany.", nameof(baseUrl));
        }

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    public string BaseUrl => _httpClient.BaseAddress?.ToString().TrimEnd('/') ?? string.Empty;
    public bool LastLeaveRequestsSnapshotIsComplete { get; private set; } = true;

    public async Task<LoginResponse> LoginAsync(string email, string password)
    {
        var payload = new
        {
            email,
            password,
        };

        var response = await SendAsync<LoginResponse>(HttpMethod.Post, "auth/login", payload, useAuth: false);
        _accessToken = response.AccessToken;
        _refreshToken = response.RefreshToken;
        return response;
    }

    public Task<List<LeaveRequest>> GetPendingAsync() => SendAsync<List<LeaveRequest>>(HttpMethod.Get, "leave-requests/pending");

    public async Task<List<LeaveRequest>> GetAllLeaveRequestsAsync()
    {
        try
        {
            var result = await SendAsync<List<LeaveRequest>>(HttpMethod.Get, "leave-requests/all");
            LastLeaveRequestsSnapshotIsComplete = true;
            return result;
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Cannot GET /leave-requests/all", StringComparison.OrdinalIgnoreCase))
        {
            // Backward compatibility for deployments that still expose only /leave-requests/pending.
            var pendingOnly = await SendAsync<List<LeaveRequest>>(HttpMethod.Get, "leave-requests/pending");
            LastLeaveRequestsSnapshotIsComplete = false;
            return pendingOnly;
        }
    }

    public Task<List<LeaveRequest>> GetMineAsync() => SendAsync<List<LeaveRequest>>(HttpMethod.Get, "leave-requests/mine");

    public Task<LeaveRequest> CreateLeaveRequestAsync(CreateLeaveRequestRequest request) =>
        SendAsync<LeaveRequest>(HttpMethod.Post, "leave-requests", request);

    public Task<List<UserSummary>> GetUsersAsync() => SendAsync<List<UserSummary>>(HttpMethod.Get, "auth/users");

    public Task<List<UserSummary>> GetLoginListAsync() =>
        SendAsync<List<UserSummary>>(HttpMethod.Get, "auth/login-list", useAuth: false);

    public Task<UserSummary> CreateUserAsync(CreateUserRequest request) =>
        SendAsync<UserSummary>(HttpMethod.Post, "auth/users", request);

    public Task<UserSummary> UpdateUserRoleAsync(int userId, UpdateRoleRequest request) =>
        SendAsync<UserSummary>(HttpMethod.Patch, $"auth/users/{userId}/role", request);

    public Task<UserSummary> UpdateUserSettingsAsync(int userId, UpdateUserSettingsRequest request) =>
        SendAsync<UserSummary>(HttpMethod.Patch, $"auth/users/{userId}", request);

    public Task<MailSettings> GetMailSettingsAsync() => SendAsync<MailSettings>(HttpMethod.Get, "auth/mail-settings");

    public Task<MailSettings> UpdateMailSettingsAsync(UpdateMailSettingsRequest request) =>
        SendAsync<MailSettings>(HttpMethod.Put, "auth/mail-settings", request);

    public async Task LogoutAsync()
    {
        try
        {
            await SendAsync<object>(HttpMethod.Post, "auth/logout", new { });
        }
        catch (UnauthorizedAccessException)
        {
            // Sesja i tak jest nieważna - lokalne tokeny czyścimy poniżej.
        }
        catch (InvalidOperationException)
        {
            // Błąd API podczas wylogowania nie powinien blokować lokalnego wylogowania.
        }
        finally
        {
            _accessToken = null;
            _refreshToken = null;
        }
    }

    public Task<LeaveRequest> DecideAsync(int leaveRequestId, string decision, string? comment) =>
        SendAsync<LeaveRequest>(HttpMethod.Patch, $"leave-requests/{leaveRequestId}/decision", new { decision, comment });

    public Task<LeaveRequest> CreateLeaveRequestForAdminAsync(int userId, CreateLeaveRequestRequest request) =>
        SendAsync<LeaveRequest>(HttpMethod.Post, "leave-requests/admin", new { userId, leaveType = request.LeaveType, startDate = request.StartDate, endDate = request.EndDate, reason = request.Reason });

    public Task<LeaveRequest> UpdateLeaveRequestForAdminAsync(int leaveRequestId, UpdateLeaveRequestRequest request) =>
        UpdateLeaveRequestForAdminInternalAsync(leaveRequestId, request);

    private async Task<LeaveRequest> UpdateLeaveRequestForAdminInternalAsync(int leaveRequestId, UpdateLeaveRequestRequest request)
    {
        var payload = new { request.LeaveType, request.StartDate, request.EndDate, request.Reason };
        Exception? lastRouteError = null;
        var routes = new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Patch, $"leave-requests/{leaveRequestId}/admin"),
            (HttpMethod.Patch, $"leave-requests/admin/{leaveRequestId}"),
            (HttpMethod.Patch, $"leave-requests/{leaveRequestId}"),
            (HttpMethod.Put, $"leave-requests/{leaveRequestId}/admin"),
            (HttpMethod.Put, $"leave-requests/{leaveRequestId}"),
        };

        foreach (var route in routes)
        {
            try
            {
                return await SendAsync<LeaveRequest>(route.Method, route.Path, payload);
            }
            catch (InvalidOperationException ex) when (ShouldTryNextLeaveUpdateRoute(ex.Message))
            {
                lastRouteError = ex;
            }
        }

        if (lastRouteError is not null)
        {
            throw lastRouteError;
        }

        throw new InvalidOperationException("Nie znaleziono wspieranej trasy API do aktualizacji wniosku.");
    }

    private static bool ShouldTryNextLeaveUpdateRoute(string message) =>
        message.Contains("Cannot PATCH", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Cannot PUT", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Not Found", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Forbidden", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("PENDING", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("rozpatrz", StringComparison.OrdinalIgnoreCase);

    public Task DeleteLeaveRequestForAdminAsync(int leaveRequestId) =>
        DeleteLeaveRequestForAdminInternalAsync(leaveRequestId);

    private async Task DeleteLeaveRequestForAdminInternalAsync(int leaveRequestId)
    {
        Exception? lastRouteError = null;
        var routes = new[]
        {
            $"leave-requests/{leaveRequestId}/admin",
            $"leave-requests/admin/{leaveRequestId}",
            $"leave-requests/{leaveRequestId}",
        };

        foreach (var route in routes)
        {
            try
            {
                await SendAsync<object>(HttpMethod.Delete, route);
                return;
            }
            catch (InvalidOperationException ex) when (ShouldTryNextLeaveDeleteRoute(ex.Message))
            {
                lastRouteError = ex;
            }
        }

        if (lastRouteError is not null)
        {
            throw lastRouteError;
        }

        throw new InvalidOperationException("Nie znaleziono wspieranej trasy API do usunięcia wniosku.");
    }

    private static bool ShouldTryNextLeaveDeleteRoute(string message) =>
        message.Contains("Cannot DELETE", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Not Found", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Forbidden", StringComparison.OrdinalIgnoreCase);

    private static bool IsMissingWorkTripReviewRoute(string message) =>
        message.Contains("Cannot PATCH", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Cannot PUT", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("Not Found", StringComparison.OrdinalIgnoreCase);

    public Task<List<WorkTrip>> GetAllWorkTripsAsync() =>
        SendAsync<List<WorkTrip>>(HttpMethod.Get, "work-trips/all");

    public Task<List<EmployeeLeaveSummary>> GetLeaveLimitsAsync(int? year = null)
    {
        var url = year.HasValue ? $"leave-limits?year={year}" : "leave-limits";
        return SendAsync<List<EmployeeLeaveSummary>>(HttpMethod.Get, url);
    }

    public Task<EmployeeLeaveSummary> SetLeaveLimitAsync(int userId, SetLeaveLimitRequest request) =>
        SendAsync<EmployeeLeaveSummary>(HttpMethod.Put, $"leave-limits/{userId}", request);

    public Task DeleteUserAsync(int userId) =>
        SendAsync<object>(HttpMethod.Delete, $"auth/users/{userId}");

    public Task<WorkTrip> CreateWorkTripAsync(CreateWorkTripRequest request) =>
        SendAsync<WorkTrip>(HttpMethod.Post, "work-trips", request);

    public Task<WorkTrip> UpdateWorkTripAsync(int tripId, UpdateWorkTripRequest request) =>
        SendAsync<WorkTrip>(HttpMethod.Patch, $"work-trips/{tripId}/hours", request);

    public Task<WorkTrip> ReviewWorkTripAsync(int tripId, ReviewWorkTripRequest request) =>
        ReviewWorkTripInternalAsync(tripId, request);

    private async Task<WorkTrip> ReviewWorkTripInternalAsync(int tripId, ReviewWorkTripRequest request)
    {
        Exception? lastRouteError = null;
        var routes = new (HttpMethod Method, string Path)[]
        {
            (HttpMethod.Patch, $"work-trips/{tripId}/review"),
            (HttpMethod.Patch, $"work-trips/review/{tripId}"),
            (HttpMethod.Patch, $"work-trips/{tripId}/decision"),
            (HttpMethod.Put, $"work-trips/{tripId}/review"),
            (HttpMethod.Put, $"work-trips/review/{tripId}"),
        };

        foreach (var route in routes)
        {
            try
            {
                return await SendAsync<WorkTrip>(route.Method, route.Path, request);
            }
            catch (InvalidOperationException ex) when (IsMissingWorkTripReviewRoute(ex.Message))
            {
                lastRouteError = ex;
            }
        }

        if (lastRouteError is not null)
        {
            throw lastRouteError;
        }

        throw new InvalidOperationException("Nie znaleziono wspieranej trasy API do decyzji wyjazdu.");
    }

    public Task DeleteWorkTripAsync(int tripId) =>
        SendAsync<object>(HttpMethod.Delete, $"work-trips/{tripId}");

    private async Task<T> SendAsync<T>(HttpMethod method, string path, object? body = null, bool useAuth = true)
    {
        using var request = new HttpRequestMessage(method, path);

        if (useAuth && !string.IsNullOrWhiteSpace(_accessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
        }

        if (body is not null)
        {
            var json = JsonSerializer.Serialize(body, JsonOptions);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        using var response = await _httpClient.SendAsync(request);

        if (response.StatusCode == HttpStatusCode.Unauthorized && useAuth)
        {
            if (await TryRefreshTokenAsync())
            {
                return await SendAsync<T>(method, path, body, useAuth: true);
            }
            
            throw new UnauthorizedAccessException("Token jest nieprawidłowy lub sesja wygasła.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var responseText = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(ExtractApiMessage(response.StatusCode, responseText));
        }

        var successResponseText = await response.Content.ReadAsStringAsync();
        var parsed = JsonSerializer.Deserialize<T>(successResponseText, JsonOptions);
        if (parsed is null)
        {
            throw new InvalidOperationException("Brak danych w odpowiedzi API.");
        }

        return parsed;
    }

    private async Task<bool> TryRefreshTokenAsync()
    {
        if (string.IsNullOrWhiteSpace(_refreshToken))
        {
            return false;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "auth/refresh")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { refreshToken = _refreshToken }, JsonOptions),
                Encoding.UTF8,
                "application/json"),
        };

        using var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return false;
        }

        var text = await response.Content.ReadAsStringAsync();
        var parsed = JsonSerializer.Deserialize<RefreshResponse>(text, JsonOptions);
        if (parsed is null)
        {
            return false;
        }

        _accessToken = parsed.AccessToken;
        _refreshToken = parsed.RefreshToken;
        return true;
    }

    public void RestoreSession(LoginResponse session)
    {
        _accessToken = session.AccessToken;
        _refreshToken = session.RefreshToken;
    }

    private static string ExtractApiMessage(HttpStatusCode statusCode, string responseText)
    {
        if (!string.IsNullOrWhiteSpace(responseText))
        {
            try
            {
                using var doc = JsonDocument.Parse(responseText);
                if (doc.RootElement.TryGetProperty("message", out var messageElement))
                {
                    if (messageElement.ValueKind == JsonValueKind.String)
                    {
                        var message = messageElement.GetString();
                        if (!string.IsNullOrWhiteSpace(message))
                        {
                            return message;
                        }
                    }

                    if (messageElement.ValueKind == JsonValueKind.Array)
                    {
                        var messages = messageElement
                            .EnumerateArray()
                            .Where(x => x.ValueKind == JsonValueKind.String)
                            .Select(x => x.GetString())
                            .Where(x => !string.IsNullOrWhiteSpace(x));

                        var combined = string.Join("; ", messages!);
                        if (!string.IsNullOrWhiteSpace(combined))
                        {
                            return combined;
                        }
                    }
                }
            }
            catch (JsonException)
            {
                // Keep fallback below for non-JSON responses.
            }
        }

        return $"Blad API {(int)statusCode}.";
    }
}

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

    public Task<List<LeaveRequest>> GetMineAsync() => SendAsync<List<LeaveRequest>>(HttpMethod.Get, "leave-requests/mine");

    public Task<LeaveRequest> CreateLeaveRequestAsync(CreateLeaveRequestRequest request) =>
        SendAsync<LeaveRequest>(HttpMethod.Post, "leave-requests", request);

    public Task<List<UserSummary>> GetUsersAsync() => SendAsync<List<UserSummary>>(HttpMethod.Get, "auth/users");

    public Task<UserSummary> CreateUserAsync(CreateUserRequest request) =>
        SendAsync<UserSummary>(HttpMethod.Post, "auth/users", request);

    public Task<UserSummary> UpdateUserRoleAsync(int userId, UpdateRoleRequest request) =>
        SendAsync<UserSummary>(HttpMethod.Patch, $"auth/users/{userId}/role", request);

    public Task<MailSettings> GetMailSettingsAsync() => SendAsync<MailSettings>(HttpMethod.Get, "auth/mail-settings");

    public Task<MailSettings> UpdateMailSettingsAsync(UpdateMailSettingsRequest request) =>
        SendAsync<MailSettings>(HttpMethod.Put, "auth/mail-settings", request);

    public Task LogoutAsync() => SendAsync<object>(HttpMethod.Post, "auth/logout", new { });

    public Task<LeaveRequest> DecideAsync(int leaveRequestId, string decision, string? comment) =>
        SendAsync<LeaveRequest>(HttpMethod.Patch, $"leave-requests/{leaveRequestId}/decision", new { decision, comment });

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

        if (response.StatusCode == HttpStatusCode.Unauthorized && useAuth && await TryRefreshTokenAsync())
        {
            return await SendAsync<T>(method, path, body, useAuth: true);
        }

        var responseText = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(ExtractApiMessage(response.StatusCode, responseText));
        }

        var parsed = JsonSerializer.Deserialize<T>(responseText, JsonOptions);
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

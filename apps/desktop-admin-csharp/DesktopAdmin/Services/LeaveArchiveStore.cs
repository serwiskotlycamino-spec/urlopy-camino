using System.IO;
using Microsoft.Data.Sqlite;
using DesktopAdmin.Models;

namespace DesktopAdmin.Services;

public sealed class LeaveArchiveStore
{
    private readonly string _dbPath;

    public LeaveArchiveStore(string baseDirectory)
    {
        Directory.CreateDirectory(baseDirectory);
        _dbPath = Path.Combine(baseDirectory, "leave-archive.db");
        EnsureDatabase();
    }

    public List<LeaveRequest> Load()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at
            FROM leave_archive
            ORDER BY archived_at DESC, id DESC;";

        using var reader = command.ExecuteReader();
        var items = new List<LeaveRequest>();

        while (reader.Read())
        {
            items.Add(new LeaveRequest
            {
                Id = reader.GetInt32(0),
                UserId = reader.GetInt32(1),
                UserName = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                ManagerId = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                LeaveType = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                StartDate = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                EndDate = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                Reason = reader.IsDBNull(7) ? null : reader.GetString(7),
                Status = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                ManagerComment = reader.IsDBNull(9) ? null : reader.GetString(9),
                CreatedAt = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
            });
        }

        return items;
    }

    public List<LeaveRequest> LoadActiveRequests()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at
            FROM leave_active
            ORDER BY id DESC;";

        using var reader = command.ExecuteReader();
        var items = new List<LeaveRequest>();

        while (reader.Read())
        {
            items.Add(new LeaveRequest
            {
                Id = reader.GetInt32(0),
                UserId = reader.GetInt32(1),
                UserName = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                ManagerId = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                LeaveType = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                StartDate = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                EndDate = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                Reason = reader.IsDBNull(7) ? null : reader.GetString(7),
                Status = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                ManagerComment = reader.IsDBNull(9) ? null : reader.GetString(9),
                CreatedAt = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
            });
        }

        return items;
    }

    public void AddOrUpdateActiveRequest(LeaveRequest request)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO leave_active (id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at)
            VALUES ($id, $user_id, $user_name, $manager_id, $leave_type, $start_date, $end_date, $reason, $status, $manager_comment, $created_at)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                user_name = excluded.user_name,
                manager_id = excluded.manager_id,
                leave_type = excluded.leave_type,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                reason = excluded.reason,
                status = excluded.status,
                manager_comment = excluded.manager_comment,
                created_at = excluded.created_at,
                updated_at = CURRENT_TIMESTAMP;";

        command.Parameters.AddWithValue("$id", request.Id);
        command.Parameters.AddWithValue("$user_id", request.UserId);
        command.Parameters.AddWithValue("$user_name", string.IsNullOrWhiteSpace(request.UserName) ? DBNull.Value : request.UserName);
        command.Parameters.AddWithValue("$manager_id", request.ManagerId.HasValue ? request.ManagerId.Value : DBNull.Value);
        command.Parameters.AddWithValue("$leave_type", string.IsNullOrWhiteSpace(request.LeaveType) ? DBNull.Value : request.LeaveType);
        command.Parameters.AddWithValue("$start_date", string.IsNullOrWhiteSpace(request.StartDate) ? DBNull.Value : request.StartDate);
        command.Parameters.AddWithValue("$end_date", string.IsNullOrWhiteSpace(request.EndDate) ? DBNull.Value : request.EndDate);
        command.Parameters.AddWithValue("$reason", string.IsNullOrWhiteSpace(request.Reason) ? DBNull.Value : request.Reason);
        command.Parameters.AddWithValue("$status", string.IsNullOrWhiteSpace(request.Status) ? DBNull.Value : request.Status);
        command.Parameters.AddWithValue("$manager_comment", string.IsNullOrWhiteSpace(request.ManagerComment) ? DBNull.Value : request.ManagerComment);
        command.Parameters.AddWithValue("$created_at", string.IsNullOrWhiteSpace(request.CreatedAt) ? DBNull.Value : request.CreatedAt);

        command.ExecuteNonQuery();
    }

    public void RemoveActiveRequest(int requestId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM leave_active WHERE id = $id;";
        command.Parameters.AddWithValue("$id", requestId);
        command.ExecuteNonQuery();
    }

    public void Save(IEnumerable<LeaveRequest> requests)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        using (var deleteCommand = connection.CreateCommand())
        {
            deleteCommand.Transaction = transaction;
            deleteCommand.CommandText = "DELETE FROM leave_archive;";
            deleteCommand.ExecuteNonQuery();
        }

        foreach (var request in requests)
        {
            Upsert(connection, transaction, request);
        }

        transaction.Commit();
    }

    public void AddOrUpdate(LeaveRequest request)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        Upsert(connection, transaction, request);
        transaction.Commit();
    }

    public void Remove(int requestId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM leave_archive WHERE id = $id;";
        command.Parameters.AddWithValue("$id", requestId);
        command.ExecuteNonQuery();
    }

    private void EnsureDatabase()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            CREATE TABLE IF NOT EXISTS leave_archive (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_name TEXT,
                manager_id INTEGER NULL,
                leave_type TEXT,
                start_date TEXT,
                end_date TEXT,
                reason TEXT,
                status TEXT,
                manager_comment TEXT,
                created_at TEXT,
                archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        command.ExecuteNonQuery();

        using var activeCommand = connection.CreateCommand();
        activeCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS leave_active (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_name TEXT,
                manager_id INTEGER NULL,
                leave_type TEXT,
                start_date TEXT,
                end_date TEXT,
                reason TEXT,
                status TEXT,
                manager_comment TEXT,
                created_at TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        activeCommand.ExecuteNonQuery();

        using var trashCommand = connection.CreateCommand();
        trashCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS leave_trash (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_name TEXT,
                manager_id INTEGER NULL,
                leave_type TEXT,
                start_date TEXT,
                end_date TEXT,
                reason TEXT,
                status TEXT,
                manager_comment TEXT,
                created_at TEXT,
                source TEXT NOT NULL,
                deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        trashCommand.ExecuteNonQuery();

        using var profileCommand = connection.CreateCommand();
        profileCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS user_profile (
                user_id INTEGER PRIMARY KEY,
                address TEXT,
                phone TEXT,
                notes TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        profileCommand.ExecuteNonQuery();

        using var historyCommand = connection.CreateCommand();
        historyCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        historyCommand.ExecuteNonQuery();

        using var statsCommand = connection.CreateCommand();
        statsCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS user_stats_override (
                user_id INTEGER PRIMARY KEY,
                total_requests INTEGER NULL,
                pending_requests INTEGER NULL,
                approved_requests INTEGER NULL,
                rejected_requests INTEGER NULL,
                cancelled_requests INTEGER NULL,
                annual_used INTEGER NULL,
                on_demand_used INTEGER NULL,
                sick_used INTEGER NULL,
                remaining_leave INTEGER NULL,
                trips_total INTEGER NULL,
                trips_pending INTEGER NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        statsCommand.ExecuteNonQuery();

        using var loginCommand = connection.CreateCommand();
        loginCommand.CommandText = @"
            CREATE TABLE IF NOT EXISTS login_memory (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                email TEXT,
                selected_user_email TEXT,
                remember_me INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );";
        loginCommand.ExecuteNonQuery();
    }

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_dbPath}");
        connection.Open();
        return connection;
    }

    private static void Upsert(SqliteConnection connection, SqliteTransaction transaction, LeaveRequest request)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = @"
            INSERT INTO leave_archive (id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at)
            VALUES ($id, $user_id, $user_name, $manager_id, $leave_type, $start_date, $end_date, $reason, $status, $manager_comment, $created_at)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                user_name = excluded.user_name,
                manager_id = excluded.manager_id,
                leave_type = excluded.leave_type,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                reason = excluded.reason,
                status = excluded.status,
                manager_comment = excluded.manager_comment,
                created_at = excluded.created_at,
                archived_at = CURRENT_TIMESTAMP;";

        command.Parameters.AddWithValue("$id", request.Id);
        command.Parameters.AddWithValue("$user_id", request.UserId);
        command.Parameters.AddWithValue("$user_name", string.IsNullOrWhiteSpace(request.UserName) ? DBNull.Value : request.UserName);
        command.Parameters.AddWithValue("$manager_id", request.ManagerId.HasValue ? request.ManagerId.Value : DBNull.Value);
        command.Parameters.AddWithValue("$leave_type", string.IsNullOrWhiteSpace(request.LeaveType) ? DBNull.Value : request.LeaveType);
        command.Parameters.AddWithValue("$start_date", string.IsNullOrWhiteSpace(request.StartDate) ? DBNull.Value : request.StartDate);
        command.Parameters.AddWithValue("$end_date", string.IsNullOrWhiteSpace(request.EndDate) ? DBNull.Value : request.EndDate);
        command.Parameters.AddWithValue("$reason", string.IsNullOrWhiteSpace(request.Reason) ? DBNull.Value : request.Reason);
        command.Parameters.AddWithValue("$status", string.IsNullOrWhiteSpace(request.Status) ? DBNull.Value : request.Status);
        command.Parameters.AddWithValue("$manager_comment", string.IsNullOrWhiteSpace(request.ManagerComment) ? DBNull.Value : request.ManagerComment);
        command.Parameters.AddWithValue("$created_at", string.IsNullOrWhiteSpace(request.CreatedAt) ? DBNull.Value : request.CreatedAt);

        command.ExecuteNonQuery();
    }

    public UserLocalProfile GetUserProfile(int userId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT user_id, address, phone, notes
            FROM user_profile
            WHERE user_id = $user_id;";
        command.Parameters.AddWithValue("$user_id", userId);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return new UserLocalProfile { UserId = userId };
        }

        return new UserLocalProfile
        {
            UserId = reader.GetInt32(0),
            Address = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
            Phone = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
            Notes = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
        };
    }

    public void SaveUserProfile(UserLocalProfile profile)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO user_profile (user_id, address, phone, notes)
            VALUES ($user_id, $address, $phone, $notes)
            ON CONFLICT(user_id) DO UPDATE SET
                address = excluded.address,
                phone = excluded.phone,
                notes = excluded.notes,
                updated_at = CURRENT_TIMESTAMP;";
        command.Parameters.AddWithValue("$user_id", profile.UserId);
        command.Parameters.AddWithValue("$address", string.IsNullOrWhiteSpace(profile.Address) ? DBNull.Value : profile.Address);
        command.Parameters.AddWithValue("$phone", string.IsNullOrWhiteSpace(profile.Phone) ? DBNull.Value : profile.Phone);
        command.Parameters.AddWithValue("$notes", string.IsNullOrWhiteSpace(profile.Notes) ? DBNull.Value : profile.Notes);
        command.ExecuteNonQuery();
    }

    public void AddUserActivity(int userId, string action, string? details)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO user_activity (user_id, action, details)
            VALUES ($user_id, $action, $details);";
        command.Parameters.AddWithValue("$user_id", userId);
        command.Parameters.AddWithValue("$action", action);
        command.Parameters.AddWithValue("$details", string.IsNullOrWhiteSpace(details) ? DBNull.Value : details);
        command.ExecuteNonQuery();
    }

    public List<UserActivityEntry> GetUserActivities(int userId, int limit = 200)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT id, user_id, action, details, created_at
            FROM user_activity
            WHERE user_id = $user_id
            ORDER BY id DESC
            LIMIT $limit;";
        command.Parameters.AddWithValue("$user_id", userId);
        command.Parameters.AddWithValue("$limit", limit);

        using var reader = command.ExecuteReader();
        var items = new List<UserActivityEntry>();
        while (reader.Read())
        {
            items.Add(new UserActivityEntry
            {
                Id = reader.GetInt64(0),
                UserId = reader.GetInt32(1),
                Action = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Details = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
            });
        }

        return items;
    }

    public UserStatsOverride GetUserStatsOverride(int userId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT user_id, total_requests, pending_requests, approved_requests, rejected_requests, cancelled_requests,
                   annual_used, on_demand_used, sick_used, remaining_leave, trips_total, trips_pending
            FROM user_stats_override
            WHERE user_id = $user_id;";
        command.Parameters.AddWithValue("$user_id", userId);

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return new UserStatsOverride { UserId = userId };
        }

        return new UserStatsOverride
        {
            UserId = reader.GetInt32(0),
            TotalRequests = reader.IsDBNull(1) ? null : reader.GetInt32(1),
            PendingRequests = reader.IsDBNull(2) ? null : reader.GetInt32(2),
            ApprovedRequests = reader.IsDBNull(3) ? null : reader.GetInt32(3),
            RejectedRequests = reader.IsDBNull(4) ? null : reader.GetInt32(4),
            CancelledRequests = reader.IsDBNull(5) ? null : reader.GetInt32(5),
            AnnualUsed = reader.IsDBNull(6) ? null : reader.GetInt32(6),
            OnDemandUsed = reader.IsDBNull(7) ? null : reader.GetInt32(7),
            SickUsed = reader.IsDBNull(8) ? null : reader.GetInt32(8),
            RemainingLeave = reader.IsDBNull(9) ? null : reader.GetInt32(9),
            TripsTotal = reader.IsDBNull(10) ? null : reader.GetInt32(10),
            TripsPending = reader.IsDBNull(11) ? null : reader.GetInt32(11),
        };
    }

    public void SaveUserStatsOverride(UserStatsOverride stats)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO user_stats_override (
                user_id, total_requests, pending_requests, approved_requests, rejected_requests, cancelled_requests,
                annual_used, on_demand_used, sick_used, remaining_leave, trips_total, trips_pending
            )
            VALUES (
                $user_id, $total_requests, $pending_requests, $approved_requests, $rejected_requests, $cancelled_requests,
                $annual_used, $on_demand_used, $sick_used, $remaining_leave, $trips_total, $trips_pending
            )
            ON CONFLICT(user_id) DO UPDATE SET
                total_requests = excluded.total_requests,
                pending_requests = excluded.pending_requests,
                approved_requests = excluded.approved_requests,
                rejected_requests = excluded.rejected_requests,
                cancelled_requests = excluded.cancelled_requests,
                annual_used = excluded.annual_used,
                on_demand_used = excluded.on_demand_used,
                sick_used = excluded.sick_used,
                remaining_leave = excluded.remaining_leave,
                trips_total = excluded.trips_total,
                trips_pending = excluded.trips_pending,
                updated_at = CURRENT_TIMESTAMP;";

        command.Parameters.AddWithValue("$user_id", stats.UserId);
        command.Parameters.AddWithValue("$total_requests", stats.TotalRequests.HasValue ? stats.TotalRequests.Value : DBNull.Value);
        command.Parameters.AddWithValue("$pending_requests", stats.PendingRequests.HasValue ? stats.PendingRequests.Value : DBNull.Value);
        command.Parameters.AddWithValue("$approved_requests", stats.ApprovedRequests.HasValue ? stats.ApprovedRequests.Value : DBNull.Value);
        command.Parameters.AddWithValue("$rejected_requests", stats.RejectedRequests.HasValue ? stats.RejectedRequests.Value : DBNull.Value);
        command.Parameters.AddWithValue("$cancelled_requests", stats.CancelledRequests.HasValue ? stats.CancelledRequests.Value : DBNull.Value);
        command.Parameters.AddWithValue("$annual_used", stats.AnnualUsed.HasValue ? stats.AnnualUsed.Value : DBNull.Value);
        command.Parameters.AddWithValue("$on_demand_used", stats.OnDemandUsed.HasValue ? stats.OnDemandUsed.Value : DBNull.Value);
        command.Parameters.AddWithValue("$sick_used", stats.SickUsed.HasValue ? stats.SickUsed.Value : DBNull.Value);
        command.Parameters.AddWithValue("$remaining_leave", stats.RemainingLeave.HasValue ? stats.RemainingLeave.Value : DBNull.Value);
        command.Parameters.AddWithValue("$trips_total", stats.TripsTotal.HasValue ? stats.TripsTotal.Value : DBNull.Value);
        command.Parameters.AddWithValue("$trips_pending", stats.TripsPending.HasValue ? stats.TripsPending.Value : DBNull.Value);

        command.ExecuteNonQuery();
    }

    public LoginMemoryState? LoadLoginMemory()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT email, selected_user_email, remember_me
            FROM login_memory
            WHERE id = 1;";

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new LoginMemoryState
        {
            Email = reader.IsDBNull(0) ? string.Empty : reader.GetString(0),
            SelectedUserEmail = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
            RememberMe = !reader.IsDBNull(2) && reader.GetInt32(2) == 1,
        };
    }

    public void SaveLoginMemory(string email, string selectedUserEmail)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO login_memory (id, email, selected_user_email, remember_me)
            VALUES (1, $email, $selected_user_email, 1)
            ON CONFLICT(id) DO UPDATE SET
                email = excluded.email,
                selected_user_email = excluded.selected_user_email,
                remember_me = 1,
                updated_at = CURRENT_TIMESTAMP;";
        command.Parameters.AddWithValue("$email", string.IsNullOrWhiteSpace(email) ? DBNull.Value : email);
        command.Parameters.AddWithValue("$selected_user_email", string.IsNullOrWhiteSpace(selectedUserEmail) ? DBNull.Value : selectedUserEmail);
        command.ExecuteNonQuery();
    }

    public void ClearLoginMemory()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM login_memory WHERE id = 1;";
        command.ExecuteNonQuery();
    }

    public void AddToTrash(LeaveRequest request, string source)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO leave_trash (id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at, source)
            VALUES ($id, $user_id, $user_name, $manager_id, $leave_type, $start_date, $end_date, $reason, $status, $manager_comment, $created_at, $source)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                user_name = excluded.user_name,
                manager_id = excluded.manager_id,
                leave_type = excluded.leave_type,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                reason = excluded.reason,
                status = excluded.status,
                manager_comment = excluded.manager_comment,
                created_at = excluded.created_at,
                source = excluded.source,
                deleted_at = CURRENT_TIMESTAMP;";

        command.Parameters.AddWithValue("$id", request.Id);
        command.Parameters.AddWithValue("$user_id", request.UserId);
        command.Parameters.AddWithValue("$user_name", string.IsNullOrWhiteSpace(request.UserName) ? DBNull.Value : request.UserName);
        command.Parameters.AddWithValue("$manager_id", request.ManagerId.HasValue ? request.ManagerId.Value : DBNull.Value);
        command.Parameters.AddWithValue("$leave_type", string.IsNullOrWhiteSpace(request.LeaveType) ? DBNull.Value : request.LeaveType);
        command.Parameters.AddWithValue("$start_date", string.IsNullOrWhiteSpace(request.StartDate) ? DBNull.Value : request.StartDate);
        command.Parameters.AddWithValue("$end_date", string.IsNullOrWhiteSpace(request.EndDate) ? DBNull.Value : request.EndDate);
        command.Parameters.AddWithValue("$reason", string.IsNullOrWhiteSpace(request.Reason) ? DBNull.Value : request.Reason);
        command.Parameters.AddWithValue("$status", string.IsNullOrWhiteSpace(request.Status) ? DBNull.Value : request.Status);
        command.Parameters.AddWithValue("$manager_comment", string.IsNullOrWhiteSpace(request.ManagerComment) ? DBNull.Value : request.ManagerComment);
        command.Parameters.AddWithValue("$created_at", string.IsNullOrWhiteSpace(request.CreatedAt) ? DBNull.Value : request.CreatedAt);
        command.Parameters.AddWithValue("$source", source);
        command.ExecuteNonQuery();
    }

    public List<DeletedLeaveRequest> LoadTrash()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = @"
            SELECT id, user_id, user_name, manager_id, leave_type, start_date, end_date, reason, status, manager_comment, created_at, source, deleted_at
            FROM leave_trash
            ORDER BY deleted_at DESC, id DESC;";

        using var reader = command.ExecuteReader();
        var items = new List<DeletedLeaveRequest>();

        while (reader.Read())
        {
            items.Add(new DeletedLeaveRequest
            {
                Id = reader.GetInt32(0),
                UserId = reader.GetInt32(1),
                UserName = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                ManagerId = reader.IsDBNull(3) ? null : reader.GetInt32(3),
                LeaveType = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                StartDate = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                EndDate = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                Reason = reader.IsDBNull(7) ? null : reader.GetString(7),
                Status = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                ManagerComment = reader.IsDBNull(9) ? null : reader.GetString(9),
                CreatedAt = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                Source = reader.IsDBNull(11) ? "ACTIVE" : reader.GetString(11),
                DeletedAt = reader.IsDBNull(12) ? string.Empty : reader.GetString(12),
            });
        }

        return items;
    }

    public void RemoveFromTrash(int requestId)
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM leave_trash WHERE id = $id;";
        command.Parameters.AddWithValue("$id", requestId);
        command.ExecuteNonQuery();
    }

    public void ClearTrash()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM leave_trash;";
        command.ExecuteNonQuery();
    }

    public void RemapUserId(int oldUserId, int newUserId)
    {
        if (oldUserId == newUserId)
        {
            return;
        }

        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();

        ExecuteRemap(connection, transaction, "UPDATE leave_archive SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE leave_archive SET manager_id = $newUserId WHERE manager_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE leave_active SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE leave_active SET manager_id = $newUserId WHERE manager_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE leave_trash SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE leave_trash SET manager_id = $newUserId WHERE manager_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE user_profile SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE user_activity SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);
        ExecuteRemap(connection, transaction, "UPDATE user_stats_override SET user_id = $newUserId WHERE user_id = $oldUserId;", oldUserId, newUserId);

        transaction.Commit();
    }

    private static void ExecuteRemap(SqliteConnection connection, SqliteTransaction transaction, string sql, int oldUserId, int newUserId)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        command.Parameters.AddWithValue("$oldUserId", oldUserId);
        command.Parameters.AddWithValue("$newUserId", newUserId);
        command.ExecuteNonQuery();
    }

    public void RestoreFromTrash(DeletedLeaveRequest item)
    {
        if (item.Source == "ARCHIVE")
        {
            AddOrUpdate(item.ToLeaveRequest());
        }
        else
        {
            AddOrUpdateActiveRequest(item.ToLeaveRequest());
        }

        RemoveFromTrash(item.Id);
    }
}

public sealed class LoginMemoryState
{
    public string Email { get; set; } = string.Empty;
    public string SelectedUserEmail { get; set; } = string.Empty;
    public bool RememberMe { get; set; }
}

using System.IO;

namespace DesktopAdmin.Services;

public static class AppDataPaths
{
    private static readonly string LocalRootDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "SystemUrlopowyCamino");

    private static readonly string StorageConfigPath = Path.Combine(LocalRootDirectory, "storage-path.txt");
    private static string? _cachedStorageDirectory;

    public static string StorageDirectory
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(_cachedStorageDirectory))
            {
                return _cachedStorageDirectory;
            }

            Directory.CreateDirectory(LocalRootDirectory);
            if (File.Exists(StorageConfigPath))
            {
                var configured = File.ReadAllText(StorageConfigPath).Trim();
                if (!string.IsNullOrWhiteSpace(configured))
                {
                    Directory.CreateDirectory(configured);
                    _cachedStorageDirectory = configured;
                    return configured;
                }
            }

            _cachedStorageDirectory = LocalRootDirectory;
            return LocalRootDirectory;
        }
    }

    public static bool SetStorageDirectory(string directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            throw new InvalidOperationException("Ścieżka katalogu danych nie może być pusta.");
        }

        var newDirectory = Path.GetFullPath(directoryPath.Trim());
        Directory.CreateDirectory(newDirectory);

        var oldDirectory = StorageDirectory;
        if (string.Equals(oldDirectory, newDirectory, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        foreach (var fileName in new[] { "settings.json", "leave-archive.db", "leave-archive.json" })
        {
            var oldFile = Path.Combine(oldDirectory, fileName);
            var newFile = Path.Combine(newDirectory, fileName);

            if (File.Exists(oldFile) && !File.Exists(newFile))
            {
                File.Copy(oldFile, newFile);
            }
        }

        Directory.CreateDirectory(LocalRootDirectory);
        File.WriteAllText(StorageConfigPath, newDirectory);
        _cachedStorageDirectory = newDirectory;
        return true;
    }

    public static string GetOneDriveSuggestedDirectory()
    {
        var oneDrive = Environment.GetEnvironmentVariable("OneDriveCommercial");
        if (string.IsNullOrWhiteSpace(oneDrive))
        {
            oneDrive = Environment.GetEnvironmentVariable("OneDrive");
        }

        if (string.IsNullOrWhiteSpace(oneDrive))
        {
            return Path.Combine(StorageDirectory, "CloudData");
        }

        return Path.Combine(oneDrive, "SystemUrlopowyCaminoData");
    }
}

using System.Globalization;
using System.IO.Compression;
using CsvHelper;
using CsvHelper.Configuration;
using HubLens.Core;
using HubLens.Core.AccSchema;

namespace HubLens.Ingest;

public sealed class CsvStreamReader
{
    public const long MaxInlineBytes = 50L * 1024 * 1024;

    public async Task ForEachRowAsync(string filePath, Func<Dictionary<string, string>, Task> onRow, CancellationToken cancellationToken = default)
    {
        var fileInfo = new FileInfo(filePath);
        if (fileInfo.Length > MaxInlineBytes)
        {
            await StreamRowsAsync(filePath, onRow, cancellationToken);
            return;
        }

        var text = await File.ReadAllTextAsync(filePath, cancellationToken);
        foreach (var row in ParseInline(text))
        {
            await onRow(row);
        }
    }

    public async Task<IReadOnlyList<Dictionary<string, string>>> ReadAllAsync(string filePath, CancellationToken cancellationToken = default)
    {
        var rows = new List<Dictionary<string, string>>();
        await ForEachRowAsync(filePath, row =>
        {
            rows.Add(row);
            return Task.CompletedTask;
        }, cancellationToken);
        return rows;
    }

    private static async Task StreamRowsAsync(string filePath, Func<Dictionary<string, string>, Task> onRow, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(filePath);
        using var reader = new StreamReader(stream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = true,
            IgnoreBlankLines = true,
            TrimOptions = TrimOptions.Trim,
            BadDataFound = null,
        });

        if (!await csv.ReadAsync())
        {
            return;
        }

        csv.ReadHeader();
        while (await csv.ReadAsync())
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < csv.HeaderRecord!.Length; i++)
            {
                dict[csv.HeaderRecord[i].Trim()] = csv.GetField(i) ?? string.Empty;
            }

            await onRow(dict);
        }
    }

    private static IEnumerable<Dictionary<string, string>> ParseInline(string text)
    {
        using var reader = new StringReader(text);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = true,
            IgnoreBlankLines = true,
            TrimOptions = TrimOptions.Trim,
            BadDataFound = null,
        });

        while (csv.Read())
        {
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < csv.HeaderRecord!.Length; i++)
            {
                var header = csv.HeaderRecord[i].Trim();
                dict[header] = csv.GetField(i) ?? string.Empty;
            }

            yield return dict;
        }
    }
}

public static class ZipExtractor
{
    public static Task<string> ExtractAsync(Stream zipStream, string destinationDirectory, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(destinationDirectory);
        var tempZip = Path.Combine(destinationDirectory, "upload.zip");
        return ExtractInternalAsync(zipStream, destinationDirectory, tempZip, cancellationToken);
    }

    private static async Task<string> ExtractInternalAsync(Stream zipStream, string destinationDirectory, string tempZip, CancellationToken cancellationToken)
    {
        await using (var file = File.Create(tempZip))
        {
            await zipStream.CopyToAsync(file, cancellationToken);
        }

        ZipFile.ExtractToDirectory(tempZip, destinationDirectory, overwriteFiles: true);
        File.Delete(tempZip);
        return ResolveCsvRoot(destinationDirectory);
    }

    private static string ResolveCsvRoot(string directory)
    {
        if (File.Exists(Path.Combine(directory, AccSchemaConstants.MetadataFilename)))
        {
            return directory;
        }

        foreach (var subDirectory in Directory.EnumerateDirectories(directory))
        {
            if (File.Exists(Path.Combine(subDirectory, AccSchemaConstants.MetadataFilename)))
            {
                return subDirectory;
            }
        }

        return directory;
    }
}

public sealed record IngestSourceFile(string Basename, string AbsolutePath, string TableKey);

public static class IngestFileCatalog
{
    public static IReadOnlyList<IngestSourceFile> ListCsvFiles(string inputDir, HashSet<string> evidenceWhitelist)
    {
        var files = new List<IngestSourceFile>();
        foreach (var absolutePath in Directory.EnumerateFiles(inputDir, "*.csv"))
        {
            var basename = Path.GetFileName(absolutePath);
            if (string.Equals(basename, AccSchemaConstants.MetadataFilename, StringComparison.OrdinalIgnoreCase))
            {
                files.Add(new IngestSourceFile(basename, absolutePath, AccSchemaConstants.MetadataFilename));
                continue;
            }

            var tableKey = AccSchemaConstants.ParseTableKey(basename);
            if (tableKey is null)
            {
                continue;
            }

            var isAdmin = AccSchemaConstants.PriorityAdminTables.Any(t => t.Equals(tableKey, StringComparison.OrdinalIgnoreCase));
            var isEvidence = evidenceWhitelist.Contains(tableKey);
            if (isAdmin || isEvidence)
            {
                files.Add(new IngestSourceFile(basename, absolutePath, tableKey));
            }
        }

        return files
            .OrderBy(f => Array.IndexOf(AccSchemaConstants.PriorityAdminTables, f.TableKey) is var index and >= 0 ? index : 999)
            .ThenBy(f => f.Basename, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}

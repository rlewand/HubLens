namespace HubLens.Core;

public static class CsvValueParser
{
    public static DateTime? ParseTimestamp(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParse(value, out var date) ? date : null;
    }

    public static int? ParseInt(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return int.TryParse(value, out var number) ? number : null;
    }

    public static bool ParseBoolean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value is "1" or "true" or "TRUE" or "yes" or "YES";
    }
}

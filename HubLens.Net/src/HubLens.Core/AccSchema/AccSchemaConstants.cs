namespace HubLens.Core.AccSchema;

public static class AccSchemaConstants
{
    public const string MetadataFilename = "metadata.csv";

    public static readonly string[] PriorityAdminTables =
    [
        "admin_accounts",
        "admin_users",
        "admin_projects",
        "admin_account_services",
        "admin_project_services",
        "admin_project_products",
        "admin_project_users",
        "admin_companies",
        "admin_business_units",
    ];

    private static readonly Dictionary<string, string> ProjectIdColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        ["default"] = "bim360_project_id",
        ["admin_projects"] = "id",
        ["admin_project_services"] = "project_id",
        ["admin_project_products"] = "bim360_project_id",
        ["admin_project_users"] = "bim360_project_id",
    };

    private static readonly Dictionary<string, string> ActivityColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        ["default"] = "created_at",
        ["admin_projects"] = "updated_at",
    };

    private static readonly Dictionary<string, string> UserColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        ["default"] = "created_by",
        ["rfis_rfis"] = "created_by",
        ["issues_issues"] = "created_by",
        ["issuesbim360_issues"] = "created_by",
        ["submittalsacc_items"] = "created_by",
    };

    public static string? ParseTableKey(string filename)
    {
        if (!filename.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (string.Equals(filename, MetadataFilename, StringComparison.OrdinalIgnoreCase))
        {
            return MetadataFilename;
        }

        var baseName = filename[..^4];
        var underscore = baseName.IndexOf('_');
        if (underscore <= 0)
        {
            return null;
        }

        return baseName.ToLowerInvariant();
    }

    public static string GetProjectIdColumn(string tableKey) =>
        ProjectIdColumns.TryGetValue(tableKey, out var column) ? column : ProjectIdColumns["default"];

    public static string GetActivityColumn(string tableKey) =>
        ActivityColumns.TryGetValue(tableKey, out var column) ? column : ActivityColumns["default"];

    public static string GetUserColumn(string tableKey) =>
        UserColumns.TryGetValue(tableKey, out var column) ? column : UserColumns["default"];
}

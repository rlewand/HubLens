namespace HubLens.Core.Maturity;

public enum MaturityLevel
{
    NotEnabled = 0,
    Provisioned = 1,
    Adopted = 2,
    Active = 3,
    Optimized = 4,
}

public static class MaturityLabels
{
    public static string Get(MaturityLevel level) => level switch
    {
        MaturityLevel.NotEnabled => "Not Enabled",
        MaturityLevel.Provisioned => "Provisioned",
        MaturityLevel.Adopted => "Adopted",
        MaturityLevel.Active => "Active",
        MaturityLevel.Optimized => "Optimized",
        _ => "Unknown",
    };
}

public static class ModuleKeys
{
    public static readonly string[] All =
    [
        "docs",
        "build",
        "cost",
        "design_collaboration",
        "model_coordination",
        "field",
        "takeoff",
        "assets",
    ];

    public static readonly IReadOnlyDictionary<string, string> ShortLabels = new Dictionary<string, string>
    {
        ["docs"] = "Docs",
        ["build"] = "Build",
        ["cost"] = "Cost",
        ["design_collaboration"] = "DC",
        ["model_coordination"] = "MC",
        ["field"] = "Field",
        ["takeoff"] = "Takeoff",
        ["assets"] = "Assets",
    };
}

using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace HubLens.Core.Maturity;

public sealed class ThresholdRule
{
    public int? MinRecords { get; set; }
    public int? MinUsers { get; set; }
    public int? MaxDaysSinceActivity { get; set; }
    public int? MinRelatedTables { get; set; }
}

public sealed class ModuleThresholds
{
    public ThresholdRule? Adopted { get; set; }
    public ThresholdRule? Active { get; set; }
    public ThresholdRule? Optimized { get; set; }
}

public sealed class ModuleRule
{
    public required string DisplayName { get; set; }
    public List<string> EnabledFrom { get; set; } = [];
    public List<string> EvidenceTables { get; set; } = [];
    public ModuleThresholds Thresholds { get; set; } = new();
}

public sealed class MaturityRulesConfig
{
    public Dictionary<string, ModuleRule> Modules { get; set; } = new();
}

public static class MaturityRulesLoader
{
    public static MaturityRulesConfig Load(string filePath)
    {
        var yaml = File.ReadAllText(filePath);
        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        return deserializer.Deserialize<MaturityRulesConfig>(yaml)
            ?? throw new InvalidOperationException($"Could not load maturity rules from {filePath}");
    }

    public static HashSet<string> BuildEvidenceWhitelist(MaturityRulesConfig config)
    {
        var tables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var module in config.Modules.Values)
        {
            foreach (var table in module.EvidenceTables)
            {
                tables.Add(table);
            }
        }

        return tables;
    }
}

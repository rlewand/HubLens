namespace HubLens.Core.Maturity;

public sealed class TableEvidence
{
    public required string TableKey { get; init; }
    public int RecordCount { get; init; }
    public int DistinctUsers { get; init; }
    public DateTime? LastActivityAt { get; init; }
}

public sealed class ModuleEvidenceAggregate
{
    public required string ModuleKey { get; init; }
    public int RecordCount { get; init; }
    public int DistinctUsers { get; init; }
    public DateTime? LastActivityAt { get; init; }
    public int TablesWithData { get; init; }
}

public sealed class EnabledFlags
{
    public required IReadOnlyList<string> Services { get; init; }
    public required IReadOnlyList<string> Products { get; init; }
}

public sealed class MaturityMetrics
{
    public bool Enabled { get; init; }
    public int RecordCount { get; init; }
    public int DistinctUsers { get; init; }
    public DateTime? LastActivityAt { get; init; }
    public int TablesWithData { get; init; }
    public required IReadOnlyList<string> EnabledServices { get; init; }
    public required IReadOnlyList<string> EnabledProducts { get; init; }
    public required string LevelLabel { get; init; }
    public required IReadOnlyList<string> Reasons { get; init; }
}

public sealed class MaturityScoreResult
{
    public required string ModuleKey { get; init; }
    public required string DisplayName { get; init; }
    public MaturityLevel Level { get; init; }
    public bool Enabled { get; init; }
    public required MaturityMetrics Metrics { get; init; }
}

public static class MaturityScorer
{
    public static bool IsModuleEnabled(ModuleRule rule, EnabledFlags enabled)
    {
        var keys = enabled.Services.Concat(enabled.Products)
            .Select(k => k.ToLowerInvariant())
            .ToHashSet();
        return rule.EnabledFrom.Any(key => keys.Contains(key.ToLowerInvariant()));
    }

    public static ModuleEvidenceAggregate AggregateEvidence(
        string moduleKey,
        IEnumerable<string> evidenceTables,
        IReadOnlyList<TableEvidence> tableEvidence)
    {
        var tableSet = evidenceTables.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var relevant = tableEvidence.Where(t => tableSet.Contains(t.TableKey)).ToList();
        var recordCount = relevant.Sum(t => t.RecordCount);
        var distinctUsers = relevant.Count == 0 ? 0 : relevant.Max(t => t.DistinctUsers);
        DateTime? latest = relevant.Any(t => t.LastActivityAt.HasValue)
            ? relevant.Where(t => t.LastActivityAt.HasValue).Max(t => t.LastActivityAt)
            : null;
        var tablesWithData = relevant.Count(t => t.RecordCount > 0);

        return new ModuleEvidenceAggregate
        {
            ModuleKey = moduleKey,
            RecordCount = recordCount,
            DistinctUsers = distinctUsers,
            LastActivityAt = latest,
            TablesWithData = tablesWithData,
        };
    }

    public static MaturityScoreResult ComputeMaturityLevel(
        string moduleKey,
        ModuleRule rule,
        EnabledFlags enabled,
        ModuleEvidenceAggregate evidence,
        DateTime? referenceDate = null)
    {
        var reference = referenceDate ?? DateTime.UtcNow;
        var enabledFlag = IsModuleEnabled(rule, enabled);
        var reasons = new List<string>();

        if (!enabledFlag)
        {
            return new MaturityScoreResult
            {
                ModuleKey = moduleKey,
                DisplayName = rule.DisplayName,
                Level = MaturityLevel.NotEnabled,
                Enabled = false,
                Metrics = BuildMetrics(false, evidence, enabled, MaturityLevel.NotEnabled, ["Service or product not enabled on project"]),
            };
        }

        var level = MaturityLevel.Provisioned;
        reasons.Add("Service enabled but no usage evidence yet");

        if (evidence.RecordCount > 0)
        {
            level = MaturityLevel.Adopted;
            reasons.Add($"{evidence.RecordCount} records across {evidence.TablesWithData} table(s)");
        }

        if (MeetsThreshold(rule.Thresholds.Active, evidence, reference))
        {
            level = MaturityLevel.Active;
            reasons.Add("Meets active usage thresholds");
        }

        if (MeetsThreshold(rule.Thresholds.Optimized, evidence, reference))
        {
            level = MaturityLevel.Optimized;
            reasons.Add("Meets optimized usage thresholds");
        }

        return new MaturityScoreResult
        {
            ModuleKey = moduleKey,
            DisplayName = rule.DisplayName,
            Level = level,
            Enabled = true,
            Metrics = BuildMetrics(true, evidence, enabled, level, reasons),
        };
    }

    public static double ComputeOverallMaturity(IReadOnlyList<MaturityScoreResult> scores)
    {
        if (scores.Count == 0)
        {
            return 0;
        }

        return Math.Round(scores.Average(s => (int)s.Level) * 10) / 10;
    }

    private static MaturityMetrics BuildMetrics(
        bool enabled,
        ModuleEvidenceAggregate evidence,
        EnabledFlags flags,
        MaturityLevel level,
        IReadOnlyList<string> reasons) =>
        new()
        {
            Enabled = enabled,
            RecordCount = evidence.RecordCount,
            DistinctUsers = evidence.DistinctUsers,
            LastActivityAt = evidence.LastActivityAt,
            TablesWithData = evidence.TablesWithData,
            EnabledServices = flags.Services,
            EnabledProducts = flags.Products,
            LevelLabel = MaturityLabels.Get(level),
            Reasons = reasons,
        };

    private static bool MeetsThreshold(ThresholdRule? rule, ModuleEvidenceAggregate evidence, DateTime reference)
    {
        if (rule is null)
        {
            return false;
        }

        if (rule.MinRecords.HasValue && evidence.RecordCount < rule.MinRecords.Value)
        {
            return false;
        }

        if (rule.MinUsers.HasValue && evidence.DistinctUsers < rule.MinUsers.Value)
        {
            return false;
        }

        if (rule.MaxDaysSinceActivity.HasValue)
        {
            var days = DaysSince(evidence.LastActivityAt, reference);
            if (days > rule.MaxDaysSinceActivity.Value)
            {
                return false;
            }
        }

        if (rule.MinRelatedTables.HasValue && evidence.TablesWithData < rule.MinRelatedTables.Value)
        {
            return false;
        }

        return true;
    }

    private static double DaysSince(DateTime? date, DateTime reference)
    {
        if (!date.HasValue)
        {
            return double.PositiveInfinity;
        }

        return (reference - date.Value).TotalDays;
    }
}

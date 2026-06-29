namespace HubLens.Data.Entities;

public enum ImportStatus
{
    Pending,
    Processing,
    Completed,
    Failed,
}

public sealed class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string AutodeskUserId { get; set; }
    public string? Email { get; set; }
    public string? Name { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ImportBatch> ImportBatches { get; set; } = [];
}

public sealed class ImportBatch
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string UserId { get; set; }
    public string? AccountId { get; set; }
    public string? AccountName { get; set; }
    public ImportStatus Status { get; set; } = ImportStatus.Pending;
    public int FileCount { get; set; }
    public int ProjectCount { get; set; }
    public string? MetadataJson { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    public User User { get; set; } = null!;
    public ICollection<Project> Projects { get; set; } = [];
    public ICollection<ProjectMaturityScore> MaturityScores { get; set; } = [];
    public ICollection<ModuleEvidence> ModuleEvidence { get; set; } = [];
    public ICollection<ProjectService> ProjectServices { get; set; } = [];
    public ICollection<ProjectProduct> ProjectProducts { get; set; } = [];
}

public sealed class Project
{
    public required string Id { get; set; }
    public required string BatchId { get; set; }
    public required string AccountId { get; set; }
    public required string Name { get; set; }
    public string? Status { get; set; }
    public string? JobNumber { get; set; }
    public string? ProjectType { get; set; }
    public string? Classification { get; set; }
    public string? Country { get; set; }
    public string? BusinessUnitId { get; set; }
    public string? BusinessUnitName { get; set; }
    public bool AccProject { get; set; }
    public int? TotalMemberSize { get; set; }
    public int? TotalCompanySize { get; set; }
    public DateTime? LastSignIn { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public double? OverallMaturity { get; set; }
    public DateTime? LastActivityAt { get; set; }

    public ImportBatch Batch { get; set; } = null!;
    public ICollection<ProjectMaturityScore> MaturityScores { get; set; } = [];
    public ICollection<ModuleEvidence> ModuleEvidence { get; set; } = [];
    public ICollection<ProjectService> Services { get; set; } = [];
    public ICollection<ProjectProduct> Products { get; set; } = [];
}

public sealed class ProjectService
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string BatchId { get; set; }
    public required string ProjectId { get; set; }
    public required string Service { get; set; }
    public required string Status { get; set; }
    public DateTime? CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
}

public sealed class ProjectProduct
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string BatchId { get; set; }
    public required string ProjectId { get; set; }
    public required string ProductKey { get; set; }
    public required string Status { get; set; }
    public DateTime? CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
}

public sealed class ModuleEvidence
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string BatchId { get; set; }
    public required string ProjectId { get; set; }
    public required string ModuleKey { get; set; }
    public required string TableKey { get; set; }
    public int RecordCount { get; set; }
    public int DistinctUsers { get; set; }
    public DateTime? LastActivityAt { get; set; }

    public Project Project { get; set; } = null!;
}

public sealed class ProjectMaturityScore
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string BatchId { get; set; }
    public required string ProjectId { get; set; }
    public required string ModuleKey { get; set; }
    public int Level { get; set; }
    public bool Enabled { get; set; }
    public required string MetricsJson { get; set; }
    public DateTime ComputedAt { get; set; } = DateTime.UtcNow;

    public Project Project { get; set; } = null!;
}

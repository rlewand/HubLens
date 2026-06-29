using HubLens.Data;
using HubLens.Data.Entities;
using HubLens.Core.Maturity;
using Microsoft.EntityFrameworkCore;

namespace HubLens.Web.Services;

public sealed class UserSession(HubLensDbContext db)
{
    private User? _current;

    public async Task<User> GetCurrentUserAsync(CancellationToken cancellationToken = default)
    {
        if (_current is not null)
        {
            return _current;
        }

        _current = await db.Users.FirstAsync(cancellationToken);
        return _current;
    }
}

public sealed record ProjectRowView(
    string Id,
    string BatchId,
    string Name,
    string? Status,
    string? JobNumber,
    bool AccProject,
    int? TotalMemberSize,
    DateTime? StartDate,
    DateTime? EndDate,
    double? OverallMaturity,
    DateTime? LastActivityAt,
    IReadOnlyDictionary<string, int> ModuleLevels);

public sealed record ProjectDetailView(
    Project Project,
    ImportBatch Batch,
    IReadOnlyList<ProjectMaturityScore> Scores,
    IReadOnlyList<ProjectService> Services,
    IReadOnlyList<ProjectProduct> Products,
    IReadOnlyList<ModuleEvidence> Evidence);

public sealed class DashboardService(HubLensDbContext db)
{
    public async Task<ImportBatch?> GetLatestCompletedBatchAsync(string userId, CancellationToken cancellationToken = default) =>
        await db.ImportBatches
            .Where(b => b.UserId == userId && b.Status == ImportStatus.Completed && b.ProjectCount > 0)
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<ImportBatch?> GetLatestAttemptAsync(string userId, CancellationToken cancellationToken = default) =>
        await db.ImportBatches
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectRowView>> GetProjectRowsAsync(string batchId, CancellationToken cancellationToken = default)
    {
        var projects = await db.Projects
            .Where(p => p.BatchId == batchId && !p.AccProject)
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        var scores = await db.ProjectMaturityScores
            .Where(s => s.BatchId == batchId)
            .ToListAsync(cancellationToken);

        var scoresByProject = scores.GroupBy(s => s.ProjectId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(x => x.ModuleKey, x => x.Level));

        return projects.Select(project =>
        {
            var moduleLevels = ModuleKeys.All.ToDictionary(
                key => key,
                key => scoresByProject.TryGetValue(project.Id, out var map) && map.TryGetValue(key, out var level) ? level : 0);

            return new ProjectRowView(
                project.Id,
                project.BatchId,
                project.Name,
                project.Status,
                project.JobNumber,
                project.AccProject,
                project.TotalMemberSize,
                project.StartDate,
                project.EndDate,
                project.OverallMaturity,
                project.LastActivityAt,
                moduleLevels);
        }).ToList();
    }

    public async Task<ProjectDetailView?> GetProjectDetailAsync(string userId, string projectId, CancellationToken cancellationToken = default)
    {
        var batch = await GetLatestCompletedBatchAsync(userId, cancellationToken);
        if (batch is null)
        {
            return null;
        }

        var project = await db.Projects.FindAsync([batch.Id, projectId], cancellationToken);
        if (project is null)
        {
            return null;
        }

        var scores = await db.ProjectMaturityScores
            .Where(s => s.BatchId == batch.Id && s.ProjectId == projectId)
            .OrderBy(s => s.ModuleKey)
            .ToListAsync(cancellationToken);

        var services = await db.ProjectServices
            .Where(s => s.BatchId == batch.Id && s.ProjectId == projectId)
            .OrderBy(s => s.Service)
            .ToListAsync(cancellationToken);

        var products = await db.ProjectProducts
            .Where(p => p.BatchId == batch.Id && p.ProjectId == projectId)
            .OrderBy(p => p.ProductKey)
            .ToListAsync(cancellationToken);

        var evidence = await db.ModuleEvidence
            .Where(e => e.BatchId == batch.Id && e.ProjectId == projectId)
            .OrderByDescending(e => e.RecordCount)
            .ToListAsync(cancellationToken);

        return new ProjectDetailView(project, batch, scores, services, products, evidence);
    }
}

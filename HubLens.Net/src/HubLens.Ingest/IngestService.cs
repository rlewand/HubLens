using System.Text.Json;
using HubLens.Core;
using HubLens.Core.AccSchema;
using HubLens.Core.Maturity;
using HubLens.Data;
using HubLens.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace HubLens.Ingest;

public sealed class IngestService(
    HubLensDbContext db,
    CsvStreamReader csvReader)
{
    private sealed class EvidenceAccumulator
    {
        public int RecordCount { get; set; }
        public HashSet<string> Users { get; } = [];
        public DateTime? LastActivityAt { get; set; }
    }

    public async Task<ImportBatch> ImportZipAsync(string userId, Stream zipStream, CancellationToken cancellationToken = default)
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "hublens", Guid.NewGuid().ToString("N"));
        try
        {
            var csvRoot = await ZipExtractor.ExtractAsync(zipStream, tempRoot, cancellationToken);
            return await RunIngestAsync(userId, csvRoot, cancellationToken);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    public async Task<ImportBatch> RunIngestAsync(string userId, string inputDir, CancellationToken cancellationToken = default)
    {
        var rulesPath = ResolveRulesPath();
        var rules = MaturityRulesLoader.Load(rulesPath);
        var evidenceWhitelist = MaturityRulesLoader.BuildEvidenceWhitelist(rules);
        var files = IngestFileCatalog.ListCsvFiles(inputDir, evidenceWhitelist);

        var batch = new ImportBatch
        {
            UserId = userId,
            Status = ImportStatus.Processing,
            FileCount = files.Count,
        };
        db.ImportBatches.Add(batch);
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            var businessUnits = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var projectIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var evidenceByProjectTable = new Dictionary<string, EvidenceAccumulator>(StringComparer.OrdinalIgnoreCase);
            string? accountId = null;
            string? accountName = null;

            foreach (var file in files)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (file.TableKey == AccSchemaConstants.MetadataFilename)
                {
                    var rows = await csvReader.ReadAllAsync(file.AbsolutePath, cancellationToken);
                    batch.MetadataJson = rows.FirstOrDefault() is { Count: > 0 } row
                        ? JsonSerializer.Serialize(row)
                        : null;
                    continue;
                }

                if (file.TableKey == "admin_accounts")
                {
                    var rows = await csvReader.ReadAllAsync(file.AbsolutePath, cancellationToken);
                    var row = rows.FirstOrDefault();
                    if (row is not null)
                    {
                        accountId = Get(row, "bim360_account_id") ?? accountId;
                        accountName = Get(row, "display_name") ?? accountName;
                    }

                    continue;
                }

                if (file.TableKey == "admin_business_units")
                {
                    await csvReader.ForEachRowAsync(file.AbsolutePath, row =>
                    {
                        var id = Get(row, "id");
                        var name = Get(row, "name");
                        if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(name))
                        {
                            businessUnits[id] = name;
                        }

                        return Task.CompletedTask;
                    }, cancellationToken);
                    continue;
                }

                if (file.TableKey == "admin_projects")
                {
                    accountId = await ImportProjectsAsync(batch, businessUnits, projectIds, file.AbsolutePath, accountId, cancellationToken);
                    continue;
                }

                if (file.TableKey == "admin_project_services")
                {
                    await ImportProjectServicesAsync(batch, projectIds, file.AbsolutePath, cancellationToken);
                    continue;
                }

                if (file.TableKey == "admin_project_products")
                {
                    await ImportProjectProductsAsync(batch, projectIds, file.AbsolutePath, cancellationToken);
                    continue;
                }

                if (evidenceWhitelist.Contains(file.TableKey))
                {
                    await StreamEvidenceAsync(file, projectIds, evidenceByProjectTable, cancellationToken);
                }
            }

            await ScoreProjectsAsync(batch, rules, projectIds, evidenceByProjectTable, cancellationToken);

            batch.Status = ImportStatus.Completed;
            batch.AccountId = accountId;
            batch.AccountName = accountName;
            batch.ProjectCount = await db.Projects.CountAsync(p => p.BatchId == batch.Id, cancellationToken);
            batch.CompletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            return batch;
        }
        catch (Exception ex)
        {
            await CleanupBatchAsync(batch.Id, cancellationToken);
            batch.Status = ImportStatus.Failed;
            batch.ErrorMessage = ex.Message;
            batch.CompletedAt = DateTime.UtcNow;
            batch.ProjectCount = 0;
            await db.SaveChangesAsync(cancellationToken);
            throw;
        }
    }

    private async Task<string?> ImportProjectsAsync(
        ImportBatch batch,
        IReadOnlyDictionary<string, string> businessUnits,
        ISet<string> projectIds,
        string filePath,
        string? accountId,
        CancellationToken cancellationToken)
    {
        var projectBatch = new List<Project>();
        string? firstAccountId = null;

        await csvReader.ForEachRowAsync(filePath, async row =>
        {
            var id = Get(row, "id");
            var rowAccountId = Get(row, "bim360_account_id");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(rowAccountId))
            {
                return;
            }

            firstAccountId ??= rowAccountId;
            var businessUnitId = Get(row, "business_unit_id");
            projectBatch.Add(new Project
            {
                Id = id,
                BatchId = batch.Id,
                AccountId = rowAccountId,
                Name = Get(row, "name") ?? "Unnamed project",
                Status = Get(row, "status"),
                JobNumber = Get(row, "job_number"),
                ProjectType = Get(row, "type"),
                Classification = Get(row, "classification"),
                Country = Get(row, "country"),
                BusinessUnitId = businessUnitId,
                BusinessUnitName = businessUnitId is not null && businessUnits.TryGetValue(businessUnitId, out var buName) ? buName : null,
                AccProject = CsvValueParser.ParseBoolean(Get(row, "acc_project")),
                TotalMemberSize = CsvValueParser.ParseInt(Get(row, "total_member_size")),
                TotalCompanySize = CsvValueParser.ParseInt(Get(row, "total_company_size")),
                LastSignIn = CsvValueParser.ParseTimestamp(Get(row, "last_sign_in")),
                StartDate = CsvValueParser.ParseTimestamp(Get(row, "start_date")),
                EndDate = CsvValueParser.ParseTimestamp(Get(row, "end_date")),
                CreatedAt = CsvValueParser.ParseTimestamp(Get(row, "created_at")),
                UpdatedAt = CsvValueParser.ParseTimestamp(Get(row, "updated_at")),
            });

            if (projectBatch.Count >= 500)
            {
                await FlushProjectsAsync(projectBatch, projectIds, cancellationToken);
            }
        }, cancellationToken);

        await FlushProjectsAsync(projectBatch, projectIds, cancellationToken);

        if (projectIds.Count == 0)
        {
            throw new InvalidOperationException("admin_projects.csv was found but contained no usable project rows.");
        }

        return accountId ?? firstAccountId;
    }

    private async Task FlushProjectsAsync(List<Project> chunk, ISet<string> ids, CancellationToken cancellationToken)
    {
        if (chunk.Count == 0)
        {
            return;
        }

        db.Projects.AddRange(chunk);
        await db.SaveChangesAsync(cancellationToken);
        foreach (var project in chunk)
        {
            ids.Add(project.Id);
        }

        chunk.Clear();
    }

    private async Task ImportProjectServicesAsync(
        ImportBatch batch,
        ISet<string> projectIds,
        string filePath,
        CancellationToken cancellationToken)
    {
        var serviceBatch = new List<ProjectService>();
        await csvReader.ForEachRowAsync(filePath, row =>
        {
            var projectId = Get(row, "project_id") ?? Get(row, "bim360_project_id");
            var service = Get(row, "service");
            if (string.IsNullOrWhiteSpace(projectId) || string.IsNullOrWhiteSpace(service) || !projectIds.Contains(projectId))
            {
                return Task.CompletedTask;
            }

            serviceBatch.Add(new ProjectService
            {
                BatchId = batch.Id,
                ProjectId = projectId,
                Service = service,
                Status = Get(row, "status") ?? "unknown",
                CreatedAt = CsvValueParser.ParseTimestamp(Get(row, "created_at")),
            });

            if (serviceBatch.Count >= 500)
            {
                db.ProjectServices.AddRange(serviceBatch);
                db.SaveChanges();
                serviceBatch.Clear();
            }

            return Task.CompletedTask;
        }, cancellationToken);

        if (serviceBatch.Count > 0)
        {
            db.ProjectServices.AddRange(serviceBatch);
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task ImportProjectProductsAsync(
        ImportBatch batch,
        ISet<string> projectIds,
        string filePath,
        CancellationToken cancellationToken)
    {
        var productBatch = new List<ProjectProduct>();
        await csvReader.ForEachRowAsync(filePath, row =>
        {
            var projectId = Get(row, "bim360_project_id") ?? Get(row, "project_id");
            var productKey = Get(row, "product_key") ?? Get(row, "product");
            if (string.IsNullOrWhiteSpace(projectId) || string.IsNullOrWhiteSpace(productKey) || !projectIds.Contains(projectId))
            {
                return Task.CompletedTask;
            }

            productBatch.Add(new ProjectProduct
            {
                BatchId = batch.Id,
                ProjectId = projectId,
                ProductKey = productKey,
                Status = Get(row, "status") ?? "unknown",
                CreatedAt = CsvValueParser.ParseTimestamp(Get(row, "created_at")),
            });

            if (productBatch.Count >= 500)
            {
                db.ProjectProducts.AddRange(productBatch);
                db.SaveChanges();
                productBatch.Clear();
            }

            return Task.CompletedTask;
        }, cancellationToken);

        if (productBatch.Count > 0)
        {
            db.ProjectProducts.AddRange(productBatch);
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task StreamEvidenceAsync(
        IngestSourceFile file,
        ISet<string> projectIds,
        Dictionary<string, EvidenceAccumulator> evidenceByProjectTable,
        CancellationToken cancellationToken)
    {
        var projectColumn = AccSchemaConstants.GetProjectIdColumn(file.TableKey);
        var activityColumn = AccSchemaConstants.GetActivityColumn(file.TableKey);
        var userColumn = AccSchemaConstants.GetUserColumn(file.TableKey);

        await csvReader.ForEachRowAsync(file.AbsolutePath, row =>
        {
            if (!row.ContainsKey(projectColumn))
            {
                return Task.CompletedTask;
            }

            var projectId = Get(row, projectColumn);
            if (string.IsNullOrWhiteSpace(projectId) || !projectIds.Contains(projectId))
            {
                return Task.CompletedTask;
            }

            var key = $"{projectId}|{file.TableKey}";
            if (!evidenceByProjectTable.TryGetValue(key, out var acc))
            {
                acc = new EvidenceAccumulator();
                evidenceByProjectTable[key] = acc;
            }

            acc.RecordCount += 1;
            var user = Get(row, userColumn);
            if (!string.IsNullOrWhiteSpace(user))
            {
                acc.Users.Add(user);
            }

            var activity = CsvValueParser.ParseTimestamp(Get(row, activityColumn));
            if (activity.HasValue && (!acc.LastActivityAt.HasValue || activity > acc.LastActivityAt))
            {
                acc.LastActivityAt = activity;
            }

            return Task.CompletedTask;
        }, cancellationToken);
    }

    private async Task ScoreProjectsAsync(
        ImportBatch batch,
        MaturityRulesConfig rules,
        ISet<string> projectIds,
        Dictionary<string, EvidenceAccumulator> evidenceByProjectTable,
        CancellationToken cancellationToken)
    {
        var services = await db.ProjectServices
            .Where(s => s.BatchId == batch.Id)
            .ToListAsync(cancellationToken);
        var products = await db.ProjectProducts
            .Where(p => p.BatchId == batch.Id)
            .ToListAsync(cancellationToken);

        var servicesByProject = services.GroupBy(s => s.ProjectId).ToDictionary(g => g.Key, g => g.ToList());
        var productsByProject = products.GroupBy(p => p.ProjectId).ToDictionary(g => g.Key, g => g.ToList());

        foreach (var projectId in projectIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var tableEvidence = evidenceByProjectTable
                .Where(kvp => kvp.Key.StartsWith($"{projectId}|", StringComparison.Ordinal))
                .Select(kvp =>
                {
                    var tableKey = kvp.Key[(projectId.Length + 1)..];
                    return new TableEvidence
                    {
                        TableKey = tableKey,
                        RecordCount = kvp.Value.RecordCount,
                        DistinctUsers = kvp.Value.Users.Count,
                        LastActivityAt = kvp.Value.LastActivityAt,
                    };
                })
                .ToList();

            var enabled = new EnabledFlags
            {
                Services = servicesByProject.TryGetValue(projectId, out var svc)
                    ? svc.Where(s => s.Status.Equals("active", StringComparison.OrdinalIgnoreCase)).Select(s => s.Service).ToList()
                    : [],
                Products = productsByProject.TryGetValue(projectId, out var prod)
                    ? prod.Where(p => p.Status.Equals("active", StringComparison.OrdinalIgnoreCase)).Select(p => p.ProductKey).ToList()
                    : [],
            };

            var scoreResults = new List<MaturityScoreResult>();
            DateTime? lastActivity = null;

            foreach (var (moduleKey, moduleRule) in rules.Modules)
            {
                var aggregate = MaturityScorer.AggregateEvidence(moduleKey, moduleRule.EvidenceTables, tableEvidence);
                var score = MaturityScorer.ComputeMaturityLevel(moduleKey, moduleRule, enabled, aggregate);
                scoreResults.Add(score);

                foreach (var table in moduleRule.EvidenceTables)
                {
                    var evidence = tableEvidence.FirstOrDefault(t => t.TableKey.Equals(table, StringComparison.OrdinalIgnoreCase));
                    if (evidence is null || evidence.RecordCount == 0)
                    {
                        continue;
                    }

                    db.ModuleEvidence.Add(new ModuleEvidence
                    {
                        BatchId = batch.Id,
                        ProjectId = projectId,
                        ModuleKey = moduleKey,
                        TableKey = table,
                        RecordCount = evidence.RecordCount,
                        DistinctUsers = evidence.DistinctUsers,
                        LastActivityAt = evidence.LastActivityAt,
                    });

                    if (evidence.LastActivityAt.HasValue && (!lastActivity.HasValue || evidence.LastActivityAt > lastActivity))
                    {
                        lastActivity = evidence.LastActivityAt;
                    }
                }

                db.ProjectMaturityScores.Add(new ProjectMaturityScore
                {
                    BatchId = batch.Id,
                    ProjectId = projectId,
                    ModuleKey = moduleKey,
                    Level = (int)score.Level,
                    Enabled = score.Enabled,
                    MetricsJson = JsonSerializer.Serialize(score.Metrics),
                });
            }

            var project = await db.Projects.FindAsync([batch.Id, projectId], cancellationToken);
            if (project is not null)
            {
                project.OverallMaturity = MaturityScorer.ComputeOverallMaturity(scoreResults);
                project.LastActivityAt = lastActivity;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task CleanupBatchAsync(string batchId, CancellationToken cancellationToken)
    {
        await db.Projects.Where(p => p.BatchId == batchId).ExecuteDeleteAsync(cancellationToken);
        await db.ProjectMaturityScores.Where(s => s.BatchId == batchId).ExecuteDeleteAsync(cancellationToken);
        await db.ModuleEvidence.Where(e => e.BatchId == batchId).ExecuteDeleteAsync(cancellationToken);
        await db.ProjectServices.Where(s => s.BatchId == batchId).ExecuteDeleteAsync(cancellationToken);
        await db.ProjectProducts.Where(p => p.BatchId == batchId).ExecuteDeleteAsync(cancellationToken);
    }

    private static string ResolveRulesPath()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "config", "maturity-rules.yaml"),
            Path.Combine(Directory.GetCurrentDirectory(), "config", "maturity-rules.yaml"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "config", "maturity-rules.yaml")),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException("Could not locate config/maturity-rules.yaml");
    }

    private static string? Get(IReadOnlyDictionary<string, string> row, string key) =>
        row.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
}

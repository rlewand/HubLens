using HubLens.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace HubLens.Data;

public sealed class HubLensDbContext(DbContextOptions<HubLensDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectService> ProjectServices => Set<ProjectService>();
    public DbSet<ProjectProduct> ProjectProducts => Set<ProjectProduct>();
    public DbSet<ModuleEvidence> ModuleEvidence => Set<ModuleEvidence>();
    public DbSet<ProjectMaturityScore> ProjectMaturityScores => Set<ProjectMaturityScore>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.AutodeskUserId).IsUnique();
        });

        modelBuilder.Entity<ImportBatch>(entity =>
        {
            entity.HasOne(b => b.User).WithMany(u => u.ImportBatches).HasForeignKey(b => b.UserId);
        });

        modelBuilder.Entity<Project>(entity =>
        {
            entity.HasKey(p => new { p.BatchId, p.Id });
            entity.HasOne(p => p.Batch).WithMany(b => b.Projects).HasForeignKey(p => p.BatchId);
            entity.HasIndex(p => new { p.BatchId, p.Name });
            entity.HasIndex(p => new { p.BatchId, p.AccProject });
        });

        modelBuilder.Entity<ProjectService>(entity =>
        {
            entity.HasIndex(s => new { s.BatchId, s.ProjectId, s.Service }).IsUnique();
            entity.HasOne(s => s.Project).WithMany(p => p.Services)
                .HasForeignKey(s => new { s.BatchId, s.ProjectId });
        });

        modelBuilder.Entity<ProjectProduct>(entity =>
        {
            entity.HasIndex(p => new { p.BatchId, p.ProjectId, p.ProductKey }).IsUnique();
            entity.HasOne(p => p.Project).WithMany(x => x.Products)
                .HasForeignKey(p => new { p.BatchId, p.ProjectId });
        });

        modelBuilder.Entity<ModuleEvidence>(entity =>
        {
            entity.HasIndex(e => new { e.BatchId, e.ProjectId, e.ModuleKey, e.TableKey }).IsUnique();
            entity.HasOne(e => e.Project).WithMany(p => p.ModuleEvidence)
                .HasForeignKey(e => new { e.BatchId, e.ProjectId });
        });

        modelBuilder.Entity<ProjectMaturityScore>(entity =>
        {
            entity.HasIndex(s => new { s.BatchId, s.ProjectId, s.ModuleKey }).IsUnique();
            entity.HasOne(s => s.Project).WithMany(p => p.MaturityScores)
                .HasForeignKey(s => new { s.BatchId, s.ProjectId });
        });
    }
}

public static class DatabaseInitializer
{
    public static async Task EnsureCreatedAsync(HubLensDbContext db, CancellationToken cancellationToken = default)
    {
        await db.Database.EnsureCreatedAsync(cancellationToken);

        if (!await db.Users.AnyAsync(cancellationToken))
        {
            db.Users.Add(new User
            {
                AutodeskUserId = "mock-consultant-001",
                Email = "consultant@example.com",
                Name = "Principal Consultant",
            });
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

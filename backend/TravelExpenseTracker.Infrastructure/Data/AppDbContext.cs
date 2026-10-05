using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Vacation> Vacations => Set<Vacation>();
    public DbSet<VacationParticipant> VacationParticipants => Set<VacationParticipant>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ExpenseSplit> ExpenseSplits => Set<ExpenseSplit>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Repayment> Repayments => Set<Repayment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.HasIndex(u => u.Username).IsUnique();
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.Role).HasConversion<string>();
        });

        // Vacation
        modelBuilder.Entity<Vacation>(entity =>
        {
            entity.HasKey(v => v.Id);
            entity.HasOne(v => v.Creator)
                  .WithMany(u => u.CreatedVacations)
                  .HasForeignKey(v => v.CreatedBy)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // VacationParticipant
        modelBuilder.Entity<VacationParticipant>(entity =>
        {
            entity.HasKey(vp => new { vp.VacationId, vp.UserId });
            entity.HasOne(vp => vp.Vacation)
                  .WithMany(v => v.Participants)
                  .HasForeignKey(vp => vp.VacationId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(vp => vp.User)
                  .WithMany(u => u.VacationParticipants)
                  .HasForeignKey(vp => vp.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.Property(vp => vp.SplitWeight).HasPrecision(10, 6);
        });

        // Expense
        modelBuilder.Entity<Expense>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasOne(e => e.Vacation)
                  .WithMany(v => v.Expenses)
                  .HasForeignKey(e => e.VacationId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.PaidBy)
                  .WithMany(u => u.PaidExpenses)
                  .HasForeignKey(e => e.PaidByUserId)
                  .OnDelete(DeleteBehavior.Restrict);
            entity.Property(e => e.Amount).HasPrecision(18, 4);
            entity.Property(e => e.AmountInBaseCurrency).HasPrecision(18, 4);
            entity.Property(e => e.Category).HasConversion<string>();
        });

        // ExpenseSplit
        modelBuilder.Entity<ExpenseSplit>(entity =>
        {
            entity.HasKey(es => new { es.ExpenseId, es.UserId });
            entity.HasOne(es => es.Expense)
                  .WithMany(e => e.Splits)
                  .HasForeignKey(es => es.ExpenseId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(es => es.User)
                  .WithMany()
                  .HasForeignKey(es => es.UserId)
                  .OnDelete(DeleteBehavior.Restrict);
            entity.Property(es => es.Weight).HasPrecision(10, 6);
        });

        // ExchangeRate
        modelBuilder.Entity<ExchangeRate>(entity =>
        {
            entity.HasKey(er => er.Id);
            entity.HasIndex(er => new { er.FromCurrency, er.ToCurrency });
            entity.Property(er => er.Rate).HasPrecision(18, 6);
        });

        // Repayment
        modelBuilder.Entity<Repayment>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.HasOne(r => r.FromUser)
                  .WithMany()
                  .HasForeignKey(r => r.FromUserId)
                  .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(r => r.ToUser)
                  .WithMany()
                  .HasForeignKey(r => r.ToUserId)
                  .OnDelete(DeleteBehavior.Restrict);
            entity.Property(r => r.Amount).HasPrecision(18, 4);
            entity.Property(r => r.Currency).HasMaxLength(3);
            entity.Property(r => r.Note).HasMaxLength(500);
        });
    }
}

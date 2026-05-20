using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Infrastructure.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext context)
    {
        // EnsureCreated creates the schema from the DbContext model on a
        // fresh database and is a no-op when tables already exist.
        // It does not use __EFMigrationsHistory, so it is not affected by
        // stale migration records left over from failed previous runs.
        await context.Database.EnsureCreatedAsync();

        if (await context.Users.AnyAsync())
            return;

        var adminUsername = Environment.GetEnvironmentVariable("ADMIN_USERNAME") ?? "admin";
        var adminPassword = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? "Admin123!";
        var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@example.com";

        var admin = new User
        {
            Id = Guid.NewGuid(),
            Username = adminUsername,
            Email = adminEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            Role = UserRole.Admin,
            CreatedAt = DateTime.UtcNow
        };

        context.Users.Add(admin);
        await context.SaveChangesAsync();
    }
}

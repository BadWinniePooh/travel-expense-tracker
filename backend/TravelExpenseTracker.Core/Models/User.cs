namespace TravelExpenseTracker.Core.Models;

public enum UserRole
{
    Member,
    Admin
}

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Member;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<VacationParticipant> VacationParticipants { get; set; } = new List<VacationParticipant>();
    public ICollection<Vacation> CreatedVacations { get; set; } = new List<Vacation>();
    public ICollection<Expense> PaidExpenses { get; set; } = new List<Expense>();
}

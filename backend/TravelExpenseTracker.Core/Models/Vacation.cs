namespace TravelExpenseTracker.Core.Models;

public class Vacation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string BaseCurrency { get; set; } = "USD";
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User Creator { get; set; } = null!;
    public ICollection<VacationParticipant> Participants { get; set; } = new List<VacationParticipant>();
    public ICollection<Expense> Expenses { get; set; } = new List<Expense>();
}

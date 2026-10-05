namespace TravelExpenseTracker.Core.Models;

// A global payment "FromUser paid ToUser", independent of any vacation. It reduces
// what FromUser owes ToUser across all vacations (or flips the direction if it exceeds it).
public class Repayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FromUserId { get; set; }
    public Guid ToUserId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EUR";
    public string? Note { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public Guid CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User FromUser { get; set; } = null!;
    public User ToUser { get; set; } = null!;
}

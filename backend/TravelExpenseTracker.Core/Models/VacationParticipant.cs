namespace TravelExpenseTracker.Core.Models;

public class VacationParticipant
{
    public Guid VacationId { get; set; }
    public Guid UserId { get; set; }
    public decimal SplitWeight { get; set; } = 1.0m;

    public Vacation Vacation { get; set; } = null!;
    public User User { get; set; } = null!;
}

namespace TravelExpenseTracker.Core.Models;

// Presence of rows for an expense means the split was manually overridden and is
// pinned to these weights; absence means the expense tracks the vacation's current
// participant SplitWeight values dynamically.
public class ExpenseSplit
{
    public Guid ExpenseId { get; set; }
    public Guid UserId { get; set; }
    public decimal Weight { get; set; }

    public Expense Expense { get; set; } = null!;
    public User User { get; set; } = null!;
}

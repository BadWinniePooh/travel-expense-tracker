namespace TravelExpenseTracker.Core.Models;

public enum ExpenseCategory
{
    Accommodation,
    Food,
    Transport,
    Activities,
    Shopping,
    Healthcare,
    Other
}

public class Expense
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid VacationId { get; set; }
    public Guid PaidByUserId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public decimal AmountInBaseCurrency { get; set; }
    public string Description { get; set; } = string.Empty;
    public ExpenseCategory Category { get; set; } = ExpenseCategory.Other;
    public DateTime Date { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Vacation Vacation { get; set; } = null!;
    public User PaidBy { get; set; } = null!;
    public ICollection<ExpenseSplit> Splits { get; set; } = new List<ExpenseSplit>();
}

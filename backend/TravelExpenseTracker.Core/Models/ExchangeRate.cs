namespace TravelExpenseTracker.Core.Models;

public class ExchangeRate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FromCurrency { get; set; } = string.Empty;
    public string ToCurrency { get; set; } = string.Empty;
    public decimal Rate { get; set; }
    public DateTime FetchedAt { get; set; } = DateTime.UtcNow;
}

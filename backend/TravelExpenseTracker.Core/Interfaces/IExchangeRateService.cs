namespace TravelExpenseTracker.Core.Interfaces;

public interface IExchangeRateService
{
    Task<decimal> GetRateAsync(string fromCurrency, string toCurrency);
    Task<decimal> ConvertAsync(decimal amount, string fromCurrency, string toCurrency);
}

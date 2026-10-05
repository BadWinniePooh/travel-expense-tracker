namespace TravelExpenseTracker.Core.Interfaces;

public interface IExchangeRateService
{
    Task<decimal> GetRateAsync(string fromCurrency, string toCurrency);
    // Rate as of the given date (historical rates never change, so they are cached for the process lifetime).
    Task<decimal> GetHistoricalRateAsync(string fromCurrency, string toCurrency, DateTime date);
    Task<decimal> ConvertAsync(decimal amount, string fromCurrency, string toCurrency);
}

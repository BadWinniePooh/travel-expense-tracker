using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;
using TravelExpenseTracker.Infrastructure.Data;

namespace TravelExpenseTracker.Infrastructure.Services;

public class ExchangeRateService : IExchangeRateService
{
    private readonly AppDbContext _context;
    private readonly HttpClient _httpClient;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);

    public ExchangeRateService(AppDbContext context, IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _httpClient = httpClientFactory.CreateClient("frankfurter");
    }

    public async Task<decimal> GetRateAsync(string fromCurrency, string toCurrency)
    {
        if (fromCurrency.Equals(toCurrency, StringComparison.OrdinalIgnoreCase))
            return 1m;

        var from = fromCurrency.ToUpperInvariant();
        var to = toCurrency.ToUpperInvariant();

        // Check cache
        var cutoff = DateTime.UtcNow - CacheDuration;
        var cached = await _context.ExchangeRates
            .Where(r => r.FromCurrency == from && r.ToCurrency == to && r.FetchedAt > cutoff)
            .OrderByDescending(r => r.FetchedAt)
            .FirstOrDefaultAsync();

        if (cached != null)
            return cached.Rate;

        // Fetch from frankfurter.app
        var response = await _httpClient.GetAsync($"https://api.frankfurter.app/latest?from={from}&to={to}");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var rates = doc.RootElement.GetProperty("rates");
        var rate = rates.GetProperty(to).GetDecimal();

        // Store in cache
        var exchangeRate = new ExchangeRate
        {
            FromCurrency = from,
            ToCurrency = to,
            Rate = rate,
            FetchedAt = DateTime.UtcNow
        };

        _context.ExchangeRates.Add(exchangeRate);
        await _context.SaveChangesAsync();

        return rate;
    }

    public async Task<decimal> ConvertAsync(decimal amount, string fromCurrency, string toCurrency)
    {
        var rate = await GetRateAsync(fromCurrency, toCurrency);
        return amount * rate;
    }
}

using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Moq.Protected;
using TravelExpenseTracker.Core.Models;
using TravelExpenseTracker.Infrastructure.Data;
using TravelExpenseTracker.Infrastructure.Services;

namespace TravelExpenseTracker.Tests.Services;

public class ExchangeRateServiceTests
{
    private static AppDbContext MakeContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static (ExchangeRateService Service, AppDbContext Context) MakeService(
        HttpResponseMessage? httpResponse = null)
    {
        var context = MakeContext();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(httpResponse ?? new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"rates":{"EUR":0.85}}""")
            });

        var httpClient = new HttpClient(handlerMock.Object);
        var httpClientFactoryMock = new Mock<IHttpClientFactory>();
        httpClientFactoryMock.Setup(f => f.CreateClient("frankfurter")).Returns(httpClient);

        var service = new ExchangeRateService(context, httpClientFactoryMock.Object);
        return (service, context);
    }

    [Fact]
    public async Task GetRateAsync_SameCurrency_ReturnsOne()
    {
        var (svc, _) = MakeService();

        var rate = await svc.GetRateAsync("USD", "USD");

        rate.Should().Be(1m);
    }

    [Fact]
    public async Task GetRateAsync_SameCurrencyDifferentCase_ReturnsOne()
    {
        var (svc, _) = MakeService();

        var rate = await svc.GetRateAsync("usd", "USD");

        rate.Should().Be(1m);
    }

    [Fact]
    public async Task GetRateAsync_FetchesFromApiWhenNoCacheHit()
    {
        var (svc, _) = MakeService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"rates":{"EUR":0.92}}""")
        });

        var rate = await svc.GetRateAsync("USD", "EUR");

        rate.Should().Be(0.92m);
    }

    [Fact]
    public async Task GetRateAsync_UsesCacheOnSecondCall()
    {
        var callCount = 0;
        var context = MakeContext();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(() =>
            {
                callCount++;
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"rates":{"EUR":0.88}}""")
                };
            });

        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient("frankfurter")).Returns(new HttpClient(handlerMock.Object));
        var svc = new ExchangeRateService(context, factory.Object);

        var rate1 = await svc.GetRateAsync("USD", "EUR");
        var rate2 = await svc.GetRateAsync("USD", "EUR");

        rate1.Should().Be(0.88m);
        rate2.Should().Be(0.88m);
        callCount.Should().Be(1); // second call hits cache
    }

    [Fact]
    public async Task GetRateAsync_FetchesAgainWhenCacheExpired()
    {
        var context = MakeContext();
        // Seed stale cache entry (older than 1 hour)
        context.ExchangeRates.Add(new ExchangeRate
        {
            FromCurrency = "USD",
            ToCurrency = "EUR",
            Rate = 0.80m,
            FetchedAt = DateTime.UtcNow.AddHours(-2)
        });
        await context.SaveChangesAsync();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"rates":{"EUR":0.91}}""")
            });

        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient("frankfurter")).Returns(new HttpClient(handlerMock.Object));
        var svc = new ExchangeRateService(context, factory.Object);

        var rate = await svc.GetRateAsync("USD", "EUR");

        rate.Should().Be(0.91m); // fresh fetch, not stale cache
    }

    [Fact]
    public async Task GetRateAsync_UsesFreshCacheEntry()
    {
        var context = MakeContext();
        context.ExchangeRates.Add(new ExchangeRate
        {
            FromCurrency = "USD",
            ToCurrency = "GBP",
            Rate = 0.75m,
            FetchedAt = DateTime.UtcNow.AddMinutes(-30) // recent
        });
        await context.SaveChangesAsync();

        var handlerMock = new Mock<HttpMessageHandler>();
        handlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"rates":{"GBP":0.99}}""")
            });

        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient("frankfurter")).Returns(new HttpClient(handlerMock.Object));
        var svc = new ExchangeRateService(context, factory.Object);

        var rate = await svc.GetRateAsync("USD", "GBP");

        rate.Should().Be(0.75m); // from cache, not API
    }

    [Fact]
    public async Task ConvertAsync_MultipliesAmountByRate()
    {
        var (svc, _) = MakeService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""{"rates":{"EUR":0.90}}""")
        });

        var result = await svc.ConvertAsync(100m, "USD", "EUR");

        result.Should().Be(90m);
    }

    [Fact]
    public async Task ConvertAsync_SameCurrency_ReturnsSameAmount()
    {
        var (svc, _) = MakeService();

        var result = await svc.ConvertAsync(123.45m, "USD", "USD");

        result.Should().Be(123.45m);
    }
}

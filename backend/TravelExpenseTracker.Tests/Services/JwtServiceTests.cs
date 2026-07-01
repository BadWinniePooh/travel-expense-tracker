using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using TravelExpenseTracker.API.Services;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Tests.Services;

public class JwtServiceTests
{
    private static JwtService MakeService(string? secret = null, string? issuer = null,
        string? audience = null, string? expiryMinutes = null)
    {
        var config = new Dictionary<string, string?>();
        if (secret != null) config["Jwt:Secret"] = secret;
        if (issuer != null) config["Jwt:Issuer"] = issuer;
        if (audience != null) config["Jwt:Audience"] = audience;
        if (expiryMinutes != null) config["Jwt:ExpiryMinutes"] = expiryMinutes;

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(config)
            .Build();

        return new JwtService(configuration);
    }

    private static User MakeUser(UserRole role = UserRole.Member) => new()
    {
        Id = Guid.NewGuid(),
        Username = "testuser",
        Email = "test@example.com",
        PasswordHash = "hash",
        Role = role
    };

    [Fact]
    public void GenerateToken_ReturnsValidJwt()
    {
        var svc = MakeService(secret: "super-secret-key-that-is-long-enough-for-hmac");
        var user = MakeUser();

        var token = svc.GenerateToken(user);

        token.Should().NotBeNullOrEmpty();
        var handler = new JwtSecurityTokenHandler();
        handler.CanReadToken(token).Should().BeTrue();
    }

    [Fact]
    public void GenerateToken_ContainsExpectedClaims()
    {
        var svc = MakeService(secret: "super-secret-key-that-is-long-enough-for-hmac",
            issuer: "my-issuer", audience: "my-audience");
        var user = MakeUser(UserRole.Admin);

        var token = svc.GenerateToken(user);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        jwt.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value.Should().Be(user.Id.ToString());
        jwt.Claims.First(c => c.Type == ClaimTypes.Name).Value.Should().Be(user.Username);
        jwt.Claims.First(c => c.Type == ClaimTypes.Email).Value.Should().Be(user.Email);
        jwt.Claims.First(c => c.Type == ClaimTypes.Role).Value.Should().Be("Admin");
        jwt.Issuer.Should().Be("my-issuer");
    }

    [Fact]
    public void GenerateToken_UsesDefaultsWhenConfigMissing()
    {
        var svc = MakeService(secret: "super-secret-key-that-is-long-enough-for-hmac");
        var user = MakeUser();

        var token = svc.GenerateToken(user);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        jwt.Issuer.Should().Be("travel-expense-tracker");
    }

    [Fact]
    public void GenerateToken_UsesCustomExpiryMinutes()
    {
        var svc = MakeService(secret: "super-secret-key-that-is-long-enough-for-hmac",
            expiryMinutes: "60");
        var user = MakeUser();

        var before = DateTime.UtcNow.AddMinutes(59);
        var token = svc.GenerateToken(user);
        var after = DateTime.UtcNow.AddMinutes(61);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        jwt.ValidTo.Should().BeAfter(before).And.BeBefore(after);
    }

    [Fact]
    public void GenerateToken_ThrowsWhenSecretMissing()
    {
        var svc = MakeService(); // no secret configured

        var user = MakeUser();
        var act = () => svc.GenerateToken(user);

        act.Should().Throw<InvalidOperationException>().WithMessage("*JWT Secret*");
    }
}

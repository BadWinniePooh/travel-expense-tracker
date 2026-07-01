using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using TravelExpenseTracker.API.Controllers;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.API.Services;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Tests.Controllers;

public class AuthControllerTests
{
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly JwtService _jwtService;

    public AuthControllerTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "super-secret-key-for-testing-that-is-long-enough"
            })
            .Build();
        _jwtService = new JwtService(config);
    }

    private static readonly string TestPasswordHash = BCrypt.Net.BCrypt.HashPassword("correct-password");

    private static User MakeUser(UserRole role = UserRole.Member) => new()
    {
        Id = Guid.NewGuid(),
        Username = "alice",
        Email = "alice@example.com",
        PasswordHash = TestPasswordHash,
        Role = role
    };

    private AuthController MakeController(Guid? userId = null)
    {
        var controller = new AuthController(_userRepo.Object, _jwtService);
        if (userId.HasValue)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, userId.Value.ToString())
            };
            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) }
            };
        }
        return controller;
    }

    [Fact]
    public async Task Login_ValidCredentials_ReturnsOkWithToken()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByUsernameAsync("alice")).ReturnsAsync(user);

        var controller = MakeController();
        var result = await controller.Login(new LoginRequest("alice", "correct-password"));

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = ok.Value.Should().BeOfType<LoginResponse>().Subject;
        response.Username.Should().Be("alice");
        response.Token.Should().NotBeNullOrEmpty();
        response.Role.Should().Be("Member");
    }

    [Fact]
    public async Task Login_UserNotFound_ReturnsUnauthorized()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync("nobody")).ReturnsAsync((User?)null);

        var controller = MakeController();
        var result = await controller.Login(new LoginRequest("nobody", "any"));

        result.Result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task Login_WrongPassword_ReturnsUnauthorized()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByUsernameAsync("alice")).ReturnsAsync(user);

        var controller = MakeController();
        var result = await controller.Login(new LoginRequest("alice", "wrong-password"));

        result.Result.Should().BeOfType<UnauthorizedObjectResult>();
    }

    [Fact]
    public async Task Me_AuthenticatedUser_ReturnsMeResponse()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);

        var controller = MakeController(userId: user.Id);
        var result = await controller.Me();

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = ok.Value.Should().BeOfType<MeResponse>().Subject;
        response.Id.Should().Be(user.Id);
        response.Username.Should().Be("alice");
    }

    [Fact]
    public async Task Me_UserNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync((User?)null);

        var controller = MakeController(userId: userId);
        var result = await controller.Me();

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task ChangePassword_CorrectCurrent_ReturnsNoContent()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync(user);

        var controller = MakeController(userId: user.Id);
        var result = await controller.ChangePassword(new ChangePasswordRequest("correct-password", "new-password"));

        result.Should().BeOfType<NoContentResult>();
    }

    [Fact]
    public async Task ChangePassword_WrongCurrent_ReturnsBadRequest()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);

        var controller = MakeController(userId: user.Id);
        var result = await controller.ChangePassword(new ChangePasswordRequest("wrong-password", "new-password"));

        result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task ChangePassword_UserNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync((User?)null);

        var controller = MakeController(userId: userId);
        var result = await controller.ChangePassword(new ChangePasswordRequest("any", "new"));

        result.Should().BeOfType<NotFoundResult>();
    }
}

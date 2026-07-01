using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Xunit;
using Moq;
using TravelExpenseTracker.API.Controllers;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Tests.Controllers;

public class UsersControllerTests
{
    private readonly Mock<IUserRepository> _userRepo = new();

    private UsersController MakeController() => new(_userRepo.Object);

    private static User MakeUser(string username = "alice", string email = "alice@example.com",
        UserRole role = UserRole.Member) => new()
    {
        Id = Guid.NewGuid(),
        Username = username,
        Email = email,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword("password"),
        Role = role
    };

    [Fact]
    public async Task GetUsers_ReturnsAllUsers()
    {
        var users = new List<User> { MakeUser("alice"), MakeUser("bob", "bob@example.com") };
        _userRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(users);

        var result = await MakeController().GetUsers();

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var dtos = ok.Value.Should().BeAssignableTo<IEnumerable<UserDto>>().Subject;
        dtos.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetUser_ExistingId_ReturnsUser()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);

        var result = await MakeController().GetUser(user.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeOfType<UserDto>().Which.Id.Should().Be(user.Id);
    }

    [Fact]
    public async Task GetUser_NotFound_ReturnsNotFound()
    {
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await MakeController().GetUser(Guid.NewGuid());

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task CreateUser_ValidRequest_ReturnsCreated()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync("alice")).ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("alice@example.com")).ReturnsAsync((User?)null);
        var created = MakeUser();
        _userRepo.Setup(r => r.CreateAsync(It.IsAny<User>())).ReturnsAsync(created);

        var result = await MakeController().CreateUser(
            new CreateUserRequest("alice", "alice@example.com", "password123", "Member"));

        result.Result.Should().BeOfType<CreatedAtActionResult>();
    }

    [Fact]
    public async Task CreateUser_DuplicateUsername_ReturnsConflict()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync("alice")).ReturnsAsync(MakeUser());

        var result = await MakeController().CreateUser(
            new CreateUserRequest("alice", "other@example.com", "pass", "Member"));

        result.Result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task CreateUser_DuplicateEmail_ReturnsConflict()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync("newuser")).ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync("alice@example.com")).ReturnsAsync(MakeUser());

        var result = await MakeController().CreateUser(
            new CreateUserRequest("newuser", "alice@example.com", "pass", "Member"));

        result.Result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task CreateUser_InvalidRole_ReturnsBadRequest()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);

        var result = await MakeController().CreateUser(
            new CreateUserRequest("alice", "alice@example.com", "pass", "SuperUser"));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateUser_AdminRole_CreatesAdminUser()
    {
        _userRepo.Setup(r => r.GetByUsernameAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
        _userRepo.Setup(r => r.GetByEmailAsync(It.IsAny<string>())).ReturnsAsync((User?)null);
        var created = MakeUser(role: UserRole.Admin);
        _userRepo.Setup(r => r.CreateAsync(It.IsAny<User>())).ReturnsAsync(created);

        var result = await MakeController().CreateUser(
            new CreateUserRequest("alice", "alice@example.com", "pass", "Admin"));

        result.Result.Should().BeOfType<CreatedAtActionResult>();
    }

    [Fact]
    public async Task UpdateUser_NotFound_ReturnsNotFound()
    {
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await MakeController().UpdateUser(Guid.NewGuid(), new UpdateUserRequest(null, null, null, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateUser_DuplicateUsername_ReturnsConflict()
    {
        var user = MakeUser("alice");
        var other = MakeUser("bob", "bob@example.com");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.GetByUsernameAsync("bob")).ReturnsAsync(other);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest("bob", null, null, null));

        result.Result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task UpdateUser_SameUsernameAsSelf_Succeeds()
    {
        var user = MakeUser("alice");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.GetByUsernameAsync("alice")).ReturnsAsync(user); // same user, same ID
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync(user);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest("alice", null, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task UpdateUser_DuplicateEmail_ReturnsConflict()
    {
        var user = MakeUser("alice");
        var other = MakeUser("bob", "bob@example.com");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.GetByEmailAsync("bob@example.com")).ReturnsAsync(other);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest(null, "bob@example.com", null, null));

        result.Result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task UpdateUser_SameEmailAsSelf_Succeeds()
    {
        var user = MakeUser("alice");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.GetByEmailAsync("alice@example.com")).ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync(user);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest(null, "alice@example.com", null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task UpdateUser_WithPassword_HashesNewPassword()
    {
        var user = MakeUser("alice");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync(user);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest(null, null, "newpass", null));

        result.Result.Should().BeOfType<OkObjectResult>();
        _userRepo.Verify(r => r.UpdateAsync(It.Is<User>(u =>
            BCrypt.Net.BCrypt.Verify("newpass", u.PasswordHash))), Times.Once);
    }

    [Fact]
    public async Task UpdateUser_InvalidRole_ReturnsBadRequest()
    {
        var user = MakeUser("alice");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest(null, null, null, "SuperUser"));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpdateUser_ValidRole_UpdatesRole()
    {
        var user = MakeUser("alice");
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.UpdateAsync(It.IsAny<User>())).ReturnsAsync(user);

        var result = await MakeController().UpdateUser(user.Id, new UpdateUserRequest(null, null, null, "Admin"));

        result.Result.Should().BeOfType<OkObjectResult>();
        _userRepo.Verify(r => r.UpdateAsync(It.Is<User>(u => u.Role == UserRole.Admin)), Times.Once);
    }

    [Fact]
    public async Task DeleteUser_ExistingUser_ReturnsNoContent()
    {
        var user = MakeUser();
        _userRepo.Setup(r => r.GetByIdAsync(user.Id)).ReturnsAsync(user);
        _userRepo.Setup(r => r.DeleteAsync(user.Id)).Returns(Task.CompletedTask);

        var result = await MakeController().DeleteUser(user.Id);

        result.Should().BeOfType<NoContentResult>();
    }

    [Fact]
    public async Task DeleteUser_NotFound_ReturnsNotFound()
    {
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await MakeController().DeleteUser(Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }
}

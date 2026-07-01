using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Moq;
using TravelExpenseTracker.API.Controllers;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Tests.Controllers;

public class VacationsControllerTests
{
    private readonly Mock<IVacationRepository> _vacRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IExpenseRepository> _expRepo = new();
    private readonly Mock<IExchangeRateService> _exRate = new();

    private VacationsController MakeController(Guid userId, bool isAdmin = false)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Role, isAdmin ? "Admin" : "Member"),
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var controller = new VacationsController(
            _vacRepo.Object, _userRepo.Object, _expRepo.Object, _exRate.Object);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
        };
        var urlHelper = new Mock<IUrlHelper>();
        urlHelper.Setup(u => u.Action(It.IsAny<UrlActionContext>())).Returns("/api/dummy");
        controller.Url = urlHelper.Object;
        return controller;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static User MakeUser(string username = "alice") => new()
    {
        Id = Guid.NewGuid(),
        Username = username,
        Email = $"{username}@example.com",
        PasswordHash = "hash",
        Role = UserRole.Member
    };

    private static Vacation MakeVacation(Guid creatorId, IEnumerable<(Guid userId, User user, decimal weight)>? participants = null)
    {
        var v = new Vacation
        {
            Id = Guid.NewGuid(),
            Name = "Trip",
            Description = null,
            BaseCurrency = "USD",
            StartDate = DateTime.UtcNow,
            EndDate = DateTime.UtcNow.AddDays(7),
            CreatedBy = creatorId,
            Creator = new User { Id = creatorId, Username = "creator", Email = "c@c.com" }
        };

        if (participants != null)
        {
            v.Participants = participants.Select(p => new VacationParticipant
            {
                VacationId = v.Id,
                UserId = p.userId,
                SplitWeight = p.weight,
                User = p.user
            }).ToList();
        }

        return v;
    }

    private static Expense MakeExpense(Guid vacationId, Guid paidByUserId, decimal amount = 100m,
        string currency = "USD", decimal amountInBase = 100m, IEnumerable<ExpenseSplit>? splits = null) => new()
    {
        Id = Guid.NewGuid(),
        VacationId = vacationId,
        PaidByUserId = paidByUserId,
        Amount = amount,
        Currency = currency,
        AmountInBaseCurrency = amountInBase,
        Description = "Test expense",
        Category = ExpenseCategory.Food,
        Date = DateTime.UtcNow,
        PaidBy = new User { Id = paidByUserId, Username = "payer" },
        Splits = splits?.ToList() ?? new List<ExpenseSplit>()
    };

    // ─── GetVacations ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetVacations_ReturnsUserVacations()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByUserIdAsync(userId)).ReturnsAsync(new[] { vacation });

        var result = await MakeController(userId).GetVacations();

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeAssignableTo<IEnumerable<VacationDto>>()
            .Which.Should().HaveCount(1);
    }

    // ─── CreateVacation ──────────────────────────────────────────────────────

    [Fact]
    public async Task CreateVacation_ReturnsCreated()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });

        _vacRepo.Setup(r => r.CreateAsync(It.IsAny<Vacation>())).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
        _vacRepo.Setup(r => r.AddParticipantAsync(It.IsAny<VacationParticipant>()))
            .ReturnsAsync(vacation.Participants.First());
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var request = new CreateVacationRequest("Trip", null, "usd",
            DateTime.UtcNow, DateTime.UtcNow.AddDays(7));
        var result = await MakeController(userId).CreateVacation(request);

        result.Result.Should().BeOfType<CreatedAtActionResult>();
    }

    [Fact]
    public async Task CreateVacation_UppercasesBaseCurrency()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        Vacation? capturedVacation = null;
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });

        _vacRepo.Setup(r => r.CreateAsync(It.IsAny<Vacation>()))
            .Callback<Vacation>(v => capturedVacation = v)
            .ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
        _vacRepo.Setup(r => r.AddParticipantAsync(It.IsAny<VacationParticipant>()))
            .ReturnsAsync(vacation.Participants.First());
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var request = new CreateVacationRequest("Trip", null, "eur",
            DateTime.UtcNow, DateTime.UtcNow.AddDays(7));
        await MakeController(userId).CreateVacation(request);

        capturedVacation!.BaseCurrency.Should().Be("EUR");
    }

    // ─── GetVacation ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetVacation_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).GetVacation(Guid.NewGuid());

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task GetVacation_NonParticipantNonAdmin_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).GetVacation(vacation.Id);

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetVacation_Admin_CanAccessAnyVacation()
    {
        var adminId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(adminId, isAdmin: true).GetVacation(vacation.Id);

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task GetVacation_Participant_ReturnsOk()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId).GetVacation(vacation.Id);

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    // ─── UpdateVacation ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateVacation_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).UpdateVacation(
            Guid.NewGuid(), new UpdateVacationRequest(null, null, null, null, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateVacation_NonCreatorNonAdmin_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).UpdateVacation(
            vacation.Id, new UpdateVacationRequest("NewName", null, null, null, null));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task UpdateVacation_Creator_UpdatesFields()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.UpdateAsync(It.IsAny<Vacation>())).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var newStart = DateTime.UtcNow.AddDays(1);
        var newEnd = DateTime.UtcNow.AddDays(8);
        var result = await MakeController(userId).UpdateVacation(
            vacation.Id, new UpdateVacationRequest("New Name", "Desc", "eur", newStart, newEnd));

        result.Result.Should().BeOfType<OkObjectResult>();
        vacation.Name.Should().Be("New Name");
        vacation.Description.Should().Be("Desc");
        vacation.BaseCurrency.Should().Be("EUR");
    }

    [Fact]
    public async Task UpdateVacation_Admin_CanUpdateAnyVacation()
    {
        var adminId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.UpdateAsync(It.IsAny<Vacation>())).ReturnsAsync(vacation);

        var result = await MakeController(adminId, isAdmin: true).UpdateVacation(
            vacation.Id, new UpdateVacationRequest(null, null, null, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    // ─── DeleteVacation ──────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteVacation_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid(), isAdmin: true).DeleteVacation(Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task DeleteVacation_Admin_ReturnsNoContent()
    {
        var adminId = Guid.NewGuid();
        var vacation = MakeVacation(adminId);
        _vacRepo.Setup(r => r.GetByIdAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.DeleteAsync(vacation.Id)).Returns(Task.CompletedTask);

        var result = await MakeController(adminId, isAdmin: true).DeleteVacation(vacation.Id);

        result.Should().BeOfType<NoContentResult>();
    }

    // ─── AddParticipant ──────────────────────────────────────────────────────

    [Fact]
    public async Task AddParticipant_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).AddParticipant(
            Guid.NewGuid(), new AddParticipantRequest(Guid.NewGuid(), 0.5m));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task AddParticipant_NonCreatorNonAdmin_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).AddParticipant(
            vacation.Id, new AddParticipantRequest(Guid.NewGuid(), 0.5m));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task AddParticipant_UserNotFound_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await MakeController(userId).AddParticipant(
            vacation.Id, new AddParticipantRequest(Guid.NewGuid(), 0.5m));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AddParticipant_AlreadyParticipant_ReturnsConflict()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, userId))
            .ReturnsAsync(vacation.Participants.First());

        var result = await MakeController(userId).AddParticipant(
            vacation.Id, new AddParticipantRequest(userId, 0.5m));

        result.Result.Should().BeOfType<ConflictObjectResult>();
    }

    [Fact]
    public async Task AddParticipant_InvalidWeight_Zero_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var newUser = MakeUser("bob");
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(newUser.Id)).ReturnsAsync(newUser);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, newUser.Id)).ReturnsAsync((VacationParticipant?)null);

        var result = await MakeController(userId).AddParticipant(
            vacation.Id, new AddParticipantRequest(newUser.Id, 0m));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AddParticipant_InvalidWeight_OverOne_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var newUser = MakeUser("bob");
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(newUser.Id)).ReturnsAsync(newUser);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, newUser.Id)).ReturnsAsync((VacationParticipant?)null);

        var result = await MakeController(userId).AddParticipant(
            vacation.Id, new AddParticipantRequest(newUser.Id, 1.5m));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task AddParticipant_ValidRequest_ReturnsOk()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var newUser = MakeUser("bob");
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var newParticipant = new VacationParticipant
        {
            VacationId = vacation.Id,
            UserId = newUser.Id,
            SplitWeight = 0.5m,
            User = newUser
        };

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(newUser.Id)).ReturnsAsync(newUser);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, newUser.Id)).ReturnsAsync((VacationParticipant?)null);
        _vacRepo.Setup(r => r.AddParticipantAsync(It.IsAny<VacationParticipant>())).ReturnsAsync(newParticipant);

        var result = await MakeController(userId).AddParticipant(
            vacation.Id, new AddParticipantRequest(newUser.Id, 0.5m));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    // ─── UpdateParticipant ───────────────────────────────────────────────────

    [Fact]
    public async Task UpdateParticipant_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).UpdateParticipant(
            Guid.NewGuid(), Guid.NewGuid(), new UpdateParticipantRequest(0.5m));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateParticipant_NonCreatorNonAdmin_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).UpdateParticipant(
            vacation.Id, otherUserId, new UpdateParticipantRequest(0.5m));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task UpdateParticipant_InvalidWeight_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId).UpdateParticipant(
            vacation.Id, userId, new UpdateParticipantRequest(0m));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpdateParticipant_ParticipantNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, It.IsAny<Guid>()))
            .ReturnsAsync((VacationParticipant?)null);

        var result = await MakeController(userId).UpdateParticipant(
            vacation.Id, Guid.NewGuid(), new UpdateParticipantRequest(0.5m));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateParticipant_Valid_ReturnsOk()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var participant = vacation.Participants.First();
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, userId)).ReturnsAsync(participant);
        _vacRepo.Setup(r => r.UpdateParticipantAsync(It.IsAny<VacationParticipant>())).ReturnsAsync(participant);

        var result = await MakeController(userId).UpdateParticipant(
            vacation.Id, userId, new UpdateParticipantRequest(0.8m));

        result.Result.Should().BeOfType<OkObjectResult>();
        participant.SplitWeight.Should().Be(0.8m);
    }

    [Fact]
    public async Task UpdateParticipant_WeightOverOne_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId).UpdateParticipant(
            vacation.Id, userId, new UpdateParticipantRequest(1.5m));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    // ─── RemoveParticipant ───────────────────────────────────────────────────

    [Fact]
    public async Task RemoveParticipant_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).RemoveParticipant(Guid.NewGuid(), Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task RemoveParticipant_NonCreatorNonAdmin_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).RemoveParticipant(vacation.Id, otherUserId);

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task RemoveParticipant_ParticipantNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, It.IsAny<Guid>()))
            .ReturnsAsync((VacationParticipant?)null);

        var result = await MakeController(userId).RemoveParticipant(vacation.Id, Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task RemoveParticipant_Valid_ReturnsNoContent()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var participant = vacation.Participants.First();
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _vacRepo.Setup(r => r.GetParticipantAsync(vacation.Id, userId)).ReturnsAsync(participant);
        _vacRepo.Setup(r => r.RemoveParticipantAsync(vacation.Id, userId)).Returns(Task.CompletedTask);

        var result = await MakeController(userId).RemoveParticipant(vacation.Id, userId);

        result.Should().BeOfType<NoContentResult>();
    }

    // ─── GetExpenses ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetExpenses_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).GetExpenses(Guid.NewGuid());

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task GetExpenses_NonParticipant_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).GetExpenses(vacation.Id);

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetExpenses_Participant_ReturnsExpenses()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(userId).GetExpenses(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeAssignableTo<IEnumerable<ExpenseDto>>()
            .Which.Should().HaveCount(1);
    }

    [Fact]
    public async Task GetExpenses_ExpenseWithCustomSplits_MapsCorrectly()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var splits = new List<ExpenseSplit>
        {
            new() { ExpenseId = Guid.NewGuid(), UserId = userId, Weight = 1.0m, User = user }
        };
        var expense = MakeExpense(vacation.Id, userId, splits: splits);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(userId).GetExpenses(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var dtos = ok.Value.Should().BeAssignableTo<IEnumerable<ExpenseDto>>().Subject.ToList();
        dtos[0].IsSplitCustom.Should().BeTrue();
    }

    // ─── CreateExpense ───────────────────────────────────────────────────────

    [Fact]
    public async Task CreateExpense_VacationNotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).CreateExpense(Guid.NewGuid(),
            new CreateExpenseRequest(Guid.NewGuid(), 100m, "USD", "Test", "Food", DateTime.UtcNow, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task CreateExpense_NonParticipant_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "Food", DateTime.UtcNow, null));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task CreateExpense_PaidByUserNotFound_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(Guid.NewGuid(), 100m, "USD", "Test", "Food", DateTime.UtcNow, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateExpense_InvalidCategory_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "InvalidCategory", DateTime.UtcNow, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateExpense_InvalidSplit_NonParticipant_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

        var splits = new List<ExpenseSplitItem>
        {
            new(Guid.NewGuid(), 1.0m) // non-participant
        };

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "Food", DateTime.UtcNow, splits));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateExpense_InvalidSplit_Duplicate_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

        var splits = new List<ExpenseSplitItem>
        {
            new(userId, 0.5m),
            new(userId, 0.5m) // duplicate
        };

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "Food", DateTime.UtcNow, splits));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateExpense_InvalidSplit_SumNotOne_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);

        var splits = new List<ExpenseSplitItem>
        {
            new(userId, 0.6m) // sum != 1
        };

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "Food", DateTime.UtcNow, splits));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateExpense_WithValidSplit_ReturnsCreated()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
        _exRate.Setup(r => r.ConvertAsync(100m, "USD", "USD")).ReturnsAsync(100m);
        _expRepo.Setup(r => r.CreateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);
        _expRepo.Setup(r => r.SetSplitAsync(expense.Id, It.IsAny<IEnumerable<ExpenseSplit>>()))
            .Returns(Task.CompletedTask);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var splits = new List<ExpenseSplitItem> { new(userId, 1.0m) };

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 100m, "USD", "Test", "Food", DateTime.UtcNow, splits));

        result.Result.Should().BeOfType<CreatedAtActionResult>();
    }

    [Fact]
    public async Task CreateExpense_NoSplit_ReturnsCreated()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _userRepo.Setup(r => r.GetByIdAsync(userId)).ReturnsAsync(user);
        _exRate.Setup(r => r.ConvertAsync(50m, "EUR", "USD")).ReturnsAsync(55m);
        _expRepo.Setup(r => r.CreateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var result = await MakeController(userId).CreateExpense(vacation.Id,
            new CreateExpenseRequest(userId, 50m, "EUR", "Hotel", "Accommodation", DateTime.UtcNow, null));

        result.Result.Should().BeOfType<CreatedAtActionResult>();
    }

    // ─── UpdateExpense ───────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateExpense_VacationNotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).UpdateExpense(
            Guid.NewGuid(), Guid.NewGuid(),
            new UpdateExpenseRequest(null, null, null, null, null, null, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateExpense_NonParticipant_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).UpdateExpense(
            vacation.Id, Guid.NewGuid(),
            new UpdateExpenseRequest(null, null, null, null, null, null, null));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task UpdateExpense_ExpenseNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Expense?)null);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, Guid.NewGuid(),
            new UpdateExpenseRequest(null, null, null, null, null, null, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateExpense_ExpenseBelongsToDifferentVacation_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(Guid.NewGuid(), userId); // different vacationId
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, null, null, null, null));

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task UpdateExpense_InvalidSplit_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var splits = new List<ExpenseSplitItem> { new(Guid.NewGuid(), 1.0m) }; // non-participant

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, null, null, null, splits));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpdateExpense_PaidByUserNotFound_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _userRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((User?)null);

        var newPaidById = Guid.NewGuid();
        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(newPaidById, null, null, null, null, null, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpdateExpense_InvalidCategory_ReturnsBadRequest()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, null, "BadCategory", null, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task UpdateExpense_WithAmountChange_RecalculatesBase()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId, 100m, "USD", 100m);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _exRate.Setup(r => r.ConvertAsync(200m, "USD", "USD")).ReturnsAsync(200m);
        _expRepo.Setup(r => r.UpdateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, 200m, null, null, null, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
        _exRate.Verify(r => r.ConvertAsync(200m, "USD", "USD"), Times.Once);
    }

    [Fact]
    public async Task UpdateExpense_WithCurrencyChange_RecalculatesBase()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId, 100m, "USD", 100m);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _exRate.Setup(r => r.ConvertAsync(100m, "EUR", "USD")).ReturnsAsync(110m);
        _expRepo.Setup(r => r.UpdateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, "EUR", null, null, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
        _exRate.Verify(r => r.ConvertAsync(100m, "EUR", "USD"), Times.Once);
    }

    [Fact]
    public async Task UpdateExpense_ResetSplit_ClearsSplit()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _expRepo.Setup(r => r.UpdateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);
        _expRepo.Setup(r => r.ClearSplitAsync(expense.Id)).Returns(Task.CompletedTask);

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, null, null, null, null, ResetSplit: true));

        result.Result.Should().BeOfType<OkObjectResult>();
        _expRepo.Verify(r => r.ClearSplitAsync(expense.Id), Times.Once);
    }

    [Fact]
    public async Task UpdateExpense_WithNewSplit_SetsSplit()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _expRepo.Setup(r => r.UpdateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);
        _expRepo.Setup(r => r.SetSplitAsync(expense.Id, It.IsAny<IEnumerable<ExpenseSplit>>()))
            .Returns(Task.CompletedTask);

        var splits = new List<ExpenseSplitItem> { new(userId, 1.0m) };

        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, "Updated desc", null, null, splits));

        result.Result.Should().BeOfType<OkObjectResult>();
        _expRepo.Verify(r => r.SetSplitAsync(expense.Id, It.IsAny<IEnumerable<ExpenseSplit>>()), Times.Once);
    }

    [Fact]
    public async Task UpdateExpense_WithDescriptionAndDate_UpdatesFields()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _expRepo.Setup(r => r.UpdateAsync(It.IsAny<Expense>())).ReturnsAsync(expense);

        var newDate = DateTime.UtcNow.AddDays(-1);
        var result = await MakeController(userId).UpdateExpense(
            vacation.Id, expense.Id,
            new UpdateExpenseRequest(null, null, null, "New desc", "Transport", newDate, null));

        result.Result.Should().BeOfType<OkObjectResult>();
        expense.Description.Should().Be("New desc");
        expense.Category.Should().Be(ExpenseCategory.Transport);
        expense.Date.Should().Be(newDate);
    }

    // ─── DeleteExpense ───────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteExpense_VacationNotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).DeleteExpense(Guid.NewGuid(), Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task DeleteExpense_NonParticipant_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).DeleteExpense(vacation.Id, Guid.NewGuid());

        result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task DeleteExpense_ExpenseNotFound_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Expense?)null);

        var result = await MakeController(userId).DeleteExpense(vacation.Id, Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task DeleteExpense_ExpenseBelongsToDifferentVacation_ReturnsNotFound()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(Guid.NewGuid(), userId); // wrong vacation
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);

        var result = await MakeController(userId).DeleteExpense(vacation.Id, expense.Id);

        result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task DeleteExpense_Valid_ReturnsNoContent()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        var expense = MakeExpense(vacation.Id, userId);
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByIdAsync(expense.Id)).ReturnsAsync(expense);
        _expRepo.Setup(r => r.DeleteAsync(expense.Id)).Returns(Task.CompletedTask);

        var result = await MakeController(userId).DeleteExpense(vacation.Id, expense.Id);

        result.Should().BeOfType<NoContentResult>();
    }

    // ─── GetSummary ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetSummary_NotFound_ReturnsNotFound()
    {
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(It.IsAny<Guid>())).ReturnsAsync((Vacation?)null);

        var result = await MakeController(Guid.NewGuid()).GetSummary(Guid.NewGuid());

        result.Result.Should().BeOfType<NotFoundResult>();
    }

    [Fact]
    public async Task GetSummary_NonParticipant_ReturnsForbid()
    {
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);

        var result = await MakeController(userId, isAdmin: false).GetSummary(vacation.Id);

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task GetSummary_NoExpenses_ReturnZeroTotal()
    {
        var userId = Guid.NewGuid();
        var user = MakeUser();
        var vacation = MakeVacation(userId, new[] { (userId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(Array.Empty<Expense>());

        var result = await MakeController(userId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;
        summary.TotalExpenses.Should().Be(0m);
        summary.Transfers.Should().BeEmpty();
    }

    [Fact]
    public async Task GetSummary_EqualSplit_NoTransfersNeeded()
    {
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;
        var bob = MakeUser("bob");
        bob.Id = bobId;

        var vacation = MakeVacation(aliceId, new[]
        {
            (aliceId, alice, 0.5m),
            (bobId, bob, 0.5m)
        });

        // Each pays 50 — perfectly balanced
        var e1 = MakeExpense(vacation.Id, aliceId, 50m, "USD", 50m);
        var e2 = MakeExpense(vacation.Id, bobId, 50m, "USD", 50m);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { e1, e2 });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;
        summary.Transfers.Should().BeEmpty();
        summary.TotalExpenses.Should().Be(100m);
    }

    [Fact]
    public async Task GetSummary_UnbalancedDefault_ProducesTransfer()
    {
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;
        var bob = MakeUser("bob");
        bob.Id = bobId;

        var vacation = MakeVacation(aliceId, new[]
        {
            (aliceId, alice, 0.5m),
            (bobId, bob, 0.5m)
        });

        // Alice paid 100, Bob paid 0 — Bob owes Alice 50
        var expense = MakeExpense(vacation.Id, aliceId, 100m, "USD", 100m);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;
        summary.Transfers.Should().HaveCount(1);
        var transfer = summary.Transfers[0];
        transfer.FromUserId.Should().Be(bobId);
        transfer.ToUserId.Should().Be(aliceId);
        transfer.Amount.Should().Be(50m);
    }

    [Fact]
    public async Task GetSummary_CustomSplit_UsesCustomSplitWeights()
    {
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;
        var bob = MakeUser("bob");
        bob.Id = bobId;

        var vacation = MakeVacation(aliceId, new[]
        {
            (aliceId, alice, 0.5m),
            (bobId, bob, 0.5m)
        });

        // Expense with custom split: alice 80%, bob 20%
        var splits = new List<ExpenseSplit>
        {
            new() { UserId = aliceId, Weight = 0.8m },
            new() { UserId = bobId, Weight = 0.2m }
        };
        var expense = MakeExpense(vacation.Id, aliceId, 100m, "USD", 100m, splits);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;

        // Alice paid 100, fairShare = 80, balance = +20 (overpaid)
        // Bob paid 0, fairShare = 20, balance = -20 (underpaid) → owes Alice 20
        summary.Transfers.Should().HaveCount(1);
        summary.Transfers[0].Amount.Should().Be(20m);
    }

    [Fact]
    public async Task GetSummary_CustomSplitWithUnknownUser_IgnoresUnknownUser()
    {
        // Split has a userId that's not in the fairShares dict — should be ignored silently
        var aliceId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;

        var vacation = MakeVacation(aliceId, new[] { (aliceId, alice, 1.0m) });

        var unknownUserId = Guid.NewGuid();
        var splits = new List<ExpenseSplit>
        {
            new() { UserId = unknownUserId, Weight = 1.0m } // not a participant
        };
        var expense = MakeExpense(vacation.Id, aliceId, 100m, "USD", 100m, splits);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task GetSummary_TinyBalance_IgnoresTransferUnderThreshold()
    {
        // Trigger the `if (amount > 0.005m)` false branch
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;
        var bob = MakeUser("bob");
        bob.Id = bobId;

        var vacation = MakeVacation(aliceId, new[]
        {
            (aliceId, alice, 0.5m),
            (bobId, bob, 0.5m)
        });

        // Alice pays 0.009 — each owes 0.0045 which is < 0.005 → no transfer
        var expense = MakeExpense(vacation.Id, aliceId, 0.009m, "USD", 0.009m);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;
        summary.Transfers.Should().BeEmpty();
    }

    [Fact]
    public async Task GetSummary_MultipleDebtors_GreedySettlement()
    {
        // 3 participants: alice, bob, carol
        // alice pays 120, bob pays 0, carol pays 0
        // 1/3 each → alice overpaid 80, bob owes 40, carol owes 40
        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();
        var carolId = Guid.NewGuid();
        var alice = MakeUser("alice");
        alice.Id = aliceId;
        var bob = MakeUser("bob");
        bob.Id = bobId;
        var carol = MakeUser("carol");
        carol.Id = carolId;

        var vacation = MakeVacation(aliceId, new[]
        {
            (aliceId, alice, 1m / 3m),
            (bobId, bob, 1m / 3m),
            (carolId, carol, 1m / 3m)
        });

        var expense = MakeExpense(vacation.Id, aliceId, 120m, "USD", 120m);

        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(new[] { expense });

        var result = await MakeController(aliceId).GetSummary(vacation.Id);

        var ok = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var summary = ok.Value.Should().BeOfType<SummaryDto>().Subject;
        summary.Transfers.Should().HaveCount(2);
        summary.Transfers.Should().AllSatisfy(t => t.ToUserId.Should().Be(aliceId));
    }

    [Fact]
    public async Task GetSummary_Admin_CanAccessAnyVacationSummary()
    {
        var adminId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var user = MakeUser("other");
        user.Id = otherUserId;
        var vacation = MakeVacation(otherUserId, new[] { (otherUserId, user, 1.0m) });
        _vacRepo.Setup(r => r.GetByIdWithDetailsAsync(vacation.Id)).ReturnsAsync(vacation);
        _expRepo.Setup(r => r.GetByVacationIdAsync(vacation.Id)).ReturnsAsync(Array.Empty<Expense>());

        var result = await MakeController(adminId, isAdmin: true).GetSummary(vacation.Id);

        result.Result.Should().BeOfType<OkObjectResult>();
    }
}

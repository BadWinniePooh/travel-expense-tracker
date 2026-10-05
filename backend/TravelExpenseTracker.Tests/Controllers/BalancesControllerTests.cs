using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;
using TravelExpenseTracker.API.Controllers;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Tests.Controllers;

public class BalancesControllerTests
{
    private readonly Mock<IVacationRepository> _vacRepo = new();
    private readonly Mock<IExpenseRepository> _expRepo = new();
    private readonly Mock<IRepaymentRepository> _repayRepo = new();
    private readonly Mock<IUserRepository> _userRepo = new();
    private readonly Mock<IExchangeRateService> _exRate = new();

    private readonly User _anna = MakeUser("anna");
    private readonly User _ben = MakeUser("ben");
    private readonly User _carl = MakeUser("carl");

    public BalancesControllerTests()
    {
        // Identity rate unless a test overrides it.
        _exRate.Setup(r => r.GetHistoricalRateAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .ReturnsAsync(1m);
        _repayRepo.Setup(r => r.GetAllAsync()).ReturnsAsync(new List<Repayment>());
        _repayRepo.Setup(r => r.GetByUserIdAsync(It.IsAny<Guid>())).ReturnsAsync(new List<Repayment>());
    }

    private BalancesController MakeController(Guid userId, bool isAdmin = false, string currency = "EUR")
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Role, isAdmin ? "Admin" : "Member"),
        };
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Dashboard:Currency"] = currency })
            .Build();
        var controller = new BalancesController(
            _vacRepo.Object, _expRepo.Object, _repayRepo.Object, _userRepo.Object, _exRate.Object, config);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) }
        };
        return controller;
    }

    private static User MakeUser(string name) => new()
    {
        Id = Guid.NewGuid(),
        Username = name,
        Email = $"{name}@example.com",
        PasswordHash = "hash"
    };

    private Vacation MakeVacation(string baseCurrency, params User[] users) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Trip",
        BaseCurrency = baseCurrency,
        Participants = users.Select(u => new VacationParticipant
        {
            UserId = u.Id,
            User = u,
            SplitWeight = 1m / users.Length
        }).ToList()
    };

    private static Expense MakeExpense(Vacation v, User paidBy, decimal amountInBase) => new()
    {
        Id = Guid.NewGuid(),
        VacationId = v.Id,
        PaidByUserId = paidBy.Id,
        PaidBy = paidBy,
        Amount = amountInBase,
        Currency = v.BaseCurrency,
        AmountInBaseCurrency = amountInBase,
        Date = new DateTime(2024, 5, 1, 0, 0, 0, DateTimeKind.Utc)
    };

    private void SetupVacation(Vacation v, params Expense[] expenses)
    {
        _vacRepo.Setup(r => r.GetByUserIdAsync(It.IsAny<Guid>())).ReturnsAsync(new List<Vacation> { v });
        _vacRepo.Setup(r => r.GetAllWithParticipantsAsync()).ReturnsAsync(new List<Vacation> { v });
        _expRepo.Setup(r => r.GetByVacationIdAsync(v.Id)).ReturnsAsync(expenses.ToList());
    }

    private static BalancesDto Dto(ActionResult<BalancesDto> result) =>
        result.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<BalancesDto>().Subject;

    [Fact]
    public async Task GetBalances_SplitsExpenseEquallyAmongParticipants()
    {
        var v = MakeVacation("EUR", _anna, _ben);
        SetupVacation(v, MakeExpense(v, _anna, 100m)); // Anna paid 100, Ben owes 50

        var dto = Dto(await MakeController(_anna.Id).GetBalances());

        dto.Currency.Should().Be("EUR");
        dto.Pairs.Should().ContainSingle();
        dto.Pairs[0].DebtorUserId.Should().Be(_ben.Id);
        dto.Pairs[0].CreditorUserId.Should().Be(_anna.Id);
        dto.Pairs[0].Amount.Should().Be(50m);
    }

    [Fact]
    public async Task GetBalances_RepaymentReducesDebt()
    {
        var v = MakeVacation("EUR", _anna, _ben);
        SetupVacation(v, MakeExpense(v, _anna, 100m));
        _repayRepo.Setup(r => r.GetByUserIdAsync(_anna.Id)).ReturnsAsync(new List<Repayment>
        {
            new() { FromUserId = _ben.Id, FromUser = _ben, ToUserId = _anna.Id, ToUser = _anna, Amount = 20m, Currency = "EUR", Date = DateTime.UtcNow }
        });

        var dto = Dto(await MakeController(_anna.Id).GetBalances());

        dto.Pairs.Should().ContainSingle().Which.Amount.Should().Be(30m);
        dto.Repayments.Should().ContainSingle();
    }

    [Fact]
    public async Task GetBalances_RepaymentExceedingDebt_FlipsDirection()
    {
        var v = MakeVacation("EUR", _anna, _ben);
        SetupVacation(v, MakeExpense(v, _anna, 100m));
        _repayRepo.Setup(r => r.GetByUserIdAsync(_anna.Id)).ReturnsAsync(new List<Repayment>
        {
            new() { FromUserId = _ben.Id, FromUser = _ben, ToUserId = _anna.Id, ToUser = _anna, Amount = 80m, Currency = "EUR", Date = DateTime.UtcNow }
        });

        var dto = Dto(await MakeController(_anna.Id).GetBalances());

        dto.Pairs.Should().ContainSingle();
        dto.Pairs[0].DebtorUserId.Should().Be(_anna.Id);
        dto.Pairs[0].Amount.Should().Be(30m);
    }

    [Fact]
    public async Task GetBalances_ConvertsVacationCurrencyAtExpenseDateRate()
    {
        var v = MakeVacation("USD", _anna, _ben);
        var expense = MakeExpense(v, _anna, 100m);
        SetupVacation(v, expense);
        _exRate.Setup(r => r.GetHistoricalRateAsync("USD", "EUR", expense.Date)).ReturnsAsync(0.9m);

        var dto = Dto(await MakeController(_anna.Id).GetBalances());

        dto.Pairs.Should().ContainSingle().Which.Amount.Should().Be(45m); // 100 USD * 0.9 / 2
    }

    [Fact]
    public async Task GetBalances_Member_OnlySeesOwnPairs()
    {
        var v = MakeVacation("EUR", _anna, _ben, _carl);
        SetupVacation(v, MakeExpense(v, _ben, 90m)); // Anna and Carl each owe Ben 30

        var dto = Dto(await MakeController(_anna.Id).GetBalances());

        dto.Pairs.Should().ContainSingle();
        dto.Pairs[0].DebtorUserId.Should().Be(_anna.Id);
    }

    [Fact]
    public async Task GetBalances_Admin_SeesAllPairs()
    {
        var v = MakeVacation("EUR", _anna, _ben, _carl);
        SetupVacation(v, MakeExpense(v, _ben, 90m));

        var dto = Dto(await MakeController(Guid.NewGuid(), isAdmin: true).GetBalances());

        dto.Pairs.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetBalances_ExchangeRateFailure_Returns503()
    {
        var v = MakeVacation("USD", _anna, _ben);
        SetupVacation(v, MakeExpense(v, _anna, 100m));
        _exRate.Setup(r => r.GetHistoricalRateAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .ThrowsAsync(new HttpRequestException("boom"));

        var result = await MakeController(_anna.Id).GetBalances();

        result.Result.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(503);
    }

    // ─── Repayments ──────────────────────────────────────────────────────────

    private void SetupUsers()
    {
        foreach (var u in new[] { _anna, _ben, _carl })
            _userRepo.Setup(r => r.GetByIdAsync(u.Id)).ReturnsAsync(u);
        _repayRepo.Setup(r => r.CreateAsync(It.IsAny<Repayment>())).ReturnsAsync((Repayment r) => r);
    }

    [Fact]
    public async Task CreateRepayment_PayerCanRecord()
    {
        SetupUsers();

        var result = await MakeController(_ben.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _anna.Id, 25.555m, " thanks ", null));

        var dto = result.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<RepaymentDto>().Subject;
        dto.Amount.Should().Be(25.56m);
        dto.Currency.Should().Be("EUR");
        dto.Note.Should().Be("thanks");
        dto.CreatedByUserId.Should().Be(_ben.Id);
    }

    [Fact]
    public async Task CreateRepayment_ReceiverCanRecord()
    {
        SetupUsers();

        var result = await MakeController(_anna.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _anna.Id, 10m, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Fact]
    public async Task CreateRepayment_UninvolvedMember_IsForbidden()
    {
        SetupUsers();

        var result = await MakeController(_carl.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _anna.Id, 10m, null, null));

        result.Result.Should().BeOfType<ForbidResult>();
    }

    [Fact]
    public async Task CreateRepayment_Admin_CanRecordForOthers()
    {
        SetupUsers();

        var result = await MakeController(Guid.NewGuid(), isAdmin: true).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _anna.Id, 10m, null, null));

        result.Result.Should().BeOfType<OkObjectResult>();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(0.004)]
    public async Task CreateRepayment_NonPositiveAmount_IsBadRequest(double amount)
    {
        SetupUsers();

        var result = await MakeController(_ben.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _anna.Id, (decimal)amount, null, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateRepayment_SamePayerAndReceiver_IsBadRequest()
    {
        SetupUsers();

        var result = await MakeController(_ben.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, _ben.Id, 10m, null, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task CreateRepayment_UnknownUser_IsBadRequest()
    {
        SetupUsers();

        var result = await MakeController(_ben.Id).CreateRepayment(
            new CreateRepaymentRequest(_ben.Id, Guid.NewGuid(), 10m, null, null));

        result.Result.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task DeleteRepayment_Creator_CanDelete()
    {
        var repayment = new Repayment { Id = Guid.NewGuid(), CreatedByUserId = _ben.Id };
        _repayRepo.Setup(r => r.GetByIdAsync(repayment.Id)).ReturnsAsync(repayment);

        var result = await MakeController(_ben.Id).DeleteRepayment(repayment.Id);

        result.Should().BeOfType<NoContentResult>();
        _repayRepo.Verify(r => r.DeleteAsync(repayment.Id), Times.Once);
    }

    [Fact]
    public async Task DeleteRepayment_OtherMember_IsForbidden()
    {
        var repayment = new Repayment { Id = Guid.NewGuid(), CreatedByUserId = _ben.Id };
        _repayRepo.Setup(r => r.GetByIdAsync(repayment.Id)).ReturnsAsync(repayment);

        var result = await MakeController(_anna.Id).DeleteRepayment(repayment.Id);

        result.Should().BeOfType<ForbidResult>();
        _repayRepo.Verify(r => r.DeleteAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task DeleteRepayment_Admin_CanDeleteAny()
    {
        var repayment = new Repayment { Id = Guid.NewGuid(), CreatedByUserId = _ben.Id };
        _repayRepo.Setup(r => r.GetByIdAsync(repayment.Id)).ReturnsAsync(repayment);

        var result = await MakeController(Guid.NewGuid(), isAdmin: true).DeleteRepayment(repayment.Id);

        result.Should().BeOfType<NoContentResult>();
    }

    [Fact]
    public async Task DeleteRepayment_Missing_ReturnsNotFound()
    {
        _repayRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync((Repayment?)null);

        var result = await MakeController(_anna.Id).DeleteRepayment(Guid.NewGuid());

        result.Should().BeOfType<NotFoundResult>();
    }
}

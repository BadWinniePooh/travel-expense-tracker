using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.API.Services;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.API.Controllers;

[ApiController]
[Route("api/balances")]
[Authorize]
public class BalancesController : ControllerBase
{
    private readonly IVacationRepository _vacationRepository;
    private readonly IExpenseRepository _expenseRepository;
    private readonly IRepaymentRepository _repaymentRepository;
    private readonly IUserRepository _userRepository;
    private readonly IExchangeRateService _exchangeRateService;
    private readonly string _currency;

    public BalancesController(
        IVacationRepository vacationRepository,
        IExpenseRepository expenseRepository,
        IRepaymentRepository repaymentRepository,
        IUserRepository userRepository,
        IExchangeRateService exchangeRateService,
        IConfiguration configuration)
    {
        _vacationRepository = vacationRepository;
        _expenseRepository = expenseRepository;
        _repaymentRepository = repaymentRepository;
        _userRepository = userRepository;
        _exchangeRateService = exchangeRateService;
        _currency = (configuration["Dashboard:Currency"] ?? "EUR").Trim().ToUpperInvariant();
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    // Pairwise net balances across all vacations, in the configured dashboard currency.
    // Members only see pairs involving themselves; admins see everyone.
    [HttpGet]
    public async Task<ActionResult<BalancesDto>> GetBalances()
    {
        var me = CurrentUserId;
        var ledger = new PairLedger();

        var vacations = IsAdmin
            ? await _vacationRepository.GetAllWithParticipantsAsync()
            : await _vacationRepository.GetByUserIdAsync(me);

        var repayments = (IsAdmin
            ? await _repaymentRepository.GetAllAsync()
            : await _repaymentRepository.GetByUserIdAsync(me)).ToList();

        // Historical rates are immutable; look each (from, date) pair up once per request.
        var rates = new Dictionary<(string From, DateTime Day), decimal>();
        async Task<decimal> RateAsync(string from, DateTime date)
        {
            var key = (from.ToUpperInvariant(), date.Date);
            if (!rates.TryGetValue(key, out var rate))
            {
                rate = await _exchangeRateService.GetHistoricalRateAsync(from, _currency, date);
                rates[key] = rate;
            }
            return rate;
        }

        try
        {
            foreach (var vacation in vacations)
            {
                var participants = vacation.Participants.ToList();
                foreach (var p in participants)
                    ledger.RegisterName(p.UserId, p.User?.Username ?? string.Empty);

                var expenses = await _expenseRepository.GetByVacationIdAsync(vacation.Id);
                foreach (var e in expenses)
                {
                    if (e.PaidBy != null) ledger.RegisterName(e.PaidByUserId, e.PaidBy.Username);

                    // Convert at the rate of the expense date so totals don't drift day to day.
                    var amount = e.AmountInBaseCurrency * await RateAsync(vacation.BaseCurrency, e.Date);

                    // Same share rules as the per-vacation summary: a custom split if present,
                    // otherwise the participants' current split weights.
                    if (e.Splits.Count > 0)
                    {
                        foreach (var s in e.Splits.Where(s => participants.Any(p => p.UserId == s.UserId)))
                            ledger.AddDebt(s.UserId, e.PaidByUserId, amount * s.Weight);
                    }
                    else
                    {
                        foreach (var p in participants)
                            ledger.AddDebt(p.UserId, e.PaidByUserId, amount * p.SplitWeight);
                    }
                }
            }

            foreach (var r in repayments)
            {
                ledger.RegisterName(r.FromUserId, r.FromUser?.Username ?? string.Empty);
                ledger.RegisterName(r.ToUserId, r.ToUser?.Username ?? string.Empty);

                var amount = r.Amount * await RateAsync(r.Currency, r.Date);
                ledger.AddDebt(r.FromUserId, r.ToUserId, -amount);
            }
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = "Exchange rates are currently unavailable. Please try again later." });
        }

        return Ok(new BalancesDto(
            _currency,
            ledger.ToPairs(IsAdmin ? null : me),
            repayments.Select(MapToDto).ToList()));
    }

    [HttpPost("repayments")]
    public async Task<ActionResult<RepaymentDto>> CreateRepayment([FromBody] CreateRepaymentRequest request)
    {
        var me = CurrentUserId;

        if (request.FromUserId == request.ToUserId)
            return BadRequest(new { message = "Payer and receiver must be different people" });

        if (!IsAdmin && request.FromUserId != me && request.ToUserId != me)
            return Forbid();

        var amount = Math.Round(request.Amount, 2);
        if (amount <= 0)
            return BadRequest(new { message = "Amount must be greater than zero" });

        if (request.Note is { Length: > 500 })
            return BadRequest(new { message = "Note must be at most 500 characters" });

        var from = await _userRepository.GetByIdAsync(request.FromUserId);
        var to = await _userRepository.GetByIdAsync(request.ToUserId);
        if (from == null || to == null)
            return BadRequest(new { message = "User not found" });

        var date = request.Date.HasValue
            ? DateTime.SpecifyKind(request.Date.Value.ToUniversalTime(), DateTimeKind.Utc)
            : DateTime.UtcNow;

        var repayment = new Repayment
        {
            FromUserId = from.Id,
            ToUserId = to.Id,
            Amount = amount,
            Currency = _currency,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            Date = date,
            CreatedByUserId = me,
            FromUser = from,
            ToUser = to
        };

        var created = await _repaymentRepository.CreateAsync(repayment);
        return Ok(MapToDto(created));
    }

    [HttpDelete("repayments/{id:guid}")]
    public async Task<IActionResult> DeleteRepayment(Guid id)
    {
        var repayment = await _repaymentRepository.GetByIdAsync(id);
        if (repayment == null) return NotFound();

        if (!IsAdmin && repayment.CreatedByUserId != CurrentUserId)
            return Forbid();

        await _repaymentRepository.DeleteAsync(id);
        return NoContent();
    }

    private static RepaymentDto MapToDto(Repayment r) => new(
        r.Id,
        r.FromUserId, r.FromUser?.Username ?? string.Empty,
        r.ToUserId, r.ToUser?.Username ?? string.Empty,
        r.Amount, r.Currency, r.Note, r.Date,
        r.CreatedByUserId, r.CreatedAt);
}

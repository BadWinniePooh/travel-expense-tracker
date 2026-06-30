using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.API.Controllers;

[ApiController]
[Route("api/vacations")]
[Authorize]
public class VacationsController : ControllerBase
{
    private readonly IVacationRepository _vacationRepository;
    private readonly IUserRepository _userRepository;
    private readonly IExpenseRepository _expenseRepository;
    private readonly IExchangeRateService _exchangeRateService;

    public VacationsController(
        IVacationRepository vacationRepository,
        IUserRepository userRepository,
        IExpenseRepository expenseRepository,
        IExchangeRateService exchangeRateService)
    {
        _vacationRepository = vacationRepository;
        _userRepository = userRepository;
        _expenseRepository = expenseRepository;
        _exchangeRateService = exchangeRateService;
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    [HttpGet]
    public async Task<ActionResult<IEnumerable<VacationDto>>> GetVacations()
    {
        var vacations = await _vacationRepository.GetByUserIdAsync(CurrentUserId);
        return Ok(vacations.Select(MapToDto));
    }

    [HttpPost]
    public async Task<ActionResult<VacationDto>> CreateVacation([FromBody] CreateVacationRequest request)
    {
        var userId = CurrentUserId;
        var vacation = new Vacation
        {
            Name = request.Name,
            Description = request.Description,
            BaseCurrency = request.BaseCurrency.ToUpperInvariant(),
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            CreatedBy = userId
        };

        var created = await _vacationRepository.CreateAsync(vacation);

        // Add creator as participant
        var creator = await _userRepository.GetByIdAsync(userId);
        var participant = new VacationParticipant
        {
            VacationId = created.Id,
            UserId = userId,
            SplitWeight = 1.0m
        };
        await _vacationRepository.AddParticipantAsync(participant);

        var detailed = await _vacationRepository.GetByIdWithDetailsAsync(created.Id);
        return CreatedAtAction(nameof(GetVacation), new { id = created.Id }, MapToDto(detailed!));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<VacationDto>> GetVacation(Guid id)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        return Ok(MapToDto(vacation));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<VacationDto>> UpdateVacation(Guid id, [FromBody] UpdateVacationRequest request)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && vacation.CreatedBy != CurrentUserId)
            return Forbid();

        if (request.Name != null) vacation.Name = request.Name;
        if (request.Description != null) vacation.Description = request.Description;
        if (request.BaseCurrency != null) vacation.BaseCurrency = request.BaseCurrency.ToUpperInvariant();
        if (request.StartDate.HasValue) vacation.StartDate = request.StartDate.Value;
        if (request.EndDate.HasValue) vacation.EndDate = request.EndDate.Value;

        var updated = await _vacationRepository.UpdateAsync(vacation);
        var detailed = await _vacationRepository.GetByIdWithDetailsAsync(updated.Id);
        return Ok(MapToDto(detailed!));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteVacation(Guid id)
    {
        var vacation = await _vacationRepository.GetByIdAsync(id);
        if (vacation == null) return NotFound();
        await _vacationRepository.DeleteAsync(id);
        return NoContent();
    }

    // Participants
    [HttpPost("{id:guid}/participants")]
    public async Task<ActionResult<ParticipantDto>> AddParticipant(Guid id, [FromBody] AddParticipantRequest request)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && vacation.CreatedBy != CurrentUserId)
            return Forbid();

        var user = await _userRepository.GetByIdAsync(request.UserId);
        if (user == null) return BadRequest(new { message = "User not found" });

        var existing = await _vacationRepository.GetParticipantAsync(id, request.UserId);
        if (existing != null) return Conflict(new { message = "User is already a participant" });

        if (request.SplitWeight <= 0 || request.SplitWeight > 1)
            return BadRequest(new { message = "Split weight must be between 0 and 1" });

        var participant = new VacationParticipant
        {
            VacationId = id,
            UserId = request.UserId,
            SplitWeight = request.SplitWeight
        };

        var created = await _vacationRepository.AddParticipantAsync(participant);
        return Ok(new ParticipantDto(user.Id, user.Username, user.Email, created.SplitWeight));
    }

    [HttpPut("{id:guid}/participants/{userId:guid}")]
    public async Task<ActionResult<ParticipantDto>> UpdateParticipant(Guid id, Guid userId, [FromBody] UpdateParticipantRequest request)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && vacation.CreatedBy != CurrentUserId)
            return Forbid();

        if (request.SplitWeight <= 0 || request.SplitWeight > 1)
            return BadRequest(new { message = "Split weight must be between 0 and 1" });

        var participant = await _vacationRepository.GetParticipantAsync(id, userId);
        if (participant == null) return NotFound();

        participant.SplitWeight = request.SplitWeight;
        var updated = await _vacationRepository.UpdateParticipantAsync(participant);

        return Ok(new ParticipantDto(participant.User.Id, participant.User.Username, participant.User.Email, updated.SplitWeight));
    }

    [HttpDelete("{id:guid}/participants/{userId:guid}")]
    public async Task<IActionResult> RemoveParticipant(Guid id, Guid userId)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && vacation.CreatedBy != CurrentUserId)
            return Forbid();

        var participant = await _vacationRepository.GetParticipantAsync(id, userId);
        if (participant == null) return NotFound();

        await _vacationRepository.RemoveParticipantAsync(id, userId);
        return NoContent();
    }

    // Expenses
    [HttpGet("{id:guid}/expenses")]
    public async Task<ActionResult<IEnumerable<ExpenseDto>>> GetExpenses(Guid id)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        var expenses = await _expenseRepository.GetByVacationIdAsync(id);
        return Ok(expenses.Select(e => MapExpenseToDto(e, vacation)));
    }

    [HttpPost("{id:guid}/expenses")]
    public async Task<ActionResult<ExpenseDto>> CreateExpense(Guid id, [FromBody] CreateExpenseRequest request)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        var paidBy = await _userRepository.GetByIdAsync(request.PaidByUserId);
        if (paidBy == null) return BadRequest(new { message = "PaidByUser not found" });

        if (!Enum.TryParse<ExpenseCategory>(request.Category, true, out var category))
            return BadRequest(new { message = "Invalid expense category" });

        if (request.Splits != null && !TryValidateSplits(vacation, request.Splits, out var splitError))
            return BadRequest(new { message = splitError });

        var amountInBase = await _exchangeRateService.ConvertAsync(request.Amount, request.Currency, vacation.BaseCurrency);

        var expense = new Expense
        {
            VacationId = id,
            PaidByUserId = request.PaidByUserId,
            Amount = request.Amount,
            Currency = request.Currency.ToUpperInvariant(),
            AmountInBaseCurrency = amountInBase,
            Description = request.Description,
            Category = category,
            Date = request.Date
        };

        var created = await _expenseRepository.CreateAsync(expense);

        if (request.Splits != null)
        {
            await _expenseRepository.SetSplitAsync(created.Id, request.Splits.Select(s => new ExpenseSplit
            {
                ExpenseId = created.Id,
                UserId = s.UserId,
                Weight = s.Weight
            }));
        }

        var withUser = await _expenseRepository.GetByIdAsync(created.Id);
        return CreatedAtAction(nameof(GetExpenses), new { id }, MapExpenseToDto(withUser!, vacation));
    }

    [HttpPut("{id:guid}/expenses/{expenseId:guid}")]
    public async Task<ActionResult<ExpenseDto>> UpdateExpense(Guid id, Guid expenseId, [FromBody] UpdateExpenseRequest request)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        var expense = await _expenseRepository.GetByIdAsync(expenseId);
        if (expense == null || expense.VacationId != id) return NotFound();

        if (request.Splits != null && !TryValidateSplits(vacation, request.Splits, out var splitError))
            return BadRequest(new { message = splitError });

        if (request.PaidByUserId.HasValue)
        {
            var paidBy = await _userRepository.GetByIdAsync(request.PaidByUserId.Value);
            if (paidBy == null) return BadRequest(new { message = "PaidByUser not found" });
            expense.PaidByUserId = request.PaidByUserId.Value;
        }

        if (request.Amount.HasValue || request.Currency != null)
        {
            var amount = request.Amount ?? expense.Amount;
            var currency = request.Currency?.ToUpperInvariant() ?? expense.Currency;
            expense.Amount = amount;
            expense.Currency = currency;
            expense.AmountInBaseCurrency = await _exchangeRateService.ConvertAsync(amount, currency, vacation.BaseCurrency);
        }

        if (request.Description != null) expense.Description = request.Description;
        if (request.Date.HasValue) expense.Date = request.Date.Value;

        if (request.Category != null)
        {
            if (!Enum.TryParse<ExpenseCategory>(request.Category, true, out var category))
                return BadRequest(new { message = "Invalid expense category" });
            expense.Category = category;
        }

        var updated = await _expenseRepository.UpdateAsync(expense);

        if (request.Splits != null)
        {
            await _expenseRepository.SetSplitAsync(expenseId, request.Splits.Select(s => new ExpenseSplit
            {
                ExpenseId = expenseId,
                UserId = s.UserId,
                Weight = s.Weight
            }));
        }
        else if (request.ResetSplit)
        {
            await _expenseRepository.ClearSplitAsync(expenseId);
        }

        var withSplits = await _expenseRepository.GetByIdAsync(expenseId);
        return Ok(MapExpenseToDto(withSplits!, vacation));
    }

    [HttpDelete("{id:guid}/expenses/{expenseId:guid}")]
    public async Task<IActionResult> DeleteExpense(Guid id, Guid expenseId)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        var expense = await _expenseRepository.GetByIdAsync(expenseId);
        if (expense == null || expense.VacationId != id) return NotFound();

        await _expenseRepository.DeleteAsync(expenseId);
        return NoContent();
    }

    // Summary / Settlement
    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<SummaryDto>> GetSummary(Guid id)
    {
        var vacation = await _vacationRepository.GetByIdWithDetailsAsync(id);
        if (vacation == null) return NotFound();

        if (!IsAdmin && !vacation.Participants.Any(p => p.UserId == CurrentUserId))
            return Forbid();

        var expenses = await _expenseRepository.GetByVacationIdAsync(id);
        var totalExpenses = expenses.Sum(e => e.AmountInBaseCurrency);

        // Build per-participant balances. Each expense contributes its fair share exactly
        // once: using its custom split if overridden, otherwise the vacation's current
        // per-participant SplitWeight (so non-overridden expenses track live vacation changes).
        var participants = vacation.Participants.ToList();
        var fairShares = participants.ToDictionary(p => p.UserId, _ => 0m);
        foreach (var e in expenses)
        {
            if (e.Splits.Count > 0)
            {
                foreach (var s in e.Splits)
                {
                    if (fairShares.ContainsKey(s.UserId))
                        fairShares[s.UserId] += e.AmountInBaseCurrency * s.Weight;
                }
            }
            else
            {
                foreach (var p in participants)
                    fairShares[p.UserId] += e.AmountInBaseCurrency * p.SplitWeight;
            }
        }

        var balances = participants.Select(p =>
        {
            var paid = expenses.Where(e => e.PaidByUserId == p.UserId).Sum(e => e.AmountInBaseCurrency);
            var fairShare = fairShares[p.UserId];
            return new
            {
                UserId = p.UserId,
                Username = p.User.Username,
                TotalPaid = paid,
                FairShare = fairShare,
                Balance = paid - fairShare // positive = overpaid (owed back), negative = underpaid (owes)
            };
        }).ToList();

        // Compute transfers using greedy algorithm
        var debtors = balances.Where(b => b.Balance < 0)
            .Select(b => (b.UserId, b.Username, Amount: -b.Balance)) // how much they owe
            .OrderByDescending(b => b.Amount)
            .ToList();
        var creditors = balances.Where(b => b.Balance > 0)
            .Select(b => (b.UserId, b.Username, Amount: b.Balance)) // how much they are owed
            .OrderByDescending(b => b.Amount)
            .ToList();

        var transfers = new List<TransferDto>();
        int di = 0, ci = 0;
        var debtorAmounts = debtors.Select(d => d.Amount).ToList();
        var creditorAmounts = creditors.Select(c => c.Amount).ToList();

        while (di < debtors.Count && ci < creditors.Count)
        {
            var amount = Math.Min(debtorAmounts[di], creditorAmounts[ci]);
            if (amount > 0.005m) // ignore rounding noise
            {
                transfers.Add(new TransferDto(
                    debtors[di].UserId, debtors[di].Username,
                    creditors[ci].UserId, creditors[ci].Username,
                    Math.Round(amount, 2)
                ));
            }

            debtorAmounts[di] -= amount;
            creditorAmounts[ci] -= amount;

            if (debtorAmounts[di] < 0.005m) di++;
            if (creditorAmounts[ci] < 0.005m) ci++;
        }

        var balanceDtos = balances.Select(b => new ParticipantBalanceDto(
            b.UserId, b.Username,
            Math.Round(b.TotalPaid, 2),
            Math.Round(b.FairShare, 2),
            Math.Round(b.Balance, 2)
        )).ToList();

        return Ok(new SummaryDto(Math.Round(totalExpenses, 2), vacation.BaseCurrency, balanceDtos, transfers));
    }

    private static VacationDto MapToDto(Vacation v) => new(
        v.Id, v.Name, v.Description, v.BaseCurrency,
        v.StartDate, v.EndDate, v.CreatedBy,
        v.Creator?.Username ?? string.Empty,
        v.CreatedAt,
        v.Participants.Select(p => new ParticipantDto(p.UserId, p.User?.Username ?? string.Empty, p.User?.Email ?? string.Empty, p.SplitWeight)).ToList()
    );

    private static ExpenseDto MapExpenseToDto(Expense e, Vacation vacation)
    {
        var isCustom = e.Splits.Count > 0;
        var effectiveSplits = isCustom
            ? e.Splits.Select(s => new ExpenseSplitDto(
                s.UserId,
                vacation.Participants.FirstOrDefault(p => p.UserId == s.UserId)?.User?.Username ?? string.Empty,
                s.Weight))
            : vacation.Participants.Select(p => new ExpenseSplitDto(p.UserId, p.User?.Username ?? string.Empty, p.SplitWeight));

        return new ExpenseDto(
            e.Id, e.VacationId, e.PaidByUserId,
            e.PaidBy?.Username ?? string.Empty,
            e.Amount, e.Currency, e.AmountInBaseCurrency,
            e.Description, e.Category.ToString(),
            e.Date, e.CreatedAt,
            isCustom, effectiveSplits.ToList()
        );
    }

    private static bool TryValidateSplits(Vacation vacation, List<ExpenseSplitItem> splits, out string error)
    {
        var participantIds = vacation.Participants.Select(p => p.UserId).ToHashSet();
        if (splits.Any(s => !participantIds.Contains(s.UserId)))
        {
            error = "Split contains a user who is not a participant of this vacation";
            return false;
        }
        if (splits.Select(s => s.UserId).Distinct().Count() != splits.Count)
        {
            error = "Split contains duplicate participants";
            return false;
        }
        var total = splits.Sum(s => s.Weight);
        if (Math.Abs(total - 1.0m) > 0.001m)
        {
            error = "Split weights must sum to 1.0";
            return false;
        }
        error = string.Empty;
        return true;
    }
}

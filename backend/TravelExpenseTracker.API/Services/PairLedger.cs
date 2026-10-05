using TravelExpenseTracker.API.DTOs;

namespace TravelExpenseTracker.API.Services;

/// <summary>
/// Accumulates directed debts between pairs of users and nets them out per pair.
/// A negative debt (e.g. a repayment) reduces what the debtor owes, and flips the
/// direction of the pair if it exceeds it.
/// </summary>
public class PairLedger
{
    // Key is always (smaller id, larger id); value > 0 means the first owes the second.
    private readonly Dictionary<(Guid A, Guid B), decimal> _net = new();
    private readonly Dictionary<Guid, string> _names = new();

    public void RegisterName(Guid userId, string username) => _names[userId] = username;

    public void AddDebt(Guid debtor, Guid creditor, decimal amount)
    {
        if (debtor == creditor || amount == 0m) return;

        var key = debtor.CompareTo(creditor) < 0 ? (debtor, creditor) : (creditor, debtor);
        var signed = debtor.CompareTo(creditor) < 0 ? amount : -amount;
        _net[key] = _net.GetValueOrDefault(key) + signed;
    }

    public List<PairBalanceDto> ToPairs(Guid? onlyInvolvingUser = null)
    {
        var pairs = new List<PairBalanceDto>();
        foreach (var ((a, b), net) in _net)
        {
            if (onlyInvolvingUser.HasValue && a != onlyInvolvingUser && b != onlyInvolvingUser)
                continue;

            var rounded = Math.Round(Math.Abs(net), 2);
            if (rounded < 0.01m) continue; // settled (or rounding noise)

            var (debtor, creditor) = net > 0 ? (a, b) : (b, a);
            pairs.Add(new PairBalanceDto(
                debtor, NameOf(debtor),
                creditor, NameOf(creditor),
                rounded));
        }

        return pairs
            .OrderByDescending(p => p.Amount)
            .ThenBy(p => p.DebtorUsername)
            .ToList();
    }

    private string NameOf(Guid userId) => _names.GetValueOrDefault(userId, string.Empty);
}

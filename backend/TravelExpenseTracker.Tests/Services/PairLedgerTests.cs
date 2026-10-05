using FluentAssertions;
using Xunit;
using TravelExpenseTracker.API.Services;

namespace TravelExpenseTracker.Tests.Services;

public class PairLedgerTests
{
    private static readonly Guid Anna = Guid.NewGuid();
    private static readonly Guid Ben = Guid.NewGuid();
    private static readonly Guid Carl = Guid.NewGuid();

    private static PairLedger MakeLedger()
    {
        var ledger = new PairLedger();
        ledger.RegisterName(Anna, "anna");
        ledger.RegisterName(Ben, "ben");
        ledger.RegisterName(Carl, "carl");
        return ledger;
    }

    [Fact]
    public void SingleDebt_ProducesOnePair()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 40m);

        var pairs = ledger.ToPairs();

        pairs.Should().ContainSingle();
        pairs[0].DebtorUserId.Should().Be(Anna);
        pairs[0].CreditorUserId.Should().Be(Ben);
        pairs[0].Amount.Should().Be(40m);
    }

    [Fact]
    public void OpposingDebts_AreNettedIntoOneDirection()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 100m);
        ledger.AddDebt(Ben, Anna, 30m);

        var pairs = ledger.ToPairs();

        pairs.Should().ContainSingle();
        pairs[0].DebtorUsername.Should().Be("anna");
        pairs[0].CreditorUsername.Should().Be("ben");
        pairs[0].Amount.Should().Be(70m);
    }

    [Fact]
    public void FullyOffsetDebts_AreOmitted()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 50m);
        ledger.AddDebt(Ben, Anna, 50m);

        ledger.ToPairs().Should().BeEmpty();
    }

    [Fact]
    public void RoundingNoise_IsOmitted()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 0.004m);

        ledger.ToPairs().Should().BeEmpty();
    }

    [Fact]
    public void NegativeDebt_ReducesWhatIsOwed()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 100m);
        ledger.AddDebt(Anna, Ben, -40m); // Anna repaid Ben 40

        var pairs = ledger.ToPairs();

        pairs.Should().ContainSingle();
        pairs[0].DebtorUserId.Should().Be(Anna);
        pairs[0].Amount.Should().Be(60m);
    }

    [Fact]
    public void Overpayment_FlipsTheDirection()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 100m);
        ledger.AddDebt(Anna, Ben, -130m);

        var pairs = ledger.ToPairs();

        pairs.Should().ContainSingle();
        pairs[0].DebtorUserId.Should().Be(Ben);
        pairs[0].CreditorUserId.Should().Be(Anna);
        pairs[0].Amount.Should().Be(30m);
    }

    [Fact]
    public void SelfDebt_IsIgnored()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Anna, 25m);

        ledger.ToPairs().Should().BeEmpty();
    }

    [Fact]
    public void OnlyInvolvingUser_FiltersOtherPairs()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 10m);
        ledger.AddDebt(Ben, Carl, 20m);
        ledger.AddDebt(Carl, Anna, 30m);

        var pairs = ledger.ToPairs(Anna);

        pairs.Should().HaveCount(2);
        pairs.Should().OnlyContain(p => p.DebtorUserId == Anna || p.CreditorUserId == Anna);
    }

    [Fact]
    public void Pairs_AreOrderedByAmountDescending()
    {
        var ledger = MakeLedger();
        ledger.AddDebt(Anna, Ben, 10m);
        ledger.AddDebt(Ben, Carl, 90m);

        ledger.ToPairs().Select(p => p.Amount).Should().Equal(90m, 10m);
    }
}

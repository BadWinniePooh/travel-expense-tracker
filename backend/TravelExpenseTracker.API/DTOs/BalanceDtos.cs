namespace TravelExpenseTracker.API.DTOs;

// Net amount the debtor owes the creditor across all vacations, after repayments.
public record PairBalanceDto(
    Guid DebtorUserId,
    string DebtorUsername,
    Guid CreditorUserId,
    string CreditorUsername,
    decimal Amount
);

public record RepaymentDto(
    Guid Id,
    Guid FromUserId,
    string FromUsername,
    Guid ToUserId,
    string ToUsername,
    decimal Amount,
    string Currency,
    string? Note,
    DateTime Date,
    Guid CreatedByUserId,
    DateTime CreatedAt
);

public record BalancesDto(
    string Currency,
    List<PairBalanceDto> Pairs,
    List<RepaymentDto> Repayments
);

public record CreateRepaymentRequest(
    Guid FromUserId,
    Guid ToUserId,
    decimal Amount,
    string? Note,
    DateTime? Date
);

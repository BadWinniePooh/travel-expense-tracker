namespace TravelExpenseTracker.API.DTOs;

public record ExpenseDto(
    Guid Id,
    Guid VacationId,
    Guid PaidByUserId,
    string PaidByUsername,
    decimal Amount,
    string Currency,
    decimal AmountInBaseCurrency,
    string Description,
    string Category,
    DateTime Date,
    DateTime CreatedAt,
    bool IsSplitCustom,
    List<ExpenseSplitDto> Splits
);

public record ExpenseSplitDto(Guid UserId, string Username, decimal Weight);

public record ExpenseSplitItem(Guid UserId, decimal Weight);

public record CreateExpenseRequest(
    Guid PaidByUserId,
    decimal Amount,
    string Currency,
    string Description,
    string Category,
    DateTime Date,
    List<ExpenseSplitItem>? Splits
);

public record UpdateExpenseRequest(
    Guid? PaidByUserId,
    decimal? Amount,
    string? Currency,
    string? Description,
    string? Category,
    DateTime? Date,
    List<ExpenseSplitItem>? Splits,
    bool ResetSplit = false
);

public record SummaryDto(
    decimal TotalExpenses,
    string BaseCurrency,
    List<ParticipantBalanceDto> Balances,
    List<TransferDto> Transfers
);

public record ParticipantBalanceDto(
    Guid UserId,
    string Username,
    decimal TotalPaid,
    decimal FairShare,
    decimal Balance
);

public record TransferDto(
    Guid FromUserId,
    string FromUsername,
    Guid ToUserId,
    string ToUsername,
    decimal Amount
);

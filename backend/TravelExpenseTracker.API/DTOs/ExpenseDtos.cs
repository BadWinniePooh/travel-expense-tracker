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
    DateTime CreatedAt
);

public record CreateExpenseRequest(
    Guid PaidByUserId,
    decimal Amount,
    string Currency,
    string Description,
    string Category,
    DateTime Date
);

public record UpdateExpenseRequest(
    Guid? PaidByUserId,
    decimal? Amount,
    string? Currency,
    string? Description,
    string? Category,
    DateTime? Date
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

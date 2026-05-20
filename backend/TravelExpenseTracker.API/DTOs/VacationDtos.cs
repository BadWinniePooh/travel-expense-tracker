namespace TravelExpenseTracker.API.DTOs;

public record VacationDto(
    Guid Id,
    string Name,
    string? Description,
    string BaseCurrency,
    DateTime StartDate,
    DateTime EndDate,
    Guid CreatedBy,
    string CreatorUsername,
    DateTime CreatedAt,
    List<ParticipantDto> Participants
);

public record ParticipantDto(Guid UserId, string Username, string Email, decimal SplitWeight);

public record CreateVacationRequest(
    string Name,
    string? Description,
    string BaseCurrency,
    DateTime StartDate,
    DateTime EndDate
);

public record UpdateVacationRequest(
    string? Name,
    string? Description,
    string? BaseCurrency,
    DateTime? StartDate,
    DateTime? EndDate
);

public record AddParticipantRequest(Guid UserId, decimal SplitWeight);

public record UpdateParticipantRequest(decimal SplitWeight);

using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Core.Interfaces;

public interface IVacationRepository
{
    Task<Vacation?> GetByIdAsync(Guid id);
    Task<Vacation?> GetByIdWithDetailsAsync(Guid id);
    Task<IEnumerable<Vacation>> GetByUserIdAsync(Guid userId);
    Task<Vacation> CreateAsync(Vacation vacation);
    Task<Vacation> UpdateAsync(Vacation vacation);
    Task DeleteAsync(Guid id);
    Task<VacationParticipant?> GetParticipantAsync(Guid vacationId, Guid userId);
    Task<VacationParticipant> AddParticipantAsync(VacationParticipant participant);
    Task<VacationParticipant> UpdateParticipantAsync(VacationParticipant participant);
    Task RemoveParticipantAsync(Guid vacationId, Guid userId);
}

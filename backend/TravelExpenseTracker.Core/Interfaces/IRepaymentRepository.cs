using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Core.Interfaces;

public interface IRepaymentRepository
{
    Task<Repayment?> GetByIdAsync(Guid id);
    Task<IEnumerable<Repayment>> GetAllAsync();
    Task<IEnumerable<Repayment>> GetByUserIdAsync(Guid userId);
    Task<Repayment> CreateAsync(Repayment repayment);
    Task DeleteAsync(Guid id);
}

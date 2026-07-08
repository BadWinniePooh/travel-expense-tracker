using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.Core.Interfaces;

public interface IExpenseRepository
{
    Task<Expense?> GetByIdAsync(Guid id);
    Task<IEnumerable<Expense>> GetByVacationIdAsync(Guid vacationId);
    Task<Expense> CreateAsync(Expense expense);
    Task<Expense> UpdateAsync(Expense expense);
    Task DeleteAsync(Guid id);
    Task SetSplitAsync(Guid expenseId, IEnumerable<ExpenseSplit> splits);
    Task ClearSplitAsync(Guid expenseId);
}

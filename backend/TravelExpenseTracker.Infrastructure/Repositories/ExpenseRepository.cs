using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;
using TravelExpenseTracker.Infrastructure.Data;

namespace TravelExpenseTracker.Infrastructure.Repositories;

public class ExpenseRepository : IExpenseRepository
{
    private readonly AppDbContext _context;

    public ExpenseRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Expense?> GetByIdAsync(Guid id) =>
        await _context.Expenses.Include(e => e.PaidBy).Include(e => e.Splits).FirstOrDefaultAsync(e => e.Id == id);

    public async Task<IEnumerable<Expense>> GetByVacationIdAsync(Guid vacationId) =>
        await _context.Expenses
            .Include(e => e.PaidBy)
            .Include(e => e.Splits)
            .Where(e => e.VacationId == vacationId)
            .OrderByDescending(e => e.Date)
            .ToListAsync();

    public async Task<Expense> CreateAsync(Expense expense)
    {
        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync();
        return expense;
    }

    public async Task<Expense> UpdateAsync(Expense expense)
    {
        _context.Expenses.Update(expense);
        await _context.SaveChangesAsync();
        return expense;
    }

    public async Task DeleteAsync(Guid id)
    {
        var expense = await _context.Expenses.FindAsync(id);
        if (expense != null)
        {
            _context.Expenses.Remove(expense);
            await _context.SaveChangesAsync();
        }
    }

    public async Task SetSplitAsync(Guid expenseId, IEnumerable<ExpenseSplit> splits)
    {
        var existing = await _context.ExpenseSplits.Where(es => es.ExpenseId == expenseId).ToListAsync();
        _context.ExpenseSplits.RemoveRange(existing);
        await _context.ExpenseSplits.AddRangeAsync(splits);
        await _context.SaveChangesAsync();
    }

    public async Task ClearSplitAsync(Guid expenseId)
    {
        var existing = await _context.ExpenseSplits.Where(es => es.ExpenseId == expenseId).ToListAsync();
        if (existing.Count > 0)
        {
            _context.ExpenseSplits.RemoveRange(existing);
            await _context.SaveChangesAsync();
        }
    }
}

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
        await _context.Expenses.Include(e => e.PaidBy).FirstOrDefaultAsync(e => e.Id == id);

    public async Task<IEnumerable<Expense>> GetByVacationIdAsync(Guid vacationId) =>
        await _context.Expenses
            .Include(e => e.PaidBy)
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
}

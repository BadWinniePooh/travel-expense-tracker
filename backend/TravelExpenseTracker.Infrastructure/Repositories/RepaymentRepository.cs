using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;
using TravelExpenseTracker.Infrastructure.Data;

namespace TravelExpenseTracker.Infrastructure.Repositories;

public class RepaymentRepository : IRepaymentRepository
{
    private readonly AppDbContext _context;

    public RepaymentRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Repayment?> GetByIdAsync(Guid id) =>
        await _context.Repayments
            .Include(r => r.FromUser)
            .Include(r => r.ToUser)
            .FirstOrDefaultAsync(r => r.Id == id);

    public async Task<IEnumerable<Repayment>> GetAllAsync() =>
        await _context.Repayments
            .Include(r => r.FromUser)
            .Include(r => r.ToUser)
            .OrderByDescending(r => r.Date)
            .ThenByDescending(r => r.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<Repayment>> GetByUserIdAsync(Guid userId) =>
        await _context.Repayments
            .Include(r => r.FromUser)
            .Include(r => r.ToUser)
            .Where(r => r.FromUserId == userId || r.ToUserId == userId)
            .OrderByDescending(r => r.Date)
            .ThenByDescending(r => r.CreatedAt)
            .ToListAsync();

    public async Task<Repayment> CreateAsync(Repayment repayment)
    {
        _context.Repayments.Add(repayment);
        await _context.SaveChangesAsync();
        return repayment;
    }

    public async Task DeleteAsync(Guid id)
    {
        var repayment = await _context.Repayments.FindAsync(id);
        if (repayment != null)
        {
            _context.Repayments.Remove(repayment);
            await _context.SaveChangesAsync();
        }
    }
}

using Microsoft.EntityFrameworkCore;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;
using TravelExpenseTracker.Infrastructure.Data;

namespace TravelExpenseTracker.Infrastructure.Repositories;

public class VacationRepository : IVacationRepository
{
    private readonly AppDbContext _context;

    public VacationRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Vacation?> GetByIdAsync(Guid id) =>
        await _context.Vacations.FindAsync(id);

    public async Task<Vacation?> GetByIdWithDetailsAsync(Guid id) =>
        await _context.Vacations
            .Include(v => v.Creator)
            .Include(v => v.Participants).ThenInclude(p => p.User)
            .Include(v => v.Expenses).ThenInclude(e => e.PaidBy)
            .FirstOrDefaultAsync(v => v.Id == id);

    public async Task<IEnumerable<Vacation>> GetByUserIdAsync(Guid userId) =>
        await _context.Vacations
            .Include(v => v.Creator)
            .Include(v => v.Participants).ThenInclude(p => p.User)
            .Where(v => v.Participants.Any(p => p.UserId == userId))
            .OrderByDescending(v => v.StartDate)
            .ToListAsync();

    public async Task<Vacation> CreateAsync(Vacation vacation)
    {
        _context.Vacations.Add(vacation);
        await _context.SaveChangesAsync();
        return vacation;
    }

    public async Task<Vacation> UpdateAsync(Vacation vacation)
    {
        _context.Vacations.Update(vacation);
        await _context.SaveChangesAsync();
        return vacation;
    }

    public async Task DeleteAsync(Guid id)
    {
        var vacation = await _context.Vacations.FindAsync(id);
        if (vacation != null)
        {
            _context.Vacations.Remove(vacation);
            await _context.SaveChangesAsync();
        }
    }

    public async Task<VacationParticipant?> GetParticipantAsync(Guid vacationId, Guid userId) =>
        await _context.VacationParticipants
            .Include(vp => vp.User)
            .FirstOrDefaultAsync(vp => vp.VacationId == vacationId && vp.UserId == userId);

    public async Task<VacationParticipant> AddParticipantAsync(VacationParticipant participant)
    {
        _context.VacationParticipants.Add(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task<VacationParticipant> UpdateParticipantAsync(VacationParticipant participant)
    {
        _context.VacationParticipants.Update(participant);
        await _context.SaveChangesAsync();
        return participant;
    }

    public async Task RemoveParticipantAsync(Guid vacationId, Guid userId)
    {
        var participant = await _context.VacationParticipants
            .FirstOrDefaultAsync(vp => vp.VacationId == vacationId && vp.UserId == userId);
        if (participant != null)
        {
            _context.VacationParticipants.Remove(participant);
            await _context.SaveChangesAsync();
        }
    }
}

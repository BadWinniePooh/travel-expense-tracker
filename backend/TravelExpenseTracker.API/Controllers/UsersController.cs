using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TravelExpenseTracker.API.DTOs;
using TravelExpenseTracker.Core.Interfaces;
using TravelExpenseTracker.Core.Models;

namespace TravelExpenseTracker.API.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly IUserRepository _userRepository;

    public UsersController(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers()
    {
        var users = await _userRepository.GetAllAsync();
        return Ok(users.Select(MapToDto));
    }

    [HttpPost]
    public async Task<ActionResult<UserDto>> CreateUser([FromBody] CreateUserRequest request)
    {
        if (await _userRepository.GetByUsernameAsync(request.Username) != null)
            return Conflict(new { message = "Username already exists" });
        if (await _userRepository.GetByEmailAsync(request.Email) != null)
            return Conflict(new { message = "Email already exists" });

        if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
            return BadRequest(new { message = "Invalid role. Must be 'Member' or 'Admin'" });

        var user = new User
        {
            Username = request.Username,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = role
        };

        var created = await _userRepository.CreateAsync(user);
        return CreatedAtAction(nameof(GetUser), new { id = created.Id }, MapToDto(created));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UserDto>> GetUser(Guid id)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null) return NotFound();
        return Ok(MapToDto(user));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<UserDto>> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null) return NotFound();

        if (request.Username != null)
        {
            var existing = await _userRepository.GetByUsernameAsync(request.Username);
            if (existing != null && existing.Id != id)
                return Conflict(new { message = "Username already exists" });
            user.Username = request.Username;
        }

        if (request.Email != null)
        {
            var existing = await _userRepository.GetByEmailAsync(request.Email);
            if (existing != null && existing.Id != id)
                return Conflict(new { message = "Email already exists" });
            user.Email = request.Email;
        }

        if (request.Password != null)
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

        if (request.Role != null)
        {
            if (!Enum.TryParse<UserRole>(request.Role, true, out var role))
                return BadRequest(new { message = "Invalid role. Must be 'Member' or 'Admin'" });
            user.Role = role;
        }

        var updated = await _userRepository.UpdateAsync(user);
        return Ok(MapToDto(updated));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await _userRepository.GetByIdAsync(id);
        if (user == null) return NotFound();
        await _userRepository.DeleteAsync(id);
        return NoContent();
    }

    private static UserDto MapToDto(User u) =>
        new(u.Id, u.Username, u.Email, u.Role.ToString(), u.CreatedAt);
}

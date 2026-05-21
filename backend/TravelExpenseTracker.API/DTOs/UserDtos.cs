namespace TravelExpenseTracker.API.DTOs;

public record UserDto(Guid Id, string Username, string Email, string Role, DateTime CreatedAt);

public record CreateUserRequest(string Username, string Email, string Password, string Role = "Member");

public record UpdateUserRequest(string? Username, string? Email, string? Password, string? Role);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

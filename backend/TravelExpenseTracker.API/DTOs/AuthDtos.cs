namespace TravelExpenseTracker.API.DTOs;

public record LoginRequest(string Username, string Password);

public record LoginResponse(string Token, string Username, string Email, string Role);

public record MeResponse(Guid Id, string Username, string Email, string Role);

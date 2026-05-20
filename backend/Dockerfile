FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore TravelExpenseTracker.sln && \
    dotnet publish TravelExpenseTracker.API/TravelExpenseTracker.API.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
# Upgrade all OS packages to pick up the latest security patches from the
# Debian 12 repository before any application files are copied in.
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
RUN addgroup --gid 1001 appgroup && \
    adduser --uid 1001 --gid 1001 --disabled-password --gecos "" appuser
WORKDIR /app
COPY --from=build /app/publish .
USER 1001:1001
EXPOSE 8080
ENTRYPOINT ["dotnet", "TravelExpenseTracker.API.dll"]

FROM node:24-bookworm-slim AS client-build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS server-build
WORKDIR /src
COPY global.json NuGet.Config ./
COPY server/Marauders.Server.csproj server/
RUN dotnet restore server/Marauders.Server.csproj
COPY server/ server/
COPY --from=client-build /src/client/dist/ client/dist/
RUN dotnet publish server/Marauders.Server.csproj --configuration Release --no-restore --output /out -p:RequireReleaseAssets=true

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS runtime
# Railway mounts volumes as root. The entrypoint fixes only /data ownership,
# then starts the web server as the image's unprivileged app user.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=server-build /out/ ./
COPY --chmod=755 deploy/entrypoint.sh /usr/local/bin/marauders-entrypoint
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    Game__DataDirectory=/data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/marauders-entrypoint"]

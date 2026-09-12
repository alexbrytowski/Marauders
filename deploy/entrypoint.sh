#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
    mkdir -p /data
    chown app:app /data
    chmod 700 /data
    exec setpriv --reuid=app --regid=app --init-groups dotnet /app/Marauders.Server.dll "$@"
fi

exec dotnet /app/Marauders.Server.dll "$@"

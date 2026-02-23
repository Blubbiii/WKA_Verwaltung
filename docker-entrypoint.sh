#!/bin/sh
# =============================================================================
# WindparkManager - Docker Entrypoint Script
# =============================================================================
# Dieses Script:
# 1. Wartet auf die Datenbank
# 2. Fuehrt Prisma Migrations aus (nur fuer app, nicht worker)
# 3. Startet die Next.js Anwendung ODER den Worker (basierend auf START_MODE)
# =============================================================================

set -e

echo "=================================================="
echo "WindparkManager - Starting Production Container"
echo "=================================================="
echo ""

# -----------------------------------------------------------------------------
# Funktion: Auf Datenbank warten
# -----------------------------------------------------------------------------
wait_for_database() {
    echo "[1/4] Waiting for database connection..."

    # Extrahiere Host und Port aus DATABASE_URL
    # Format: postgresql://user:password@host:port/database
    if [ -z "$DATABASE_URL" ]; then
        echo "ERROR: DATABASE_URL is not set!"
        exit 1
    fi

    # Verwende Node.js um die URL zu parsen (portabler als bash string manipulation)
    DB_HOST=$(echo "$DATABASE_URL" | node -e "
        const url = new URL(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
        console.log(url.hostname);
    ")
    DB_PORT=$(echo "$DATABASE_URL" | node -e "
        const url = new URL(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
        console.log(url.port || '5432');
    ")

    echo "   Database host: $DB_HOST"
    echo "   Database port: $DB_PORT"

    # Warte bis PostgreSQL erreichbar ist
    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
            echo "   Database is ready!"
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "   Waiting for database... (attempt $RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done

    echo "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    exit 1
}

# -----------------------------------------------------------------------------
# Funktion: Auf Redis warten (nur fuer Worker)
# -----------------------------------------------------------------------------
wait_for_redis() {
    echo "[2/4] Waiting for Redis connection..."

    if [ -z "$REDIS_URL" ]; then
        echo "   REDIS_URL is not set, skipping Redis check"
        return 0
    fi

    # Extrahiere Host und Port aus REDIS_URL
    REDIS_HOST=$(echo "$REDIS_URL" | node -e "
        const url = new URL(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
        console.log(url.hostname);
    ")
    REDIS_PORT=$(echo "$REDIS_URL" | node -e "
        const url = new URL(require('fs').readFileSync('/dev/stdin', 'utf8').trim());
        console.log(url.port || '6379');
    ")

    echo "   Redis host: $REDIS_HOST"
    echo "   Redis port: $REDIS_PORT"

    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
            echo "   Redis is ready!"
            return 0
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "   Waiting for Redis... (attempt $RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    done

    echo "ERROR: Could not connect to Redis after $MAX_RETRIES attempts"
    exit 1
}

# -----------------------------------------------------------------------------
# Funktion: Prisma Migrations ausfuehren
# -----------------------------------------------------------------------------
run_migrations() {
    echo ""
    echo "[3/4] Running database migrations..."

    # Prisma Deploy (wendet ausstehende Migrations an)
    # Nutzt 'deploy' statt 'migrate dev' fuer Production
    # Direkter Node-Aufruf statt npx (npx ist im Standalone-Image nicht verfuegbar)
    node node_modules/prisma/build/index.js migrate deploy

    if [ $? -eq 0 ]; then
        echo "   Migrations completed successfully!"
    else
        echo "ERROR: Migration failed!"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Funktion: Prisma Client generieren (falls noetig)
# -----------------------------------------------------------------------------
generate_client() {
    echo ""
    echo "   Ensuring Prisma client is up to date..."

    # Nur generieren wenn noetig
    node node_modules/prisma/build/index.js generate
}

# -----------------------------------------------------------------------------
# Funktion: Graceful Shutdown Handler
# -----------------------------------------------------------------------------
shutdown_handler() {
    echo ""
    echo "=================================================="
    echo "Received shutdown signal, gracefully stopping..."
    echo "=================================================="

    # Warte kurz, damit laufende Jobs abgeschlossen werden koennen
    sleep 5

    # Sende SIGTERM an den Kindprozess
    if [ -n "$CHILD_PID" ]; then
        kill -TERM "$CHILD_PID" 2>/dev/null
        wait "$CHILD_PID" 2>/dev/null
    fi

    echo "Shutdown complete."
    exit 0
}

# -----------------------------------------------------------------------------
# Hauptprogramm
# -----------------------------------------------------------------------------
main() {
    echo "Environment: $NODE_ENV"
    echo "Start Mode: ${START_MODE:-app}"
    echo "Port: ${PORT:-3000}"
    echo ""

    # Registriere Signal Handler fuer Graceful Shutdown
    trap shutdown_handler SIGTERM SIGINT SIGQUIT

    # 1. Auf Datenbank warten
    wait_for_database

    # Bestimme den Start-Modus
    case "${START_MODE:-app}" in
        worker)
            echo ""
            echo "Starting in WORKER mode..."
            echo ""

            # 2. Auf Redis warten (nur fuer Worker)
            wait_for_redis

            # 3. Skip Migrations fuer Worker (App macht das)
            echo "[3/4] Skipping migrations (handled by app service)"

            # 4. Worker starten
            echo ""
            echo "[4/4] Starting Worker process..."
            echo "   Concurrency: ${WORKER_CONCURRENCY:-5}"
            echo "=================================================="
            echo ""

            # Starte Worker im Hintergrund und merke PID fuer Graceful Shutdown
            exec "$@" &
            CHILD_PID=$!
            wait "$CHILD_PID"
            ;;

        app|*)
            # 2. Auf Redis warten (optional fuer App)
            wait_for_redis

            # 3. Migrations ausfuehren
            run_migrations

            # 4. Anwendung starten
            echo ""
            echo "[4/4] Starting Next.js application..."
            echo "=================================================="
            echo ""

            # Uebergebe alle Argumente an den eigentlichen Startbefehl
            exec "$@"
            ;;
    esac
}

# Script ausfuehren
main "$@"

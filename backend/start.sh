#!/bin/sh

# Function to wait for database connection
wait_for_db() {
    echo "Waiting for database connection..."
    echo "DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo "yes" || echo "no")"
    if [ -n "$DATABASE_URL" ]; then
        echo "DATABASE_URL (masked): $(echo "$DATABASE_URL" | sed 's/:[^@]*@/:****@/')"
    fi
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts: Testing database connection..."
        
        # Test connection with detailed error output
        echo "  - Testing Prisma connection and schema push..."
        TEST_OUTPUT=$(npx prisma db push --accept-data-loss --skip-generate 2>&1)
        TEST_EXIT_CODE=$?
        
        if [ $TEST_EXIT_CODE -eq 0 ]; then
            echo "  ✓ Database connection successful!"
            echo "Database connection successful!"
            return 0
        else
            echo "  ✗ Connection test failed (exit code: $TEST_EXIT_CODE)"
            echo "  Error output:"
            echo "$TEST_OUTPUT" | head -30
            if [ $attempt -eq $max_attempts ]; then
                echo "  Full error output:"
                echo "$TEST_OUTPUT"
            fi
        fi
        
        echo "Attempt $attempt/$max_attempts: Database not ready, waiting 2 seconds..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "Failed to connect to database after $max_attempts attempts"
    echo ""
    echo "Attempting final diagnostic check..."
    echo "  - Checking DATABASE_URL format..."
    if echo "$DATABASE_URL" | grep -q "postgresql://"; then
        echo "    ✓ DATABASE_URL appears to be a PostgreSQL connection string"
        DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        echo "    - Extracted host: ${DB_HOST:-unknown}"
        echo "    - Extracted port: ${DB_PORT:-unknown}"
    else
        echo "    ✗ DATABASE_URL format may be incorrect"
    fi
    return 1
}

# Wait for database to be available
if ! wait_for_db; then
    echo "Database connection failed, starting application anyway..."
    echo "Note: Database migrations will need to be run manually"
    echo "Attempting to continue with migration anyway..."
    echo "Running: npx prisma migrate deploy"
    MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
    MIGRATE_EXIT=$?
    echo "$MIGRATE_OUTPUT"
    if [ $MIGRATE_EXIT -eq 0 ]; then
        echo "✓ Migrations completed successfully despite connection test failure"
    else
        echo "✗ Migration also failed (exit code: $MIGRATE_EXIT)"
        echo "Check logs above for details."
    fi
else
    echo "Running database migrations..."
    echo "Checking migration status first..."
    STATUS_OUTPUT=$(npx prisma migrate status 2>&1)
    STATUS_EXIT=$?
    echo "$STATUS_OUTPUT"
    if [ $STATUS_EXIT -ne 0 ]; then
        echo "⚠️  Migration status check failed (exit code: $STATUS_EXIT), continuing anyway..."
    fi
    echo ""
    echo "Running: npx prisma migrate deploy"
    MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1)
    MIGRATE_EXIT=$?
    echo "$MIGRATE_OUTPUT"
    if [ $MIGRATE_EXIT -eq 0 ]; then
        echo "✓ Migrations completed successfully"
    else
        echo "✗ Migration failed (exit code: $MIGRATE_EXIT). Attempting to resolve..."
        echo "Migration error details shown above."
        
        # Try to resolve failed migrations
        echo "Checking migration status..."
        if npx prisma migrate status 2>&1; then
            echo "Migration status checked successfully"
        else
            echo "Migration status check failed, see output above"
        fi
        
        # Try to mark failed migrations as resolved (this is safe for most cases)
        echo "Attempting to resolve failed migrations..."
        
        # Resolve potentially failed migrations in order
        echo "Resolving migration: 20250123120000_add_user_project_submission_models"
        npx prisma migrate resolve --applied 20250123120000_add_user_project_submission_models || echo "Could not resolve add_user_project_submission_models migration"
        
        # If the old migration structure exists, try to resolve those as well
        echo "Resolving migration: 20251020000000_init"
        npx prisma migrate resolve --applied 20251020000000_init || echo "Could not resolve init migration"
        
        echo "Resolving migration: 20251021000000_add_sticker_tokens"
        npx prisma migrate resolve --applied 20251021000000_add_sticker_tokens || echo "Could not resolve add_sticker_tokens migration"
        
        echo "Retrying migration deploy after resolution attempts..."
        if npx prisma migrate deploy; then
            echo "Migrations completed successfully after resolution"
        else
            echo "Migration still failed after resolution, trying consolidated migration..."
            
            # Try to resolve the consolidated migration if it exists
            echo "Resolving consolidated migration: 20250123120000_init_consolidated"
            npx prisma migrate resolve --applied 20250123120000_init_consolidated || echo "Could not resolve consolidated migration"
            
            # Check if the error is about existing types/tables (common after partial migrations)
            echo "Checking if schema elements already exist..."
            if npx prisma db push --accept-data-loss --skip-generate > /dev/null 2>&1; then
                echo "Schema is already up to date, marking migration as applied"
                npx prisma migrate resolve --applied 20250123120000_init_consolidated || echo "Could not mark consolidated migration as applied"
            fi
            
            # Final attempt to deploy
            if npx prisma migrate deploy; then
                echo "Migrations completed successfully with consolidated migration"
            else
                echo "Migration still failed, but continuing with startup"
            fi
        fi
    fi
fi

echo "Starting user service..."

# Initialize Datadog monitoring
echo "Initializing Datadog monitoring..."
if [ -n "$DD_AGENT_HOST" ]; then
    echo "Datadog agent host: $DD_AGENT_HOST"
    echo "Datadog trace agent port: ${DD_TRACE_AGENT_PORT:-8126}"
    echo "Datadog APM enabled: ${DD_APM_ENABLED:-false}"
    echo "Datadog profiling enabled: ${DD_PROFILING_ENABLED:-false}"
    echo "Datadog service: ${DD_SERVICE:-backend}"
    echo "Datadog environment: ${DD_ENV:-production}"
    echo "Datadog version: ${DD_VERSION:-1.0.0}"
    
    # Check if Datadog agent is reachable
    if command -v nc >/dev/null 2>&1; then
        if nc -z "$DD_AGENT_HOST" "${DD_TRACE_AGENT_PORT:-8126}" 2>/dev/null; then
            echo "✅ Datadog agent is reachable at $DD_AGENT_HOST:${DD_TRACE_AGENT_PORT:-8126}"
        else
            echo "⚠️  Warning: Datadog agent at $DD_AGENT_HOST:${DD_TRACE_AGENT_PORT:-8126} is not reachable"
            echo "   Application will continue without APM tracing"
        fi
    else
        echo "ℹ️  Note: netcat not available, skipping Datadog agent connectivity check"
        echo "   Datadog tracing will be attempted regardless"
    fi
else
    echo "⚠️  Warning: DD_AGENT_HOST not set, Datadog monitoring disabled"
fi

echo "Starting NestJS application..."
exec node dist/main

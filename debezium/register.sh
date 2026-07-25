#!/usr/bin/env bash
# debezium/register.sh
#
# Registers the Postgres Debezium connector with Kafka Connect.
# Retries until the Connect REST API is reachable (max 30 attempts).
#
# Usage (from the project root):
#   bash debezium/register.sh

set -euo pipefail

CONNECT_URL="http://localhost:8083/connectors"
CONNECTOR_FILE="$(dirname "$0")/register-postgres-connector.json"
MAX_ATTEMPTS=30
SLEEP_SECONDS=3

echo "Waiting for Kafka Connect to be ready..."

for i in $(seq 1 $MAX_ATTEMPTS); do
    if curl -sf "${CONNECT_URL}" > /dev/null 2>&1; then
        echo "Kafka Connect is ready (attempt ${i})."
        break
    fi

    if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
        echo "ERROR: Kafka Connect did not become ready after ${MAX_ATTEMPTS} attempts. Aborting."
        exit 1
    fi

    echo "  Attempt ${i}/${MAX_ATTEMPTS} — not ready yet, retrying in ${SLEEP_SECONDS}s..."
    sleep "$SLEEP_SECONDS"
done

echo "Registering connector from ${CONNECTOR_FILE}..."

HTTP_STATUS=$(curl -s -o /tmp/connect_response.json -w "%{http_code}" \
    -X POST "${CONNECT_URL}" \
    -H "Content-Type: application/json" \
    -d @"${CONNECTOR_FILE}")

if [ "$HTTP_STATUS" -eq 201 ]; then
    echo "Connector registered successfully (HTTP 201)."
    cat /tmp/connect_response.json
elif [ "$HTTP_STATUS" -eq 409 ]; then
    echo "Connector already exists (HTTP 409). Nothing to do."
else
    echo "ERROR: Unexpected HTTP status ${HTTP_STATUS}:"
    cat /tmp/connect_response.json
    exit 1
fi

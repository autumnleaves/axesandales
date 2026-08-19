# Project preferences

## Running test suites

Whenever you need to run this repo's test suite (unit, integration, e2e — any command whose purpose is to run tests), delegate it to the `test-runner` subagent instead of running it directly in the main thread. Do not run test commands yourself first "to check" and then delegate — delegate from the start.

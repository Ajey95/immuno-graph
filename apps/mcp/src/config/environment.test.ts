import { afterEach, describe, expect, it } from 'vitest';

import { loadMcpEnvironment } from './environment.js';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('MCP environment', () => {
  it('uses HTTP transport on localhost for local development', () => {
    process.env = { NODE_ENV: 'development' };

    expect(loadMcpEnvironment()).toMatchObject({
      HOST: '127.0.0.1',
      PORT: 3001,
      MCP_HOST: '127.0.0.1',
      MCP_PORT: 3001,
      MCP_TRANSPORT_TYPE: 'http',
    });
  });

  it('binds HTTP transport to all interfaces in production cloud runtimes', () => {
    process.env = { NODE_ENV: 'production', PORT: '8080' };

    expect(loadMcpEnvironment()).toMatchObject({
      HOST: '0.0.0.0',
      PORT: 8080,
      MCP_HOST: '0.0.0.0',
      MCP_TRANSPORT_TYPE: 'http',
    });
  });

  it('loads explicit IEDB population coverage connector configuration', () => {
    process.env = {
      NODE_ENV: 'production',
      IEDB_POPULATION_COVERAGE_ENABLED: 'true',
      IEDB_POPULATION_COVERAGE_URL: 'https://example.test/iedb/population',
      IEDB_POPULATION_COVERAGE_SCRIPT_PATH:
        'C:/iedb/population_coverage/calculate_population_coverage.py',
      IEDB_POPULATION_COVERAGE_PYTHON_COMMAND: 'python3',
      IEDB_POPULATION_COVERAGE_TIMEOUT_MS: '5000',
    };

    expect(loadMcpEnvironment()).toMatchObject({
      IEDB_POPULATION_COVERAGE_ENABLED: true,
      IEDB_POPULATION_COVERAGE_URL: 'https://example.test/iedb/population',
      IEDB_POPULATION_COVERAGE_SCRIPT_PATH:
        'C:/iedb/population_coverage/calculate_population_coverage.py',
      IEDB_POPULATION_COVERAGE_PYTHON_COMMAND: 'python3',
      IEDB_POPULATION_COVERAGE_TIMEOUT_MS: 5000,
    });
  });
});

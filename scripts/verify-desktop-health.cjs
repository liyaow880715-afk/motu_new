const assert = require("node:assert/strict");
const http = require("node:http");

const { waitForLocalServer } = require("../desktop/local-server-health.cjs");

const EXPECTED_VERSION = require("../package.json").version;

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function sendJson(response, value, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function validHealthPayload() {
  return { service: "motu", version: EXPECTED_VERSION, apiContract: "motu-api/v1" };
}

function validVersionPayload() {
  return {
    success: true,
    data: { service: "motu", version: EXPECTED_VERSION, apiContract: "motu-api/v1" },
  };
}

async function withServer(handler, run) {
  const server = await startServer(handler);
  try {
    await run(server.baseUrl);
  } finally {
    await server.close();
  }
}

function waitOptions(baseUrl, overrides = {}) {
  return {
    baseUrl,
    expectedVersion: EXPECTED_VERSION,
    isProcessAlive: () => true,
    isServerReady: () => true,
    timeoutMs: 40,
    requestTimeoutMs: 100,
    retryDelayMs: 5,
    ...overrides,
  };
}

async function main() {
  await withServer((request, response) => {
    if (request.url === "/api/health") return sendJson(response, validHealthPayload());
    response.writeHead(404).end();
  }, async (baseUrl) => {
    const result = await waitForLocalServer(waitOptions(baseUrl));
    assert.equal(result.mode, "health");
  });

  let versionRequests = 0;
  await withServer((request, response) => {
    if (request.url === "/api/health") return response.writeHead(403).end("403 Access denied");
    if (request.url === "/api/version") {
      versionRequests += 1;
      return sendJson(response, validVersionPayload());
    }
    response.writeHead(404).end();
  }, async (baseUrl) => {
    const result = await waitForLocalServer(waitOptions(baseUrl));
    assert.equal(result.mode, "version-fallback");
    assert.equal(versionRequests, 1);
  });

  versionRequests = 0;
  await withServer((request, response) => {
    if (request.url === "/api/health") return response.writeHead(403).end("403 Access denied");
    if (request.url === "/api/version") versionRequests += 1;
    response.writeHead(403).end("403 Access denied");
  }, async (baseUrl) => {
    await assert.rejects(
      waitForLocalServer(waitOptions(baseUrl, { isServerReady: () => false })),
      /Server health check failed with status 403/,
    );
    assert.equal(versionRequests, 0, "fallback must not run before Next reports ready");
  });

  await withServer((request, response) => {
    if (request.url === "/api/health") return response.writeHead(403).end("403 Access denied");
    if (request.url === "/api/version") versionRequests += 1;
    response.writeHead(403).end("403 Access denied");
  }, async (baseUrl) => {
    await assert.rejects(
      waitForLocalServer(waitOptions(baseUrl, { isProcessAlive: () => false })),
      /Server health check failed with status 403/,
    );
    assert.equal(versionRequests, 0, "fallback must not run after the spawned process exits");
  });

  await withServer((request, response) => {
    if (request.url === "/api/health") return response.writeHead(403).end("403 Access denied");
    if (request.url === "/api/version") return response.writeHead(403).end("403 Access denied");
    response.writeHead(404).end();
  }, async (baseUrl) => {
    await assert.rejects(
      waitForLocalServer(waitOptions(baseUrl)),
      /Server version fallback failed with status 403/,
    );
  });

  await withServer((request, response) => {
    if (request.url === "/api/health") return response.writeHead(403).end("403 Access denied");
    if (request.url === "/api/version") {
      return sendJson(response, {
        success: true,
        data: { service: "other-app", version: EXPECTED_VERSION, apiContract: "motu-api/v1" },
      });
    }
    response.writeHead(404).end();
  }, async (baseUrl) => {
    await assert.rejects(
      waitForLocalServer(waitOptions(baseUrl)),
      /Server version fallback returned an unexpected response/,
    );
  });

  console.log("Desktop local server health checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

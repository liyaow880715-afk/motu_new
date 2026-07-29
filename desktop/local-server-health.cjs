const http = require("http");

const DEFAULT_REQUEST_TIMEOUT_MS = 3000;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RESPONSE_BYTES = 16 * 1024;

function formatProbeError(label, response) {
  const summary = response.body.replace(/\s+/g, " ").trim().slice(0, 4096);
  return `${label} failed with status ${response.statusCode}${summary ? `: ${summary}` : ""}`;
}

function requestLocal(url, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      url,
      {
        agent: false,
        headers: {
          Accept: "application/json",
          Connection: "close",
        },
      },
      (response) => {
        const chunks = [];
        let bodyLength = 0;
        response.on("data", (chunk) => {
          if (bodyLength >= MAX_RESPONSE_BYTES) return;
          const remaining = MAX_RESPONSE_BYTES - bodyLength;
          const slice = chunk.subarray(0, remaining);
          chunks.push(slice);
          bodyLength += slice.length;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Local server probe timed out."));
    });
    request.on("error", reject);
  });
}

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isSuccessfulStatus(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

function isExpectedVersion(actualVersion, expectedVersion) {
  return typeof actualVersion === "string" && actualVersion.length > 0 && actualVersion === expectedVersion;
}

function isMotuHealthResponse(response, expectedVersion) {
  if (!isSuccessfulStatus(response.statusCode)) return false;
  const payload = parseJson(response.body);
  return (
    payload?.service === "motu" &&
    isExpectedVersion(payload.version, expectedVersion) &&
    typeof payload.apiContract === "string"
  );
}

function isMotuVersionResponse(response, expectedVersion) {
  if (!isSuccessfulStatus(response.statusCode)) return false;
  const payload = parseJson(response.body);
  return (
    payload?.success === true &&
    payload?.data?.service === "motu" &&
    isExpectedVersion(payload.data.version, expectedVersion) &&
    typeof payload.data.apiContract === "string"
  );
}

function isAccessDeniedResponse(response) {
  return response.statusCode === 403 && /^403\s+access denied$/i.test(response.body.trim());
}

async function probeLocalServer({
  baseUrl,
  expectedVersion,
  isProcessAlive,
  isServerReady,
  request = requestLocal,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const healthResponse = await request(`${baseUrl}/api/health`, requestTimeoutMs);
  if (isMotuHealthResponse(healthResponse, expectedVersion)) {
    return { mode: "health" };
  }

  const healthFailure = isSuccessfulStatus(healthResponse.statusCode)
    ? "Server health check returned an unexpected response."
    : formatProbeError("Server health check", healthResponse);

  if (!isAccessDeniedResponse(healthResponse) || !isProcessAlive() || !isServerReady()) {
    throw new Error(healthFailure);
  }

  const versionResponse = await request(`${baseUrl}/api/version`, requestTimeoutMs);
  if (isMotuVersionResponse(versionResponse, expectedVersion)) {
    return { mode: "version-fallback" };
  }

  const versionFailure = isSuccessfulStatus(versionResponse.statusCode)
    ? "Server version fallback returned an unexpected response."
    : formatProbeError("Server version fallback", versionResponse);
  throw new Error(`${healthFailure}\n${versionFailure}`);
}

function waitForLocalServer({
  baseUrl,
  expectedVersion,
  isProcessAlive,
  isServerReady,
  timeoutMs = 60000,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  request = requestLocal,
}) {
  const startedAt = Date.now();
  let lastFailure = "";

  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const result = await probeLocalServer({
          baseUrl,
          expectedVersion,
          isProcessAlive,
          isServerReady,
          request,
          requestTimeoutMs,
        });
        resolve(result);
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(lastFailure || "Timed out waiting for local desktop server to start."));
          return;
        }
        setTimeout(attempt, retryDelayMs);
      }
    };

    attempt();
  });
}

module.exports = {
  isAccessDeniedResponse,
  isMotuHealthResponse,
  isMotuVersionResponse,
  probeLocalServer,
  requestLocal,
  waitForLocalServer,
};

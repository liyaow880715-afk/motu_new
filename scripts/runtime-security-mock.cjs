const http = require("http");

const port = Number(process.env.MOTU_TEST_MOCK_PORT || 0);
if (!port) throw new Error("MOTU_TEST_MOCK_PORT is required");

function send(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "POST" && url.pathname === "/api/auth/verify") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const suffix = String(input.key || "").endsWith("-b") ? "b" : "a";
      send(response, 200, {
        success: true,
        data: {
          id: `access-${suffix}`,
          key: input.key,
          type: "MONTHLY",
          platform: "WEB_ONLY",
          label: `Security ${suffix.toUpperCase()}`,
          usedCount: 0,
          activatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      });
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/v1/models") {
    send(response, 200, { object: "list", data: [{ id: "gpt-security-test", object: "model" }] });
    return;
  }
  send(response, 404, { error: { message: "not found" } });
});

server.listen(port, "127.0.0.1");

for (const event of ["SIGINT", "SIGTERM"]) {
  process.on(event, () => server.close(() => process.exit(0)));
}

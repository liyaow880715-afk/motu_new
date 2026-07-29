const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { z } = require("zod");

const root = path.resolve(__dirname, "..");

function loadAdapter() {
  const source = fs.readFileSync(path.join(root, "lib/ai/adapters/openai-compatible.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (moduleId) => {
    if (moduleId === "@/lib/monitor/api-usage") {
      return { inferCategory: () => "text", logApiUsage: async () => undefined };
    }
    return require(moduleId);
  };
  new Function("exports", "module", "require", output)(loaded.exports, loaded, localRequire);
  return loaded.exports.OpenAICompatibleAdapter;
}

function providerResponse(status, body) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function withMockFetch(responses, run) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const response = responses.shift();
    if (!response) throw new Error("Unexpected extra provider request");
    return response;
  };
  try {
    await run(requests);
    assert.equal(responses.length, 0, "all expected provider responses must be consumed");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const OpenAICompatibleAdapter = loadAdapter();
  const tokenError = providerResponse(400, {
    error: { message: "Unsupported parameter: max_output_tokens", type: "invalid_request_error" },
  });

  await withMockFetch([
    tokenError,
    providerResponse(200, { choices: [{ message: { content: JSON.stringify({ scenes: ["早餐"] }) } }] }),
  ], async (requests) => {
    const adapter = new OpenAICompatibleAdapter("https://token-fallback.example/v1", "test-key");
    const result = await adapter.generateStructured({
      model: "gpt-5.6-sol",
      userPrompt: "plan scenes",
      schema: z.object({ scenes: z.array(z.string()) }),
      maxOutputTokens: 9000,
      monitor: { operation: "hero_batch_scene_planning" },
    });
    assert.deepEqual(result.parsed, { scenes: ["早餐"] });
    assert.equal(requests[0].max_completion_tokens, 9000, "GPT-5 request must prefer its output token limit");
    assert.equal(requests[1].max_completion_tokens, undefined, "compatibility retry must remove max_completion_tokens");
    assert.equal(requests[1].max_output_tokens, undefined, "compatibility retry must remove max_output_tokens");
    assert.equal(requests[1].max_tokens, undefined, "compatibility retry must remove max_tokens");
    assert.deepEqual(requests[1].response_format, { type: "json_object" }, "token fallback must retain JSON output mode");
  });

  await withMockFetch([
    providerResponse(200, { choices: [{ message: { content: "second request" } }] }),
  ], async (requests) => {
    const adapter = new OpenAICompatibleAdapter("https://token-fallback.example/v1", "test-key");
    const result = await adapter.generateText({
      model: "gpt-5.6-sol",
      userPrompt: "repeat",
      maxOutputTokens: 9000,
    });
    assert.equal(result.text, "second request");
    assert.equal(requests[0].max_completion_tokens, undefined, "known incompatible model must skip the token limit");
  });

  await withMockFetch([
    providerResponse(400, { error: { message: "Invalid model", type: "invalid_request_error" } }),
  ], async (requests) => {
    const adapter = new OpenAICompatibleAdapter("https://unrelated-error.example/v1", "test-key");
    await assert.rejects(
      adapter.generateText({
        model: "gpt-5.6-sol",
        userPrompt: "do not retry",
        maxOutputTokens: 9000,
      }),
      /Invalid model/,
    );
    assert.equal(requests.length, 1, "unrelated provider errors must not be retried");
  });

  console.log("OpenAI-compatible output token fallback checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type SwaggerSchema = {
  type?: string;
  properties?: Record<string, SwaggerSchema>;
  items?: SwaggerSchema;
  additionalProperties?: SwaggerSchema;
  $ref?: string;
};

type SwaggerOperation = {
  parameters?: Array<{ name: string; in: string; required?: boolean; type?: string }>;
  responses?: Record<string, { schema?: SwaggerSchema }>;
};

type SwaggerSpec = {
  swagger: string;
  basePath: string;
  paths: Record<string, { get?: SwaggerOperation }>;
  definitions: Record<string, SwaggerSchema>;
};

const spec = JSON.parse(readFileSync(resolve(process.cwd(), "../beacon-server/docs/swagger.json"), "utf8")) as SwaggerSpec;

function get(path: string): SwaggerOperation {
  const operation = spec.paths[path]?.get;
  expect(operation, `GET ${path} must exist in backend Swagger`).toBeTruthy();
  return operation!;
}

function responseSchema(path: string, status = "200"): SwaggerSchema {
  const schema = get(path).responses?.[status]?.schema;
  expect(schema, `GET ${path} must declare ${status} response schema`).toBeTruthy();
  return schema!;
}

function definition(ref: string | undefined): SwaggerSchema {
  expect(ref, "expected schema ref").toMatch(/^#\/definitions\//);
  const name = ref!.replace("#/definitions/", "");
  const schema = spec.definitions[name];
  expect(schema, `definition ${name} must exist`).toBeTruthy();
  return schema;
}

function resolvedProperties(schema: SwaggerSchema): Record<string, SwaggerSchema> {
  const resolved = schema.$ref ? definition(schema.$ref) : schema;
  expect(resolved.properties, "schema must be an object with properties").toBeTruthy();
  return resolved.properties!;
}

describe("backend OpenAPI contract", () => {
  it("uses the public /api/v1 base path while keeping root health endpoints documented", () => {
    expect(spec.swagger).toBe("2.0");
    expect(spec.basePath).toBe("/api/v1");
    expect(get("/healthz")).toBeTruthy();
    expect(get("/readyz")).toBeTruthy();
  });

  it("documents health and readiness fields consumed by the runtime panel", () => {
    for (const path of ["/healthz", "/readyz"]) {
      const props = resolvedProperties(responseSchema(path));
      expect(props.status?.type).toBe("string");
      expect(props.ready?.type).toBe("boolean");
      expect(props.mode?.type).toBe("string");
      expect(props.serverTime?.type).toBe("integer");
      expect(props.dependencies?.type).toBe("object");
      expect(props.brokers?.type).toBe("array");

      const brokerProps = resolvedProperties(props.brokers.items!);
      expect(brokerProps.name?.type).toBe("string");
      expect(brokerProps.connected?.type).toBe("boolean");
      expect(brokerProps.status?.type).toBe("string");
    }
    expect(responseSchema("/readyz", "503").$ref).toBe(responseSchema("/readyz").$ref);
  });

  it("documents the major operator endpoints used by the web client", () => {
    for (const path of [
      "/atlas/briefing",
      "/brokers",
      "/channels",
      "/iatas",
      "/live/backfill",
      "/live/summary",
      "/nodes",
      "/observers",
      "/packets",
      "/regions",
      "/routes",
      "/search",
      "/stats/overview",
      "/traces",
    ]) {
      expect(responseSchema(path), `GET ${path} needs a response contract`).toBeTruthy();
    }
  });

  it("keeps required query parameters aligned for live backfill and search", () => {
    const liveParams = get("/live/backfill").parameters ?? [];
    expect(liveParams).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "afterObservationId", in: "query", required: true }),
      expect.objectContaining({ name: "limit", in: "query" }),
    ]));

    const searchParams = get("/search").parameters ?? [];
    expect(searchParams).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "q", in: "query" }),
      expect.objectContaining({ name: "limit", in: "query" }),
    ]));
  });

  it("keeps Atlas briefing and global search response shapes stable for the shell", () => {
    const atlasProps = resolvedProperties(responseSchema("/atlas/briefing"));
    for (const field of ["health", "regions", "priorities", "hotspots", "topNodes", "topObservers", "payloadMix", "routeMix", "scopes"]) {
      expect(atlasProps[field], `AtlasBriefing.${field} must exist`).toBeTruthy();
    }

    const searchProps = resolvedProperties(responseSchema("/search"));
    expect(searchProps.query?.type).toBe("string");
    expect(searchProps.items?.type).toBe("array");
    const itemProps = resolvedProperties(searchProps.items.items!);
    for (const field of ["type", "id", "label", "url", "score"]) {
      expect(itemProps[field], `SearchResult.${field} must exist`).toBeTruthy();
    }
  });
});

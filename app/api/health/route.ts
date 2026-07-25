export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "motu",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

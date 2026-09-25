const DEFAULT_BACKEND_URL = "http://localhost:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return new Response("Authentication required", { status: 401 });

  const backendUrl = (
    process.env.BACKEND_INTERNAL_URL
    ?? process.env.NEXT_PUBLIC_API_BASE_URL
    ?? DEFAULT_BACKEND_URL
  ).replace(/\/$/, "");

  try {
    const session = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!session.ok) return new Response("Authentication required", { status: 401 });

    const requestedRobotId = new URL(request.url).searchParams.get("robotId");
    if (!requestedRobotId) return new Response("Robot ID is required", { status: 400 });

    const stream = await fetch(
      `${backendUrl}/api/robots/${encodeURIComponent(requestedRobotId)}/camera/stream`, {
      headers: { cookie },
      cache: "no-store",
      signal: request.signal,
    });
    if (!stream.ok || !stream.body) throw new Error("Camera stream is unavailable");

    return new Response(stream.body, {
      status: 200,
      headers: {
        "Content-Type": stream.headers.get("content-type") ?? "multipart/x-mixed-replace; boundary=boundarydonotcross",
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("Camera stream is unavailable", { status: 502 });
  }
}

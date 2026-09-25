import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
  });
}

import { NextResponse } from "next/server";
import { loginMockUser } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

export async function POST() {
  const token = await loginMockUser();
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}

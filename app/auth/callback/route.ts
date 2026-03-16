import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  console.log("🔵 Callback route accessed");

  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type       = requestUrl.searchParams.get("type");
  const code       = requestUrl.searchParams.get("code");
  const next       = requestUrl.searchParams.get("next");
  const origin     = requestUrl.origin;

  console.log("🔵 Token hash:", token_hash ? "YES" : "NO");
  console.log("🔵 Code:", code ? "YES" : "NO");
  console.log("🔵 Type:", type);
  console.log("🔵 Next:", next);

  const supabase = await createClient();

  // ── Handle token_hash (invite / magic link / recovery) ───────────────────
  if (token_hash && type) {
    try {
      console.log("🔵 Verifying OTP...");
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });

      if (error) {
        console.error("🔴 OTP verification error:", error);
        return NextResponse.redirect(
          `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
        );
      }

      console.log("✅ OTP verified! User:", data.user?.email);

      // ✅ Invite type — go to set password first
      if (type === 'invite') {
        return NextResponse.redirect(`${origin}/portal/set-password`)
      }

      // ✅ Recovery type (password reset) — go to set password
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/portal/set-password`)
      }

      // ✅ Use next param if provided
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      return NextResponse.redirect(`${origin}/portal`);

    } catch (err) {
      console.error("🔴 OTP error:", err);
      return NextResponse.redirect(
        `${origin}/auth/login?error=Authentication failed`
      );
    }
  }

  // ── Handle code (OAuth / newer Supabase) ─────────────────────────────────
  if (code) {
    try {
      console.log("🔵 Exchanging code for session...");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("🔴 Code exchange error:", error);
        return NextResponse.redirect(
          `${origin}/auth/login?error=${encodeURIComponent(error.message)}`
        );
      }

      console.log("✅ Session created! User:", data.user?.email);

      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      return NextResponse.redirect(`${origin}/portal`);

    } catch (err) {
      console.error("🔴 Code exchange error:", err);
      return NextResponse.redirect(
        `${origin}/auth/login?error=Authentication failed`
      );
    }
  }

  // ── No auth params found ──────────────────────────────────────────────────
  console.log("🔴 No authentication parameters in URL");
  return NextResponse.redirect(
    `${origin}/auth/login?error=No authentication code`
  );
}
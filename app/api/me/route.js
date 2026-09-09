import { getSupabaseServerClient } from "../../lib/supabaseServer";

export async function GET(request) {
  try {
    const supabaseServer = getSupabaseServerClient();

    if (!supabaseServer) {
      console.error("[/api/me] Error: Supabase server client not configured.");
      return Response.json(
        { error: "Supabase server client not configured." },
        { status: 500 }
      );
    }

    const authHeader =
      request.headers.get("authorization") ||
      request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        { error: "Требуется авторизация." },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser(token);

    if (authError || !user) {
      console.error("[/api/me] Supabase auth.getUser error:", authError);
      return Response.json(
        { error: "Недействительный токен авторизации." },
        { status: 401 }
      );
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const keySource = serviceKey ? "service-role" : "anon-key";

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("id, role, credits, free_attempts")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[/api/me] Error querying profiles table:", {
        userId: user.id,
        email: user.email,
        error: profileError,
      });

      return Response.json(
        {
          error: `Ошибка чтения профиля: ${profileError.message || profileError.code}`,
          source: keySource,
          profileFound: false,
          dbError: profileError.message || String(profileError),
        },
        { status: 500 }
      );
    }

    const role = profile?.role || "user";
    const credits = profile?.credits ?? 0;
    const freeAttempts = profile?.free_attempts ?? 1;

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
      },
      role,
      credits,
      free_attempts: freeAttempts,
      source: keySource,
      profileFound: true,
    });
  } catch (error) {
    console.error("[/api/me] Unhandled exception:", error);
    return Response.json(
      { error: "Ошибка сервера при получении профиля." },
      { status: 500 }
    );
  }
}

import { getSupabaseServerClient } from "../../lib/supabaseServer";

export async function GET(request) {
  try {
    const supabaseServer = getSupabaseServerClient();

    if (!supabaseServer) {
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
      return Response.json(
        { error: "Недействительный токен авторизации." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("id, role, credits, free_attempts")
      .eq("id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Error fetching profile in /api/me:", profileError);
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
    });
  } catch (error) {
    console.error("Error in GET /api/me:", error);
    return Response.json(
      { error: "Ошибка сервера при получении профиля." },
      { status: 500 }
    );
  }
}

import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function verifyAndConsumeAccess(request, cost = 1) {
  const supabaseServer = getSupabaseServerClient();

  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");

  // If Supabase is not configured in env AND no auth header was provided, allow execution (fallback mode for standalone env)
  if (!supabaseServer && !authHeader) {
    return { allowed: true, isAdmin: false };
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // If Supabase server exists, require authorization
    if (supabaseServer) {
      return {
        allowed: false,
        status: 401,
        error: "Требуется авторизация. Пожалуйста, войдите в систему.",
      };
    }
    return { allowed: true, isAdmin: false };
  }

  const token = authHeader.substring(7);

  if (!supabaseServer) {
    return { allowed: true, isAdmin: false };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser(token);

  if (authError || !user) {
    return {
      allowed: false,
      status: 401,
      error: "Недействительный токен авторизации.",
    };
  }

  // Fetch profile
  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("id, role, credits, free_attempts")
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("Error fetching profile:", profileError);
  }

  const role = profile?.role || "user";
  const freeAttempts = profile?.free_attempts ?? 1;
  const credits = profile?.credits ?? 0;

  // Requirement 3: For role = admin:
  // - unlimited access to all tools
  // - never deduct credits
  // - do not block AI/API operations when balance is 0
  // - do not consume the free attempt
  if (role === "admin") {
    return { allowed: true, isAdmin: true, user, profile };
  }

  // For free/local operations (cost === 0): allow without deducting credits/attempts
  if (cost === 0) {
    return {
      allowed: true,
      isAdmin: false,
      user,
      remainingFreeAttempts: freeAttempts,
      remainingCredits: credits,
    };
  }

  // Requirement 4: For normal users:
  // - keep 1 free attempt
  // - after the free attempt, require sufficient credits
  // - block paid execution if credits are insufficient
  if (freeAttempts > 0) {
    // Consume free attempt
    const newFreeAttempts = freeAttempts - 1;
    await supabaseServer
      .from("profiles")
      .update({ free_attempts: newFreeAttempts })
      .eq("id", user.id);

    return {
      allowed: true,
      isAdmin: false,
      user,
      usedFreeAttempt: true,
      remainingFreeAttempts: newFreeAttempts,
      remainingCredits: credits,
    };
  }

  if (credits >= cost) {
    // Consume credits
    const newCredits = credits - cost;
    await supabaseServer
      .from("profiles")
      .update({ credits: newCredits })
      .eq("id", user.id);

    return {
      allowed: true,
      isAdmin: false,
      user,
      deductedCredits: cost,
      remainingFreeAttempts: freeAttempts,
      remainingCredits: newCredits,
    };
  }

  return {
    allowed: false,
    status: 403,
    error: "Недостаточно кредитов для выполнения операции. Пополните баланс.",
  };
}

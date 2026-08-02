import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { supabaseAdmin } from "../../config/supabase";

interface UserProfile {
  id: string;
  institute_id: string | null;
  role: "Clerk" | "HOD" | "Principal" | "Admin";
  full_name: string;
}

const extractBearerToken = (authorization?: string): string | null => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
};

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractBearerToken(req.header("Authorization"));

  if (!token) {
    next(new AppError("Missing or invalid Authorization header", 401));
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    next(new AppError("Unauthorized", 401, error?.message));
    return;
  }

  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("id, institute_id, role, full_name")
    .eq("id", data.user.id)
    .maybeSingle<UserProfile>();

  let profile = userProfile;

  if (profileError || !profile) {
    // Auto-recover profile from user_metadata if public.users row missing
    const meta = data.user.user_metadata;
    const fallbackName = meta?.full_name ?? data.user.email?.split("@")[0] ?? "User";
    const fallbackRole = meta?.role ?? "Admin";

    let targetInstId = meta?.institute_id ?? null;
    if (!targetInstId) {
      const { data: insts } = await supabaseAdmin.from("institutes").select("id").limit(1);
      if (insts && insts.length > 0) {
        targetInstId = insts[0].id;
      }
    }

    const { data: createdProfile, error: createErr } = await supabaseAdmin
      .from("users")
      .upsert({
        id: data.user.id,
        full_name: fallbackName,
        role: fallbackRole,
        institute_id: targetInstId
      })
      .select("id, institute_id, role, full_name")
      .single<UserProfile>();

    if (createErr || !createdProfile) {
      next(new AppError("User profile not found", 403, profileError?.message));
      return;
    }
    profile = createdProfile;
  }

  req.auth = {
    user: data.user,
    profile,
    token
  };

  next();
};

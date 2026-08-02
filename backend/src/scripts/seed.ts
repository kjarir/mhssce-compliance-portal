import { supabaseAdmin } from "../config/supabase";

export async function seedInitialData() {
  console.log("[SEED] Checking and seeding database...");

  try {
    // 1. Ensure at least 1 Institute exists
    let { data: institutes, error: instErr } = await supabaseAdmin
      .from("institutes")
      .select("*");

    if (instErr) {
      console.error("[SEED] Error reading institutes:", instErr.message);
      return;
    }

    let defaultInstituteId: string;

    if (!institutes || institutes.length === 0) {
      console.log("[SEED] Creating default institute (M.H. Saboo Siddik)...");
      const { data: newInst, error: createInstErr } = await supabaseAdmin
        .from("institutes")
        .insert({
          name: "M.H. Saboo Siddik College of Engineering",
          code: "MHSSCE",
        })
        .select()
        .single();

      if (createInstErr || !newInst) {
        console.error("[SEED] Failed to create institute:", createInstErr?.message);
        return;
      }
      defaultInstituteId = newInst.id;
    } else {
      defaultInstituteId = institutes[0].id;
    }

    // 2. Ensure Super Admin User exists in Auth & DB
    const adminEmail = "admin@anjuman.edu";
    const adminPassword = "AdminPassword123!";

    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    let adminAuthUser = usersList.users.find((u) => u.email === adminEmail);

    if (!adminAuthUser) {
      console.log("[SEED] Creating Super Admin in Supabase Auth...");
      const { data: createAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: "Super Admin",
          role: "Admin",
          institute_id: defaultInstituteId,
        },
      });

      if (createAuthErr || !createAuth.user) {
        console.error("[SEED] Failed to create Admin Auth:", createAuthErr?.message);
        return;
      }
      adminAuthUser = createAuth.user;
    }

    // 3. Ensure user row exists in public.users
    const { data: existingProfile } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", adminAuthUser.id)
      .maybeSingle();

    if (!existingProfile) {
      console.log("[SEED] Inserting Super Admin profile into public.users...");
      await supabaseAdmin.from("users").upsert({
        id: adminAuthUser.id,
        full_name: "Super Admin",
        role: "Admin",
        institute_id: defaultInstituteId,
      });
    }

    // 4. Sync ALL Auth users into public.users who might be missing
    for (const authUser of usersList.users) {
      const { data: p } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (!p) {
        const userRole = authUser.user_metadata?.role ?? "Admin";
        const userInst = authUser.user_metadata?.institute_id ?? defaultInstituteId;
        const userName = authUser.user_metadata?.full_name ?? authUser.email?.split("@")[0] ?? "User";

        console.log(`[SEED] Syncing missing user profile for ${authUser.email}...`);
        await supabaseAdmin.from("users").insert({
          id: authUser.id,
          full_name: userName,
          role: userRole,
          institute_id: userInst,
        });
      }
    }

    console.log("[SEED] Seeding & sync completed successfully!");
  } catch (err) {
    console.error("[SEED] Unexpected error during seed:", err);
  }
}

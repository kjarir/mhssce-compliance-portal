import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Matches the public.users table schema
export interface UserProfile {
  id: string;
  institute_id: string | null;
  full_name: string;
  role: "Clerk" | "HOD" | "Principal" | "Admin";
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch the user's profile from the public.users table
  const fetchProfile = useCallback(async (currentUser: User) => {
    // Use maybeSingle() instead of single() to avoid 406 when no row exists
    const { data, error } = await supabase
      .from("users")
      .select("id, institute_id, full_name, role")
      .eq("id", currentUser.id)
      .maybeSingle<UserProfile>();

    if (error) {
      console.error("Failed to fetch user profile:", error.message);
      setProfile(null);
      return;
    }

    if (data) {
      setProfile(data);
      return;
    }

    // Profile row doesn't exist — try to auto-recover from auth metadata
    const meta = currentUser.user_metadata;
    const fallbackName = meta?.full_name ?? currentUser.email?.split("@")[0] ?? "Super Admin";
    const fallbackRole = meta?.role ?? "Admin";

    // Query default institute if institute_id missing
    let targetInstId = meta?.institute_id ?? null;
    if (!targetInstId) {
      const { data: insts } = await supabase.from("institutes").select("id").limit(1);
      if (insts && insts.length > 0) {
        targetInstId = insts[0].id;
      }
    }

    console.warn("Profile row missing — auto-creating user profile in public.users...");

    const profilePayload = {
      id: currentUser.id,
      full_name: fallbackName,
      role: fallbackRole,
      institute_id: targetInstId,
    };

    const { data: recovered, error: insertError } = await supabase
      .from("users")
      .upsert(profilePayload)
      .select("id, institute_id, full_name, role")
      .single<UserProfile>();

    if (insertError) {
      console.error("Profile auto-creation failed:", insertError.message);
      // Fallback local memory profile so user is not blocked
      setProfile({
        id: currentUser.id,
        full_name: fallbackName,
        role: fallbackRole as "Admin",
        institute_id: targetInstId,
      });
      return;
    }

    setProfile(recovered);
    console.log("Profile created and synced successfully");
  }, []);

  useEffect(() => {
    // 1. Read the current session on mount
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        fetchProfile(currentSession.user);
      }
      setLoading(false);
    });

    // 2. Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        fetchProfile(newSession.user);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

import { useState, useEffect } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

type UserRole = "Clerk" | "HOD" | "Principal";

interface InstituteOption {
  id: string;
  name: string;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "Clerk", label: "Clerk" },
  { value: "HOD", label: "HOD (Head of Department)" },
  { value: "Principal", label: "Principal" },
];

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

const RegisterPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState<UserRole>("Clerk");
  const [instituteId, setInstituteId] = useState("");
  const [institutes, setInstitutes] = useState<InstituteOption[]>([]);
  const [institutesLoading, setInstitutesLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // If already logged in, redirect to dashboard
  if (!authLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Fetch institutes dynamically from the backend API (public endpoint)
  useEffect(() => {
    const fetchInstitutes = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/institutes`);
        const json = await response.json();

        if (json.success && json.data?.length > 0) {
          setInstitutes(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch institutes:", err);
      } finally {
        setInstitutesLoading(false);
      }
    };
    fetchInstitutes();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!instituteId) {
      setError("Please select an institute.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the auth user in Supabase
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
              institute_id: instituteId,
              phone_number: phoneNumber || undefined,
            },
          },
        });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Step 2: Insert the profile row into public.users
      if (signUpData.user) {
        const profileData: Record<string, unknown> = {
          id: signUpData.user.id,
          full_name: fullName,
          role,
          institute_id: instituteId,
        };

        // Only include phone if user provided one
        if (phoneNumber) {
          profileData.phone = phoneNumber;
        }

        const { error: profileError } = await supabase
          .from("users")
          .insert(profileData);

        if (profileError) {
          console.error("Profile creation error:", profileError.message);
          // Don't block registration — AuthContext will auto-recover on login
        }
      }

      // Check if email confirmation is required
      if (signUpData.user && !signUpData.session) {
        setSuccess(true);
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-gray-200/80 rounded-2xl p-8 shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#064E3B] flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            ✉️
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Check Your Email
          </h2>
          <p className="text-xs text-gray-500 font-medium mb-1">
            We sent a confirmation link to
          </p>
          <p className="font-bold text-xs text-emerald-800 mb-4">{email}</p>
          <p className="text-xs text-gray-500 font-medium mb-6">
            Click the link in the email to activate your account, then sign in to access the portal.
          </p>
          <Link
            to="/login"
            className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm transition-all inline-block"
          >
            ← Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F5] flex flex-col md:flex-row w-full overflow-hidden">
      {/* Left side 50% width pure Image (No overlay text/badge) */}
      <div className="hidden md:block md:w-1/2 relative bg-gray-900 overflow-hidden">
        <img
          src="/auth-banner.png"
          alt="Anjuman Campus"
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 hover:scale-105"
        />
      </div>

      {/* Right side 50% width Form Section */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="w-full max-w-md my-auto space-y-5">
          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Create Account
            </h1>
            <p className="text-xs text-gray-500 font-semibold mt-1">
              Register your credentials to access institutional compliance workflows
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5">
              <p className="text-xs font-bold text-rose-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Dr. Naeem Ansari"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@anjuman.edu"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                autoComplete="tel"
                placeholder="919876543210"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min 8 chars"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs cursor-pointer"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1">
                  Institute
                </label>
                <select
                  value={instituteId}
                  onChange={(e) => setInstituteId(e.target.value)}
                  required
                  disabled={institutesLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#064E3B] bg-white text-gray-900 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <option value="">Select Institute...</option>
                  {institutes.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-[#064E3B] hover:bg-[#04382B] text-white font-bold text-xs w-full py-3 rounded-xl shadow-sm transition-all disabled:opacity-50 mt-3"
            >
              {loading ? "Creating Account..." : "Register Account →"}
            </button>
          </form>

          <p className="text-xs text-gray-500 font-semibold text-center pt-1">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-[#064E3B] font-bold hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

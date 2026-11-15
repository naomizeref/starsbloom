import React, { useState, useEffect } from "react";
import { useOrbit } from "../context/OrbitContext";
import { useSupabaseClient, createUserProfile, ensureUserRow } from "../lib/supabase";
import { sendWelcomeEmail, sendSecurityAlert } from "../lib/emailClient";
import { issueAuthCode, verifyAuthCode } from "../lib/authCodes";
import {
  Mail, Lock, User, CheckCircle2, Phone, ChevronDown,
  Eye, EyeOff, Check, X, ArrowRight, ArrowLeft,
  ShieldCheck, Zap, Clock,
} from "lucide-react";
import { SearchableCountrySelect } from "../components/SearchableCountrySelect";
import { authErrorMessage, type AuthFormAdapter } from "../lib/authFormAdapter";

interface AuthPageProps {
  onNavigate: (view: string) => void;
  initialTab?: "login" | "register";
  auth?: AuthFormAdapter;
}

type FieldState = "idle" | "ok" | "err";

/* ---------- Presentational field primitives (module scope = stable identity,
   so inputs never remount / lose focus on re-render) ---------- */

const stateBorder = (state: FieldState) =>
  state === "ok"
    ? "border-orbit-green/55"
    : state === "err"
      ? "border-orbit-red/60"
      : "border-orbit-border/85 focus-within:border-orbit-accent focus-within:ring-2 focus-within:ring-orbit-accent/15";

interface TextInputProps {
  icon?: React.ComponentType<{ size?: number }>;
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "email" | "tel";
  state?: FieldState;
  hint?: string | null;
  password?: boolean;
  rightLabel?: React.ReactNode;
}

const TextInput: React.FC<TextInputProps> = ({
  icon: Icon, label, required, value, onChange, placeholder,
  type = "text", inputMode, state = "idle", hint, password = false, rightLabel,
}) => {
  const [show, setShow] = useState(false);
  const id = React.useId();
  const actualType = password ? (show ? "text" : "password") : type;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] uppercase font-subheading tracking-wider text-orbit-gray-text">
          {label}{required && <span className="text-orbit-accent ml-0.5">*</span>}
        </label>
        {rightLabel}
      </div>
      <div className={`relative flex items-center rounded-xl bg-orbit-bg border transition-all duration-150 ${stateBorder(state)}`}>
        {Icon && (
          <span className="absolute left-3.5 text-zinc-500 pointer-events-none">
            <Icon size={15} />
          </span>
        )}
        <input
          id={id}
          type={actualType}
          inputMode={inputMode}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full bg-transparent rounded-xl py-3 text-orbit-white outline-none placeholder:text-zinc-600 font-sans ${Icon ? "pl-10" : "pl-4"} pr-10`}
        />
        {password ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 text-zinc-500 hover:text-orbit-accent cursor-pointer bg-transparent border-none outline-none"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        ) : state === "ok" ? (
          <span className="absolute right-3 text-orbit-green pointer-events-none"><Check size={16} /></span>
        ) : state === "err" ? (
          <span className="absolute right-3 text-orbit-red pointer-events-none"><X size={16} /></span>
        ) : null}
      </div>
      {hint && (
        <p className={`text-[11px] leading-tight ${state === "err" ? "text-orbit-red" : "text-orbit-green"}`}>
          {hint}
        </p>
      )}
    </div>
  );
};

interface SelectInputProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  state?: FieldState;
  children: React.ReactNode;
}

const SelectInput: React.FC<SelectInputProps> = ({ label, required, value, onChange, state = "idle", children }) => {
  const id = React.useId();
  return (
  <div className="space-y-1.5">
    <label htmlFor={id} className="text-[11px] uppercase font-subheading tracking-wider text-orbit-gray-text block">
      {label}{required && <span className="text-orbit-accent ml-0.5">*</span>}
    </label>
    <div className={`relative flex items-center rounded-xl bg-orbit-bg border transition-all duration-150 ${stateBorder(state)}`}>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="w-full bg-transparent rounded-xl px-4 py-3 text-orbit-white cursor-pointer outline-none appearance-none font-sans [&>option]:bg-orbit-card [&>option]:text-orbit-white"
      >
        {children}
      </select>
      <span className="absolute right-3 text-zinc-500 pointer-events-none">
        <ChevronDown size={14} />
      </span>
    </div>
  </div>
  );
};

/* ---------- Password strength (pure client-side, no deps) ---------- */

const passwordStrength = (pw: string): { score: number; label: string } => {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ["", "Weak", "Fair", "Good", "Strong"][s] };
};

const pwBarColor = (i: number, score: number) => {
  if (i > score) return "bg-orbit-border";
  return ["", "bg-orbit-red", "bg-amber-500", "bg-yellow-400", "bg-orbit-green"][score];
};
const pwTextColor = (score: number) =>
  ["text-orbit-gray-text", "text-orbit-red", "text-amber-500", "text-yellow-400", "text-orbit-green"][score];


export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate, initialTab = "register", auth }) => {
  const { appSettings, sendWelcomeNotification } = useOrbit();
  const supabase = useSupabaseClient();

  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab);

  // Register wizard step (1 = account, 2 = profile, 3 = preferences)
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);

  // Login State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Register States
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState("Select Gender");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountType, setAccountType] = useState("Select Account Type");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("Choose Country");
  const [currency, setCurrency] = useState("Select Currency");
  const [checkedTerms, setCheckedTerms] = useState(false);

  // Email verification / OTP
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending || !email.trim()) return;
    setIsResending(true);
    setErrorMsg(null);
    try {
      if (auth) {
        await auth.resend();
        setSuccessMsg(`A new verification code was sent to ${email.trim()}.`);
        setResendCooldown(60);
        return;
      }
      // Codes are generated/stored/verified server-side (/api/auth-codes) so
      // they work from any tab or device. This also re-sends via Resend only —
      // Supabase's own confirmation email is never involved.
      const result = await issueAuthCode(email.trim(), "signup_verification", {
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to resend verification code. Please wait a moment.");
      }

      setSuccessMsg(`A new 6-digit verification code was sent to ${email.trim()}.`);
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMsg(authErrorMessage(err, "Failed to resend verification code. Please wait a moment."));
    } finally {
      setIsResending(false);
    }
  };


  const handleForgotPasswordRequest = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    setErrorMsg(null);
    setForgotLoading(true);
    try {
      if (auth) {
        await auth.requestReset(forgotEmail.trim());
        setSuccessMsg(`Check ${forgotEmail.trim()} for your password reset code.`);
        setForgotStep("reset");
        return;
      }
      // The reset code is generated/stored/verified server-side
      // (/api/auth-codes) — NOT in sessionStorage — so entering it works from
      // any tab or device, and the new password is applied server-side after
      // the code check (no Supabase recovery email is sent).
      const result = await issueAuthCode(forgotEmail.trim(), "password_reset");
      if (!result.success) {
        throw new Error(result.error || "Failed to send reset email. Please try again.");
      }

      setSuccessMsg(`A 6-digit password reset code has been sent to ${forgotEmail.trim()}.`);
      setForgotStep("reset");
    } catch (err: any) {
      setErrorMsg(authErrorMessage(err, "Failed to send reset email. Please try again."));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordReset = async () => {
    if (!resetCode.trim()) {
      setErrorMsg("Please enter the 6-digit reset code.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setErrorMsg("New password must be at least 8 characters.");
      return;
    }
    setErrorMsg(null);
    setForgotLoading(true);
    try {
      if (auth) {
        await auth.resetPassword(resetCode.trim(), newPassword);
        return;
      }
      // Server verifies the hashed code AND applies the new password directly
      // with the admin API — no browser session required — so a correct code
      // can no longer be rejected as invalid.
      const result = await verifyAuthCode(forgotEmail.trim(), "password_reset", resetCode.trim(), newPassword);
      if (!result.success) {
        throw new Error(result.error || "Invalid or expired reset code. Please check your inbox and try again.");
      }

      setSuccessMsg("Password reset successfully! Redirecting...");
      setLoginEmail(forgotEmail.trim());
      setTimeout(() => {
        setShowForgotPassword(false);
        setForgotStep("request");
        setActiveTab("login");
      }, 3000);
    } catch (err: any) {
      setErrorMsg(authErrorMessage(err, "Failed to reset password. Please verify the code and try again."));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      setErrorMsg("Please enter the 6-digit verification code.");
      return;
    }
    setErrorMsg(null);
    setIsVerifying(true);
    try {
      if (auth) {
        await auth.verify(verificationCode.trim());
        return;
      }
      // Server-side verification (/api/auth-codes): a correct code marks the
      // Supabase account as verified (email confirmed). The code was issued by
      // this same endpoint, so it validates from any browser or device.
      const verifyResult = await verifyAuthCode(email.trim(), "signup_verification", verificationCode.trim());
      if (!verifyResult.success) {
        throw new Error(verifyResult.error || "Invalid or expired verification code. Please check your inbox or click 'Resend Code'.");
      }

      // Ensure user session & profile
      let currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser && password) {
        const signInRes = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInRes.error) throw signInRes.error;
        currentUser = signInRes.data.user;
      }

      if (currentUser) {
        await createUserProfile(supabase, {
          id: currentUser.id,
          email: email.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          username: username.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender: sex,
          phone: phone.trim(),
          accountType,
          country,
          currency,
        });
        await ensureUserRow(supabase, currentUser);
      }

      // Send welcome email via Resend
      void sendWelcomeEmail(email.trim(), `${firstName.trim()} ${lastName.trim()}`.trim());

      // Route by the real DB role: admins go straight to /admin after signup
      // verification instead of passing through the public/user dashboard.
      let targetView = "dashboard";
      if (currentUser) {
        const { data: profileRow } = await supabase
          .from("users")
          .select("role")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (profileRow?.role === "admin") targetView = "dashboard-admin";
      }

      setIsSuccess(true);
      setTimeout(() => onNavigate(targetView), 1000);
    } catch (err: any) {
      setErrorMsg(authErrorMessage(err, "Invalid or expired verification code. Please check your inbox."));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || (auth && !auth.ready)) return;
    if (showForgotPassword) {
      if (!forgotLoading) await (forgotStep === 'request' ? handleForgotPasswordRequest() : handleForgotPasswordReset());
      return;
    }
    setErrorMsg(null);

    if (activeTab === "register") {
      if (!username.trim()) {
        setErrorMsg("Username is required.");
        return;
      }
      if (!firstName.trim()) {
        setErrorMsg("First name is required.");
        return;
      }
      if (!lastName.trim()) {
        setErrorMsg("Last name is required.");
        return;
      }
      if (sex === "Select Gender" || !sex) {
        setErrorMsg("Please select your gender (Sex).");
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }
      if (!phone.trim()) {
        setErrorMsg("Phone number is required.");
        return;
      }
      if (accountType === "Select Account Type" || !accountType) {
        setErrorMsg("Please select an investment account type tier.");
        return;
      }
      if (!password) {
        setErrorMsg("Password is required.");
        return;
      }
      if (password.length < 8) {
        setErrorMsg("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match.");
        return;
      }
      if (country === "Choose Country" || !country) {
        setErrorMsg("Please select your country.");
        return;
      }
      if (currency === "Select Currency" || !currency) {
        setErrorMsg("Please select a transaction account currency.");
        return;
      }
      if (!checkedTerms) {
        setErrorMsg("You must accept the terms & privacy policy to continue.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (auth) {
          const result = await auth.register({ email: email.trim(), password, username: username.trim(),
            firstName: firstName.trim(), lastName: lastName.trim(), gender: sex, phone: phone.trim(),
            accountType, country, currency });
          if (result === 'verify') {
            setPendingVerification(true);
            setResendCooldown(60);
            setSuccessMsg(`A confirmation code was sent to ${email.trim()}.`);
          }
          return;
        }
        // Server-side signup (/api/auth-codes): generates the 6-digit code,
        // emails it via Resend, AND creates the Supabase auth account
        // (unconfirmed). Because the account is created through the admin API,
        // Supabase NEVER sends its own confirmation email — the Resend code is
        // the one and only email. Entering that code verifies the account.
        const emailResult = await issueAuthCode(email.trim(), "signup_verification", {
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          password,
        });

        if (!emailResult || emailResult.success !== true) {
          throw new Error(
            `We could not deliver the verification code email${emailResult?.error ? `: ${emailResult.error}` : "."} ` +
            "Please double-check your email address and try again, or contact support if this keeps happening."
          );
        }

        setPendingVerification(true);
        setSuccessMsg(`A 6-digit confirmation code was sent to ${email.trim()}. Enter it below to activate your account.`);
      } catch (err: any) {
        setErrorMsg(authErrorMessage(err, "Registration failed. Please try again."));
      } finally {
        setIsSubmitting(false);
      }

    } else {
      // Login
      if (!loginEmail.trim() || !loginEmail.includes("@")) {
        setErrorMsg("Please enter a valid email address.");
        return;
      }
      if (!loginPassword) {
        setErrorMsg("Please enter your password.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (auth) {
          await auth.login(loginEmail.trim(), loginPassword);
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });

        if (error) throw error;

        if (data.user) {
          await ensureUserRow(supabase, data.user);

          // Dispatch Security Alert Email for login / new device session
          const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
          let deviceName = "Web Browser";
          if (/iPhone/i.test(userAgent)) deviceName = "iPhone";
          else if (/iPad/i.test(userAgent)) deviceName = "iPad";
          else if (/Android/i.test(userAgent)) deviceName = "Android Device";
          else if (/Macintosh|Mac OS/i.test(userAgent)) deviceName = "macOS";
          else if (/Windows/i.test(userAgent)) deviceName = "Windows PC";
          else if (/Linux/i.test(userAgent)) deviceName = "Linux PC";

          void sendSecurityAlert(data.user.email || loginEmail.trim(), {
            email: data.user.email || loginEmail.trim(),
            device: deviceName,
            time: new Date().toUTCString(),
            location: "Authorized Session",
            ip: "Detected via Secure SSL",
          });
        }

        // Route by the real DB role so admins land directly on their own
        // dashboard instead of being bounced through the user site first.
        let targetView = "dashboard";
        if (data.user) {
          const { data: profileRow } = await supabase
            .from("users")
            .select("role")
            .eq("id", data.user.id)
            .maybeSingle();
          if (profileRow?.role === "admin") targetView = "dashboard-admin";
        }

        setIsSuccess(true);
        setTimeout(() => {
          onNavigate(targetView);
        }, 800);
      } catch (err: any) {
        setIsSuccess(false);
        setErrorMsg(authErrorMessage(err, "Unable to sign in. Please check your email and password."));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const currenciesList = ["USD", "EUR", "GBP", "BTC", "USDT"];

  /* ---- Per-step validation for the register wizard. Mirrors the rules in
     handleSubmit (which still runs as the final safety net on step 3). ---- */
  const validateStep = (step: 1 | 2): string | null => {
    if (step === 1) {
      if (!username.trim()) return "Username is required.";
      if (!email.trim() || !email.includes("@")) return "Please enter a valid email address.";
      if (!password) return "Password is required.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }
    if (step === 2) {
      if (!firstName.trim()) return "First name is required.";
      if (!lastName.trim()) return "Last name is required.";
      if (sex === "Select Gender" || !sex) return "Please select your gender (Sex).";
      if (!phone.trim()) return "Phone number is required.";
    }
    return null;
  };

  const attemptNext = () => {
    const err = validateStep(regStep as 1 | 2);
    if (err) { setErrorMsg(err); return; }
    setErrorMsg(null);
    setRegStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  };

  const goBackStep = () => {
    setErrorMsg(null);
    setRegStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  };

  // Enter on steps 1/2 advances the wizard instead of submitting the form early.
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (
      e.key === "Enter" &&
      activeTab === "register" &&
      !pendingVerification &&
      !showForgotPassword &&
      regStep < 3 &&
      (e.target as HTMLElement).tagName !== "TEXTAREA"
    ) {
      e.preventDefault();
      attemptNext();
    }
  };

  const switchTab = (tab: "login" | "register") => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (tab === "register") setRegStep(1);
  };

  // Live field states for inline validation feedback
  const uState: FieldState = username.trim() ? "ok" : "idle";
  const eState: FieldState = email.trim() && email.includes("@") ? "ok" : email.length > 0 ? "err" : "idle";
  const cState: FieldState = confirmPassword ? (confirmPassword === password ? "ok" : "err") : "idle";
  const fnState: FieldState = firstName.trim() ? "ok" : "idle";
  const lnState: FieldState = lastName.trim() ? "ok" : "idle";
  const phState: FieldState = phone.trim() ? "ok" : "idle";
  const pw = passwordStrength(password);

  const headerTitle = pendingVerification
    ? "Verify your email"
    : showForgotPassword
      ? "Reset password"
      : activeTab === "register" ? "Create your account" : "Welcome back";

  const headerSub = pendingVerification
    ? `We sent a 6-digit code to ${email}. Enter it below to activate your account.`
    : showForgotPassword
      ? "We'll email you a secure code to reset your password."
      : activeTab === "register"
        ? ["Step 1 of 3 — start with your login credentials.",
          "Step 2 of 3 — tell us a little about yourself.",
          "Step 3 of 3 — set your trading preferences."][regStep - 1]
        : "Access real-time indicators, tier yields, and copy-performance logs.";

  const trustRows = [
    { icon: ShieldCheck, t1: "Bank-grade encryption", t2: "Multi-layer, end-to-end protection on every session." },
    { icon: Zap, t1: "Seamless execution", t2: "Low-latency order routing and live market sync." },
    { icon: Clock, t1: "Onboard in under 2 minutes", t2: "Three quick steps — no paperwork, no waiting." },
  ];

  return (
    <div className="w-full max-w-5xl my-auto font-sans">
      <div className="grid overflow-hidden rounded-[28px] border border-orbit-border/70 bg-gradient-to-br from-[#12161D] via-[#0D1014] to-[#090B10] shadow-[0_40px_120px_rgba(0,0,0,0.55)] md:grid-cols-[0.92fr_1.08fr]">

        {/* ---------------- LEFT BRAND RAIL ---------------- */}
        <aside className="relative order-2 flex flex-col overflow-hidden border-t border-orbit-border/50 p-8 md:order-1 md:border-r md:border-t-0 md:p-10">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, rgba(255,177,26,0.12), transparent 55%), radial-gradient(60% 40% at 85% 95%, rgba(255,127,0,0.10), transparent 60%)",
            }}
          />
          <div className="relative z-10">
            <img
              src="/bloom-logo-white.svg"
              alt="Bloom Logo"
              className="h-10 w-auto object-contain cursor-pointer transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          <div className="relative z-10 mt-auto pt-10">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-orbit-accent">
              Institutional-grade trading
            </div>
            <h1 className="mt-3 mb-3 max-w-[13ch] font-brand text-[30px] font-bold leading-[1.1] tracking-tight text-balance text-orbit-white sm:text-[34px]">
              Trade with{" "}
              <span className="bg-gradient-to-r from-orbit-accent to-[#1D4ED8] bg-clip-text text-transparent">precision</span>,
              onboard in minutes.
            </h1>
            <p className="mb-8 max-w-[34ch] text-sm leading-relaxed text-orbit-gray-text">
              Real-time indicators, tiered yields, and copy-performance logs — in one workspace built for serious traders.
            </p>

            <div className="flex flex-col gap-4">
              {trustRows.map(({ icon: Icon, t1, t2 }) => (
                <div key={t1} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-orbit-accent/30 bg-orbit-accent/10 text-orbit-accent">
                    <Icon size={15} />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold leading-tight text-orbit-white">{t1}</div>
                    <div className="text-xs leading-snug text-orbit-gray-text">{t2}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mt-8 flex items-center gap-2 text-[11px] text-orbit-gray-text">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-orbit-green animate-ping" />
            Security node active · End-to-end encryption
          </div>
        </aside>

        {/* ---------------- RIGHT FORM PANEL ---------------- */}
        <section className="order-1 flex flex-col p-7 md:order-2 md:p-10">

          {/* Tab switcher — hidden mid-verify / mid-reset / mid-success */}
          {!auth?.continuation && !pendingVerification && !showForgotPassword && !isSuccess && (
            <div className="mb-7 inline-flex gap-1 self-start rounded-full border border-orbit-border/70 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => switchTab("register")}
                className={`rounded-full px-5 py-2 text-xs font-bold font-subheading transition-all cursor-pointer ${activeTab === "register" ? "bg-orbit-accent text-white shadow-sm" : "text-slate-300 hover:text-white"
                  }`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => switchTab("login")}
                className={`rounded-full px-5 py-2 text-xs font-bold font-subheading transition-all cursor-pointer ${activeTab === "login" ? "bg-orbit-accent text-white shadow-sm" : "text-slate-300 hover:text-white"
                  }`}
              >
                Sign in
              </button>
            </div>
          )}

          {/* Header */}
          {!isSuccess && !auth?.continuation && (
            <div className="mb-7">
              {pendingVerification && (
                <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orbit-accent/30 bg-orbit-accent/10 text-orbit-accent">
                  <Mail size={26} />
                </span>
              )}
              <h2 className="font-brand text-[25px] font-bold tracking-tight text-orbit-white">{headerTitle}</h2>
              <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-orbit-gray-text">{headerSub}</p>
            </div>
          )}

          {auth && !auth.continuation && <div id="clerk-captcha" data-cl-theme="dark" />}
          {auth && !auth.ready && <p role="status" className="mb-3 text-xs text-orbit-gray-text">Connecting securely… You can fill in your details while you wait.</p>}

          {auth?.continuation ? auth.continuation : isSuccess ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-orbit-accent/30 bg-orbit-accent/10 text-orbit-accent">
                <CheckCircle2 size={26} className="animate-bounce" />
              </span>
              <p className="font-subheading text-sm font-bold text-orbit-accent">
                {activeTab === "register" ? "Creating your account…" : "Signing you in…"}
              </p>
            </div>
          ) : pendingVerification ? (
            /* Email verification step */
            <form onSubmit={handleVerifyEmail} className="flex flex-col gap-5">
              {errorMsg && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 font-sans text-xs text-red-400">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 font-sans text-xs text-emerald-400">
                  {successMsg}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase font-subheading tracking-wider text-orbit-gray-text">
                  Verification code
                </label>
                <input
                  aria-label="Verification code"
                  autoComplete="one-time-code"
                  type="text"
                  inputMode="numeric"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-xl border border-orbit-border/85 bg-orbit-bg px-4 py-3.5 text-center font-sans tracking-[0.4em] text-orbit-white outline-none transition-all focus:border-orbit-accent focus:ring-2 focus:ring-orbit-accent/15 tabular-nums text-lg"
                  required
                />
              </div>
              <button type="submit" disabled={isVerifying} className="orb-button w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed">
                {isVerifying ? (
                  <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-orbit-bg/30 border-t-orbit-bg" />Verifying code…</>
                ) : (<>Verify &amp; activate account <ArrowRight size={16} /></>)}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setPendingVerification(false); setErrorMsg(null); setSuccessMsg(null); }}
                  className="cursor-pointer border-none bg-transparent text-xs font-semibold text-orbit-gray-text hover:text-white outline-none"
                >
                  ← Back to registration
                </button>

                <button
                  type="button"
                  disabled={resendCooldown > 0 || isResending}
                  onClick={handleResendCode}
                  className="cursor-pointer border-none bg-transparent text-xs font-semibold text-orbit-accent outline-none hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResending ? "Resending..." : resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col gap-5">

              {errorMsg && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 font-sans text-xs text-red-400">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 font-sans text-xs text-emerald-400">
                  {successMsg}
                </div>
              )}

              {activeTab === "register" ? (
                <div className="flex flex-col gap-5">

                  {/* Progress stepper */}
                  <div className="mb-6 border-b border-orbit-border/40 pb-5">
                    <div className="flex items-center justify-between gap-2">
                      {[
                        { n: 1, label: "Account" },
                        { n: 2, label: "Profile" },
                        { n: 3, label: "Preferences" },
                      ].map(({ n, label }, i) => {
                        const active = regStep === n;
                        const done = regStep > n;
                        return (
                          <React.Fragment key={n}>
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transition-all ${active ? "border-orbit-accent bg-orbit-accent text-white"
                                  : done ? "border-orbit-accent bg-orbit-accent/15 text-orbit-accent"
                                    : "border-orbit-border bg-white/[0.04] text-slate-400"
                                }`}>
                                {done ? <Check size={13} /> : n}
                              </span>
                              <span className={`hidden text-[11px] font-semibold sm:block ${active ? "text-white" : "text-slate-400"}`}>
                                {label}
                              </span>
                            </div>
                            {i < 2 && <div className={`mx-2.5 h-0.5 flex-1 rounded-full transition-all ${regStep > n ? "bg-orbit-accent" : "bg-orbit-border"}`} />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 1 — Account basics */}
                  {regStep === 1 && (
                    <div className="flex flex-col gap-4">
                      <TextInput icon={User} label="Username" required value={username}
                        onChange={(e) => setUsername(e.target.value)} placeholder="Choose a unique username" state={uState} />
                      <TextInput icon={Mail} label="Email address" required type="email" inputMode="email" value={email}
                        onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" state={eState}
                        hint={eState === "err" ? "Enter a valid email address." : null} />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <TextInput icon={Lock} label="Password" required password value={password}
                            onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" />
                          {password && (
                            <div className="mt-2">
                              <div className="flex gap-1.5">
                                {[1, 2, 3, 4].map((i) => (
                                  <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${pwBarColor(i, pw.score)}`} />
                                ))}
                              </div>
                              <div className="mt-1.5 flex justify-between text-[11px] text-orbit-gray-text">
                                <span>Password strength</span>
                                <span className={`font-semibold ${pwTextColor(pw.score)}`}>{pw.label}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <TextInput icon={Lock} label="Confirm" required password value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" state={cState}
                          hint={cState === "err" ? "Passwords don't match yet." : null} />
                      </div>
                      <div className="mt-1">
                        <button type="button" onClick={attemptNext} className="orb-button w-full py-4">
                          Continue <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 — Profile details */}
                  {regStep === 2 && (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <TextInput icon={User} label="First name" required value={firstName}
                          onChange={(e) => setFirstName(e.target.value)} placeholder="First name" state={fnState} />
                        <TextInput icon={User} label="Last name" required value={lastName}
                          onChange={(e) => setLastName(e.target.value)} placeholder="Last name" state={lnState} />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SelectInput label="Sex" required value={sex} onChange={(e) => setSex(e.target.value)}
                          state={sex !== "Select Gender" ? "ok" : "idle"}>
                          <option disabled value="Select Gender">Select gender</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </SelectInput>
                        <TextInput icon={Phone} label="Phone number" required type="tel" inputMode="tel" value={phone}
                          onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" state={phState} />
                      </div>
                      <div className="mt-1 flex gap-3">
                        <button type="button" onClick={goBackStep} className="orb-button-secondary py-4">
                          <ArrowLeft size={16} /> Back
                        </button>
                        <button type="button" onClick={attemptNext} className="orb-button flex-1 py-4">
                          Continue <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 — Preferences */}
                  {regStep === 3 && (
                    <div className="flex flex-col gap-4">
                      <SelectInput label="Account type" required value={accountType} onChange={(e) => setAccountType(e.target.value)}
                        state={accountType !== "Select Account Type" ? "ok" : "idle"}>
                        <option disabled value="Select Account Type">Select account tier</option>
                        <option value="Bronze">Bronze Tier (Standard)</option>
                        <option value="Silver">Silver Tier (Advanced)</option>
                        <option value="Gold">Gold Tier (Premium)</option>
                        <option value="Platinum">Platinum Tier (Elite)</option>
                        <option value="Diamond">Diamond Tier (Pro)</option>
                      </SelectInput>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SearchableCountrySelect
                          label="Country"
                          required
                          value={country}
                          onChange={(val) => setCountry(val)}
                          state={country && country !== "Choose Country" ? "ok" : "idle"}
                        />
                        <SelectInput label="Currency" required value={currency} onChange={(e) => setCurrency(e.target.value)}
                          state={currency !== "Select Currency" ? "ok" : "idle"}>
                          <option disabled value="Select Currency">Select currency</option>
                          {currenciesList.map((curr, idx) => <option key={idx} value={curr}>{curr}</option>)}
                        </SelectInput>
                      </div>

                      <label htmlFor="chk-terms" className="mt-1 flex cursor-pointer select-none items-start gap-2.5 text-xs leading-tight text-orbit-gray-text">
                        <input
                          type="checkbox"
                          id="chk-terms"
                          checked={checkedTerms}
                          onChange={(e) => setCheckedTerms(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-orbit-accent"
                        />
                        <span>
                          I accept the{" "}
                          <button type="button" onClick={() => onNavigate("terms")} className="text-orbit-accent hover:underline">Terms of Service</button>
                          {" "}and{" "}
                          <button type="button" onClick={() => onNavigate("privacy")} className="text-orbit-accent hover:underline">Privacy Policy</button>.
                        </span>
                      </label>

                      <div className="mt-1 flex gap-3">
                        <button type="button" onClick={goBackStep} className="orb-button-secondary py-4">
                          <ArrowLeft size={16} /> Back
                        </button>
                        <button type="submit" disabled={isSubmitting || (auth && !auth.ready)} className="orb-button flex-1 py-4 disabled:opacity-50 disabled:cursor-not-allowed">
                          {isSubmitting ? (
                            <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-orbit-bg/30 border-t-orbit-bg" />Creating…</>
                          ) : (<>Create account <ArrowRight size={16} /></>)}
                        </button>
                      </div>
                      <p className="text-center text-[11px] leading-tight text-orbit-gray-text">
                        A 6-digit code will confirm your email next.
                      </p>
                    </div>
                  )}

                  {/* Social + swap — shown on step 1 only to keep later steps focused */}
                  {regStep === 1 && (
                    <div className="pt-2 text-center text-xs text-orbit-gray-text">
                      Already have an account?{" "}
                      <button type="button" onClick={() => switchTab("login")} className="font-semibold text-orbit-accent hover:underline">
                        Sign in
                      </button>
                    </div>
                  )}
                </div>
              ) : showForgotPassword ? (
                /* Forgot Password recovery view */
                <div className="flex flex-col gap-5">
                  {forgotStep === "request" ? (
                    <>
                      <TextInput icon={Mail} label="Email address" type="email" inputMode="email" value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" />
                      <button type="submit" disabled={forgotLoading || (auth && !auth.ready)}
                        className="orb-button w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed">
                        {forgotLoading ? (
                          <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-orbit-bg/30 border-t-orbit-bg" />Processing…</>
                        ) : (<>Send reset code <ArrowRight size={16} /></>)}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <label className="block text-[11px] uppercase font-subheading tracking-wider text-orbit-gray-text">Reset code</label>
                        <input
                          aria-label="Reset code"
                          autoComplete="one-time-code"
                          type="text"
                          inputMode="numeric"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                          className="w-full rounded-xl border border-orbit-border/85 bg-orbit-bg px-4 py-3.5 text-center font-sans tracking-[0.4em] text-orbit-white outline-none transition-all focus:border-orbit-accent focus:ring-2 focus:ring-orbit-accent/15 tabular-nums"
                          required
                        />
                      </div>
                      <TextInput icon={Lock} label="New password" password value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
                      <button type="submit" disabled={forgotLoading || (auth && !auth.ready)}
                        className="orb-button w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed">
                        {forgotLoading ? (
                          <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-orbit-bg/30 border-t-orbit-bg" />Resetting…</>
                        ) : (<>Reset password &amp; sign in <ArrowRight size={16} /></>)}
                      </button>
                    </>
                  )}
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(false); setForgotStep("request"); setErrorMsg(null); setSuccessMsg(null); }}
                      className="cursor-pointer border-none bg-transparent text-xs font-semibold text-orbit-accent outline-none hover:underline"
                    >
                      ← Return to sign in
                    </button>
                  </div>
                </div>
              ) : (
                /* Login view */
                <div className="flex flex-col gap-5">
                  <TextInput icon={Mail} label="Email address" type="email" inputMode="email" value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" />
                  <TextInput icon={Lock} label="Password" password value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)} placeholder="Enter your password"
                    rightLabel={
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setErrorMsg(null); setSuccessMsg(null); }}
                        className="cursor-pointer border-none bg-transparent text-[11px] font-semibold text-orbit-accent outline-none hover:underline"
                      >
                        Forgot password?
                      </button>
                    }
                  />
                  <button type="submit" disabled={isSubmitting || (auth && !auth.ready)} className="orb-button mt-1 w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
                  </button>

                  <div className="pt-2 text-center text-xs text-orbit-gray-text">
                    Don't have an account yet?{" "}
                    <button type="button" onClick={() => switchTab("register")} className="font-semibold text-orbit-accent hover:underline">
                      Register now
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Support signpost */}
          <div className="mt-auto pt-8 text-center text-[11px] text-orbit-gray-text">
            Need assistance? <a href={`mailto:${appSettings.supportEmail}`} className="text-orbit-accent hover:underline">Contact support</a>
          </div>

        </section>
      </div>
    </div>
  );
};

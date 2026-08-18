"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, HeartIcon, ShieldIcon, UsersIcon } from "@/components/icons";

type DemoRole = "member" | "church" | "platform";

const roles = [
  { id: "member", label: "Member", route: "/dashboard", icon: HeartIcon },
  { id: "church", label: "Church admin", route: "/church", icon: UsersIcon },
  { id: "platform", label: "Platform admin", route: "/platform", icon: ShieldIcon },
] as const;

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = useState<DemoRole>("member");
  const route = roles.find((item) => item.id === role)?.route ?? "/dashboard";

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(route);
  }

  return (
    <form className="mt-7" onSubmit={signIn}>
      <fieldset>
        <legend className="mb-2 text-xs font-bold text-[var(--ink-soft)]">Preview as</legend>
        <div className="grid grid-cols-3 gap-2">
          {roles.map(({ id, icon: Icon, label }) => (
            <label className={`focus-within:ring-3 focus-within:ring-[var(--sage)]/20 cursor-pointer rounded-2xl border p-3 text-center transition ${role === id ? "border-[var(--sage)] bg-[var(--sage-pale)]" : "border-[var(--line)] bg-white hover:border-[#bdc8c2]"}`} key={id}>
              <input className="sr-only" checked={role === id} name="role" onChange={() => setRole(id)} type="radio" value={id} />
              <Icon className={`mx-auto ${role === id ? "text-[var(--sage)]" : "text-[var(--muted)]"}`} size={18} />
              <span className="mt-2 block text-[9px] font-bold">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-bold text-[var(--ink-soft)]">Email address</span>
        <input className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none placeholder:text-[#a0a9b4]" defaultValue="alicia.clarke@example.com" name="email" required type="email" />
      </label>
      <label className="mt-4 block">
        <span className="mb-2 flex items-center justify-between text-xs font-bold text-[var(--ink-soft)]"><span>Password</span><button className="text-[10px] text-[var(--sage)]" type="button">Forgot password?</button></span>
        <input className="focus-ring w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none" defaultValue="demo-password" minLength={8} name="password" required type="password" />
      </label>
      <button className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sage)] px-5 py-4 text-sm font-bold text-white transition hover:bg-[var(--sage-dark)]" type="submit">Open {roles.find((item) => item.id === role)?.label.toLowerCase()} demo <ArrowRightIcon size={17} /></button>
      <p className="mt-4 text-center text-[9px] leading-4 text-[var(--muted)]">Demo only. Supabase authentication will replace this preview hand-off when environment credentials are connected.</p>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { signIn, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export function LoginForm({ isConfigured }: { isConfigured: boolean }) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-9 space-y-5" aria-label="Ingreso a la plataforma">
      <label className="grid gap-2 text-sm font-medium" htmlFor="email">
        Correo electrónico
        <input
          className="h-12 rounded-sm border bg-paper px-3 text-base outline-none transition-colors placeholder:text-muted focus:border-jade"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@bears-helados.com"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium" htmlFor="password">
        Contraseña
        <span className="relative block">
          <input
            className="h-12 w-full rounded-sm border bg-paper px-3 pr-12 text-base outline-none transition-colors placeholder:text-muted focus:border-jade"
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Ingresá tu contraseña"
            required
          />
          <button
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-jade"
            type="button"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </span>
      </label>
      {state.error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{state.error}</p> : null}
      <button
        className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!isConfigured || isPending}
        type="submit"
      >
        {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isPending ? "Ingresando" : "Continuar"}
      </button>
      <Link className="flex h-11 items-center justify-center gap-2 rounded-sm border text-sm font-medium transition-colors hover:bg-surface" href="/demo">
        Explorar datos de demostración <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </form>
  );
}
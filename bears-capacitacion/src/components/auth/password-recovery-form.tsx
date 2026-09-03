"use client";

import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { requestPasswordReset, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export function PasswordRecoveryForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);

  return <form action={formAction} className="mt-8 space-y-5"><label className="grid gap-2 text-sm font-medium" htmlFor="recovery-email">Correo electrónico<input className="h-12 rounded-sm border bg-paper px-3 text-base outline-none focus:border-jade" id="recovery-email" name="email" type="email" autoComplete="email" required /></label>{state.error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{state.error}</p> : null}{state.success ? <p className="rounded-sm bg-[#E0F1EB] px-3 py-2 text-sm text-jade-deep" role="status">{state.success}</p> : null}<button className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isPending}>{isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{isPending ? "Enviando" : "Enviar enlace"}</button></form>;
}
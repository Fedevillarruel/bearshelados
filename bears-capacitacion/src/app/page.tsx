import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function Home() {
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[minmax(0,1.2fr)_minmax(440px,0.8fr)]">
      <section className="hidden bg-jade-deep px-12 py-10 text-paper lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-sm bg-paper p-1.5">
            <Image
              src="https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp"
              alt="Bears Helados"
              className="max-h-full max-w-full object-contain"
              width={32}
              height={32}
              priority
            />
          </span>
          <span className="text-sm font-medium">Bears Helados</span>
        </div>

        <div className="max-w-xl">
          <p className="font-tabular text-sm text-paper">PLATAFORMA INTERNA</p>
          <h1 className="mt-5 text-5xl font-medium leading-[1.05] tracking-normal">
            Aprender bien también es parte de servir mejor.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#E0F1EB]">
            Capacitación, estándares y herramientas para cada equipo Bears.
          </p>
        </div>

        <p className="text-xs text-[#AEAEA8]">Bears Helados, formación interna</p>
      </section>

      <section className="flex min-h-screen items-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-sm border bg-paper p-1.5">
              <Image
                src="https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp"
                alt="Bears Helados"
                className="max-h-full max-w-full object-contain"
                width={36}
                height={36}
                priority
              />
            </span>
            <span className="text-sm font-medium">Bears Helados</span>
          </div>
          <div>
            <h1 className="text-[31px] font-medium leading-tight tracking-normal">Ingresar</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Usá las credenciales asignadas por tu supervisor.
            </p>
          </div>
          <LoginForm isConfigured={isConfigured} />
          <Link className="mt-6 inline-block text-sm text-muted underline underline-offset-4 hover:text-ink" href="/recuperar-contrasena">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </section>
    </main>
  );
}
type Role = "admin" | "franquiciado" | "empleado";
type View = "dashboard" | "users" | "courses" | "manuals" | "franchises" | "team" | "learning" | "progress";

function ConfigurationRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <section className="max-w-md border-l-4 border-jade pl-5">
        <p className="text-sm font-medium text-jade-deep">Bears Helados</p>
        <h1 className="mt-3 text-2xl font-medium">La plataforma no está disponible</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Esta instalación necesita una conexión configurada antes de mostrar información operativa.</p>
      </section>
    </main>
  );
}

export function CoursePlayer() {
  return <ConfigurationRequired />;
}

export function PortalShell({ role, view }: { role: Role; view: View }) {
  return <div data-role={role} data-view={view}><ConfigurationRequired /></div>;
}
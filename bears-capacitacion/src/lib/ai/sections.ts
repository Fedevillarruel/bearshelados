export const aiSections = [
  { id: "resumen", label: "Resumen" },
  { id: "configuracion", label: "Personalidad" },
  { id: "conocimiento", label: "Conocimiento" },
  { id: "bandeja", label: "Bandeja" },
  { id: "conexiones", label: "Conexiones" },
  { id: "social", label: "Actividad social" },
  { id: "prueba", label: "Zona de prueba" },
] as const;

export type AISection = typeof aiSections[number]["id"];

export function getAISection(value: string | undefined): AISection | undefined {
  return aiSections.find((section) => section.id === value)?.id;
}

export function aiSectionHref(section: AISection) {
  return section === "resumen" ? "/admin/ia" : `/admin/ia?section=${section}`;
}

export function aiSectionKey(section: AISection) {
  return `ai-${section}`;
}

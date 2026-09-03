type ManualCategoryRelation = { name: string } | { name: string }[] | null;

export function manualCategoryName(category: ManualCategoryRelation) {
  return Array.isArray(category) ? category[0]?.name ?? null : category?.name ?? null;
}
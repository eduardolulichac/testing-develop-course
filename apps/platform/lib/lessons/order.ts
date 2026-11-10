export type LessonRef = {
  slug: string;
  titulo: string;
  moduloOrden: number;
  faseOrden: number;
  orden: number;
};

/** Sorts lessons in course order: phase, module, lesson. */
export function sortLessons<T extends LessonRef>(lessons: T[]): T[] {
  return [...lessons].sort(
    (a, b) => a.faseOrden - b.faseOrden || a.moduloOrden - b.moduloOrden || a.orden - b.orden,
  );
}

/** Previous and next lesson in course order, or null at the ends or when the slug is unknown. */
export function neighbours<T extends LessonRef>(sorted: T[], slug: string) {
  const i = sorted.findIndex((l) => l.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null };
}

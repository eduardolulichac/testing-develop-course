import type { MDXComponents } from "mdx/types";
import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AbrirArena } from "./abrir-arena";
import { Ejemplo, Ejercicio, ErrorComun, Objetivo, Paso, Resumen, Reto } from "./blocks";
import { headingId } from "@/lib/lessons/toc";
import { CopyPre } from "./copy-pre";
import { Quiz } from "./quiz";

type P<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Components available inside every lesson MDX, plus typography for plain Markdown. */
export const lessonComponents: MDXComponents = {
  Objetivo,
  Paso,
  Ejemplo,
  Ejercicio,
  Reto,
  Resumen,
  ErrorComun,
  Quiz,
  AbrirArena,
  h2: ({ children, ...props }: P<"h2">) => (
    <h2
      id={headingId(textOf(children))}
      className="mt-10 mb-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: (props: P<"h3">) => <h3 className="mt-6 mb-2 text-lg font-semibold" {...props} />,
  p: (props: P<"p">) => <p className="my-3 leading-7" {...props} />,
  ul: (props: P<"ul">) => <ul className="my-3 list-disc space-y-1 pl-6" {...props} />,
  ol: (props: P<"ol">) => <ol className="my-3 list-decimal space-y-1 pl-6" {...props} />,
  a: (props: P<"a">) => <a className="text-accent underline underline-offset-2" {...props} />,
  blockquote: (props: P<"blockquote">) => (
    <blockquote className="my-4 border-l-4 border-border pl-4 text-muted" {...props} />
  ),
  code: (props: P<"code">) => (
    <code className="rounded bg-accent-soft px-1 py-0.5 font-mono text-[0.9em]" {...props} />
  ),
  pre: CopyPre,
  table: (props: P<"table">) => (
    <div className="my-4 overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  th: (props: P<"th">) => (
    <th className="border border-border bg-surface px-3 py-2 font-semibold" {...props} />
  ),
  td: (props: P<"td">) => <td className="border border-border px-3 py-2" {...props} />,
};

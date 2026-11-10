"use client";

import type { ReactNode } from "react";
import { trackClient } from "./client";

/** Outbound link to the QA Arena that reports which scenario the student opened. */
export function ArenaLink({
  href,
  escenario,
  className,
  children,
}: {
  href: string;
  escenario: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="mdx-abrir-arena"
      className={className}
      onClick={() => trackClient("arena_opened", { escenario })}
    >
      {children}
    </a>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AbrirArena } from "./abrir-arena";
import { Ejercicio, ErrorComun, Objetivo, Paso, Resumen, Reto, Ejemplo } from "./blocks";
import { Quiz } from "./quiz";

afterEach(() => vi.unstubAllEnvs());

describe("lesson blocks", () => {
  it("render as labelled sections with an optional h3 title", () => {
    const html = renderToStaticMarkup(
      <>
        <Objetivo>Texto</Objetivo>
        <Paso numero={2} titulo="Segundo">
          x
        </Paso>
        <Ejemplo titulo="Ej">x</Ejemplo>
        <Reto titulo="R">x</Reto>
        <Resumen>x</Resumen>
        <ErrorComun titulo="E">x</ErrorComun>
      </>,
    );
    expect(html.match(/<section aria-labelledby=/g)).toHaveLength(6);
    expect(html).toContain("Paso 2");
    expect(html).toContain("<h3");
    expect(html).toContain("Error común");
  });

  it("Ejercicio renders escalating hints in <details>", () => {
    const html = renderToStaticMarkup(<Ejercicio pistas={["a", "b"]}>Haz algo</Ejercicio>);
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain("Pista 2 de 2");
  });
});

describe("Quiz", () => {
  const preguntas = [
    { pregunta: "¿Uno?", opciones: ["a", "b", "c"] },
    { pregunta: "¿Dos?", opciones: ["x", "y"] },
  ];

  it("presents each question as a fieldset of radios with labels, without correction", () => {
    const html = renderToStaticMarkup(<Quiz preguntas={preguntas} />);
    expect(html.match(/<fieldset/g)).toHaveLength(2);
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html.match(/<label/g)).toHaveLength(5);
    expect(html).not.toMatch(/correct|respuesta/i);
  });

  it("groups radios per question", () => {
    const html = renderToStaticMarkup(<Quiz preguntas={preguntas} />);
    const names = new Set([...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
    expect(names.size).toBe(2);
  });
});

describe("AbrirArena", () => {
  it("links to the Arena with the scenario parameter", () => {
    vi.stubEnv("NEXT_PUBLIC_ARENA_URL", "http://localhost:3300");
    const html = renderToStaticMarkup(<AbrirArena escenario="fase1-localizadores" />);
    expect(html).toContain('href="http://localhost:3300/?escenario=fase1-localizadores"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("degrades to a note when NEXT_PUBLIC_ARENA_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_ARENA_URL", "");
    const html = renderToStaticMarkup(<AbrirArena escenario="fase1-localizadores" />);
    expect(html).not.toContain("<a ");
    expect(html).toContain("no está disponible");
  });
});

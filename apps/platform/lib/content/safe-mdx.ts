/**
 * Remark plugin that makes lesson MDX data-only (review finding H4). `evaluate()` runs the body
 * inside the Next.js process, so an expression like `{process.env.SUPABASE_SECRET_KEY}` or an
 * `import`/`export` would execute with server privileges. Lessons are written by models and
 * arrive through PRs, so this is enforced in code instead of relying on review alone.
 *
 * Allowed: Markdown, JSX elements from the allow-list, and expressions made only of literals
 * (strings, numbers, booleans, null, arrays and plain objects of those), which is what
 * `<Quiz preguntas={[...]} />` needs. Everything else throws with the file position.
 */

type Node = {
  type: string;
  name?: string | null;
  value?: unknown;
  children?: Node[];
  attributes?: Node[];
  data?: { estree?: EstreeProgram | null };
  position?: { start: { line: number; column: number } };
};
type EstreeNode = { type: string; [key: string]: unknown };
type EstreeProgram = { type: "Program"; body: EstreeNode[] };

function where(node: Node): string {
  const start = node.position?.start;
  return start ? ` (línea ${start.line}, columna ${start.column})` : "";
}

function isLiteral(node: EstreeNode | null | undefined): boolean {
  if (!node) return false;
  switch (node.type) {
    case "Literal":
      // RegExp and BigInt literals are not data we want in lessons.
      return !("regex" in node) && !("bigint" in node);
    case "TemplateLiteral":
      return (node.expressions as EstreeNode[]).length === 0;
    case "UnaryExpression":
      return (
        (node.operator === "-" || node.operator === "+") &&
        isLiteral(node.argument as EstreeNode) &&
        (node.argument as EstreeNode).type === "Literal"
      );
    case "ArrayExpression":
      return (node.elements as (EstreeNode | null)[]).every((e) => e !== null && isLiteral(e));
    case "ObjectExpression":
      return (node.properties as EstreeNode[]).every(
        (p) =>
          p.type === "Property" &&
          p.kind === "init" &&
          !p.computed &&
          !p.method &&
          ((p.key as EstreeNode).type === "Identifier" ||
            (p.key as EstreeNode).type === "Literal") &&
          isLiteral(p.value as EstreeNode),
      );
    default:
      return false;
  }
}

function assertLiteralExpression(node: Node, what: string) {
  const estree = node.data?.estree;
  // Without a parsed program only an empty expression (`{}`) is harmless.
  const ok = estree
    ? // `{/* comment */}` parses to an empty program: harmless.
      estree.body.every(
        (s) => s.type === "ExpressionStatement" && isLiteral(s.expression as EstreeNode),
      )
    : String(node.value ?? "").trim() === "";
  if (!ok) throw new Error(`MDX no permitido: ${what} solo admite literales${where(node)}`);
}

/** Props that reach the DOM or React internals: never needed in a lesson (review H34). */
const FORBIDDEN_ATTRIBUTE = /^(dangerouslySetInnerHTML|style|ref|key|on[A-Z].*)$/;

export function safeMdx(allowedComponents: readonly string[]) {
  const allowed = new Set(allowedComponents);
  return () => (tree: Node) => {
    const visit = (node: Node) => {
      switch (node.type) {
        case "mdxjsEsm":
          throw new Error(`MDX no permitido: import/export${where(node)}`);
        case "mdxFlowExpression":
        case "mdxTextExpression":
          assertLiteralExpression(node, "una expresión");
          break;
        case "mdxJsxFlowElement":
        case "mdxJsxTextElement":
          if (!node.name || !allowed.has(node.name)) {
            throw new Error(
              `MDX no permitido: componente <${node.name ?? "fragmento"}>${where(node)}`,
            );
          }
          for (const attr of node.attributes ?? []) {
            if (attr.type === "mdxJsxExpressionAttribute") {
              throw new Error(`MDX no permitido: atributos con spread${where(node)}`);
            }
            if (FORBIDDEN_ATTRIBUTE.test(String(attr.name))) {
              throw new Error(`MDX no permitido: el atributo ${String(attr.name)}${where(node)}`);
            }
            const value = attr.value;
            if (value && typeof value === "object") {
              assertLiteralExpression(value as Node, `el atributo ${String(attr.name)}`);
            }
          }
          break;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

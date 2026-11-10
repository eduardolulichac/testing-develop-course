import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <PageHeader eyebrow="Error 404" title="No encontramos esta página">
      <Link href="/" className="text-accent underline underline-offset-4">
        Volver al inicio
      </Link>
    </PageHeader>
  );
}

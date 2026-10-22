import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink() {
  return (
    <Link href="/teacher/classes" className="inline-flex min-h-11 items-center gap-2 text-small font-semibold text-muted transition-colors duration-150 ease-out hover:text-ink">
      <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      Kembali ke kelas
    </Link>
  );
}

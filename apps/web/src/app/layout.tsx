import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["500", "600"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: { default: "NusaCodeAI", template: "%s · NusaCodeAI" },
  description: "Platform kelas koding & algoritma interaktif berbasis AI: materi visual, papan tulis kolaboratif, kuis, dan latihan soal blok & JavaScript.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} ${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

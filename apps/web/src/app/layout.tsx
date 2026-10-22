import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import { BoardBackground } from "@/components/board-background";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["500", "600"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: { default: "Adikara", template: "%s · Adikara" },
  description: "Ruang kelas interaktif: guru membuka sesi dengan PIN, siswa masuk dalam hitungan detik.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} ${poppins.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <BoardBackground />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

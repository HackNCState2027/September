import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tempo",
  description: "A fitness coach that remembers what matters, forgets what doesn't, and asks before it lets go.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="tempo-theme h-full">{children}</body>
    </html>
  );
}

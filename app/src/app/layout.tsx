import type { Metadata } from "next";
import "./globals.css";
import { PwaInstallPrompt } from "@/components/pwa/pwa-install-prompt";

export const metadata: Metadata = {
  title: {
    default: "Alienista",
    template: "%s | Alienista",
  },
  description: "Alienista · Association of Computer Scientists Attendance Management System · Palawan State University",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: { capable: true, title: "Alienista", statusBarStyle: "default" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}

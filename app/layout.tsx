import { ClerkProvider } from "@clerk/nextjs"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import localFont from "next/font/local"
import { AppShell } from "@/app/app-shell"
import { SIDEBAR_COOKIE_NAME } from "@/components/sidebar-preferences"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// Bundled Latin variable font: no external stylesheet or build-time download.
const geist = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist-sans",
  weight: "400 700",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
})

export const metadata: Metadata = {
  title: "Grov",
  description: "Grov Finance Manager",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const defaultSidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false"

  return (
    <ClerkProvider>
      <html lang="en" className={geist.variable}>
        <body>
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <AppShell defaultSidebarOpen={defaultSidebarOpen}>
            {children}
          </AppShell>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}

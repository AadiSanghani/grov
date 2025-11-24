import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Grov",
  description: "Grov Finance Manager",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Arvo:ital,wght@0,400;0,700;1,400;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SidebarProvider>
          <AppSidebar />
          <main className="flex-1 w-full overflow-auto">
            {children}
          </main>
        </SidebarProvider>
      </body>
    </html>
  )
}
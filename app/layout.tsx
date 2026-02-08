import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "@/components/ui/sonner"
import { DataProvider } from "@/app/data-context"
import type { Metadata } from "next"
import {
  ClerkProvider,
  SignedIn,
} from "@clerk/nextjs"
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
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Arvo:ital,wght@0,400;0,700;1,400;1,700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>
          <SignedIn>
            <DataProvider>
              <SidebarProvider>
                <AppSidebar />
                <main className="flex-1 w-full overflow-auto">
                  {children}
                </main>
              </SidebarProvider>
            </DataProvider>
          </SignedIn>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
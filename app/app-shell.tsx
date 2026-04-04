"use client"

import { SignedIn } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { DataProvider } from "@/app/data-context"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isPublicPath(pathname)) {
    return (
      <main id="main-content" className="w-full">
        {children}
      </main>
    )
  }

  return (
    <SignedIn>
      <DataProvider>
        <SidebarProvider>
          <AppSidebar />
          <main id="main-content" className="flex-1 w-full">
            {children}
          </main>
        </SidebarProvider>
      </DataProvider>
    </SignedIn>
  )
}

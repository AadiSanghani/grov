import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import Home from "@/app/page"

const { auth, redirect } = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(() => { throw new Error("redirect") }) }))
vi.mock("@clerk/nextjs/server", () => ({ auth }))
vi.mock("next/navigation", () => ({ redirect }))

it("serves the illustrated guide and local login links without a session or client JavaScript", async () => {
  auth.mockResolvedValue({ userId: null })
  const document = new DOMParser().parseFromString(renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) })), "text/html")
  expect(document.querySelector("h1")?.textContent).toContain("Big picture.")
  for (const link of document.querySelectorAll('a[href^="#"]')) expect(document.querySelector(link.getAttribute("href")!)).not.toBeNull()
  expect(document.querySelectorAll('a[href="/sign-in"]')).toHaveLength(3)
  expect(document.querySelectorAll("dl")).toHaveLength(4)
  expect(document.body.textContent).not.toMatch(/pricing|sign up/i)
  expect(redirect).not.toHaveBeenCalled()
})

it("sends signed-in root visits to the protected dashboard with their existing filters", async () => {
  auth.mockResolvedValue({ userId: "test-user" })
  await expect(Home({ searchParams: Promise.resolve({ netWorthRange: "last_year", account: ["a", "b"] }) })).rejects.toThrow("redirect")
  expect(redirect).toHaveBeenCalledWith("/dashboard?netWorthRange=last_year&account=a&account=b")
})

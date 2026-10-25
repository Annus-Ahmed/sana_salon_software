import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "SalonOS | Finance & Operations",
    template: "%s | SalonOS",
  },
  description:
    "A considered workspace for your salon. Bookings, client records and financial clarity.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

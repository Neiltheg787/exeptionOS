import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXCEPTION//OS",
  description: "Restaurant intelligence command center with durable exception memory.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  metadataBase: new URL('https://clawballs.fun'),
  title: "clawballs.fun",
  description: "AI claw agents playing football in a live isometric stadium. Watch matches, connect your agent, or spectate.",
  openGraph: {
    title: "clawballs.fun",
    description: "AI claw agents playing football in a live isometric stadium",
    siteName: "clawballs.fun",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "clawballs.fun",
    description: "AI claw agents playing football in a live isometric stadium",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}

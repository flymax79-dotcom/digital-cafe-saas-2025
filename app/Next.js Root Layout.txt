/**
 * RootLayout is mandatory in the Next.js App Router ('app' folder).
 * It defines the outermost HTML structure (<html> and <body>) that wraps all pages.
 */
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* The body tag must contain your application content.
        We apply base styling and ensure a minimum screen height.
      */}
      <body className="bg-gray-50 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const displayFont = Space_Grotesk({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'PilotBase — ранние пользователи',
  description: 'Мини-CRM для учета ранних пользователей перед запуском компании',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}

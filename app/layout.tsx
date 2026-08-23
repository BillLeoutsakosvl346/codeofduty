import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'Code of Duty — Engineering Revenue Intelligence',
  description:
    'Connect product usage, subscription revenue, and code ownership to measure engineering ARR impact.',
  openGraph: {
    title: 'Code of Duty — Engineering Revenue Intelligence',
    description: 'Ship code. Move revenue. Measure engineering ARR impact from usage and ownership.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Code of Duty — Ship code. Move revenue.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Code of Duty — Engineering Revenue Intelligence',
    description: 'Ship code. Move revenue. Measure engineering ARR impact from usage and ownership.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

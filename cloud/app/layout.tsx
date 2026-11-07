import type { Metadata } from 'next';
import { Signika } from 'next/font/google';
import './globals.css';

const signika = Signika({
  variable: '--font-signika',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://geomine-web.servidor185802.chatgpt.site'),
  title: 'GeoMine — acesso seguro',
  description: 'GeoMine Web: GIS, CAD e planejamento de mina em ambiente privado.',
  openGraph: {
    title: 'GeoMine',
    description: 'GIS · CAD · Planejamento de mina',
    images: [
      {
        url: '/geomine-social-preview.jpg',
        width: 1200,
        height: 630,
        alt: 'GeoMine — GIS, CAD e planejamento de mina',
      },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${signika.variable} antialiased`}>{children}</body>
    </html>
  );
}

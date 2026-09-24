import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pragnya Mitra — स्कूल प्रबंधन प्लेटफ़ॉर्म',
  description:
    'हर स्कूल के लिए अपना निजी डिजिटल पोर्टल — दाखिला-खारिज (स्कॉलर रजिस्टर), फीस चालान, दैनिक उपस्थिति, परीक्षा एवं रिपोर्ट कार्ड, अभिभावक अलर्ट। 7-दिन FREE TRIAL के साथ तुरंत शुरू करें — कोई approval नहीं।',
  openGraph: {
    title: 'Pragnya Mitra — स्कूल प्रबंधन प्लेटफ़ॉर्म',
    description:
      'हर स्कूल के लिए अपना निजी डिजिटल पोर्टल — 7-दिन FREE TRIAL के साथ तुरंत शुरू करें, कोई approval नहीं।',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pragnya Mitra — स्कूल प्रबंधन प्लेटफ़ॉर्म',
    description:
      'हर स्कूल के लिए अपना निजी डिजिटल पोर्टल — 7-दिन FREE TRIAL के साथ तुरंत शुरू करें, कोई approval नहीं।',
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="hi">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
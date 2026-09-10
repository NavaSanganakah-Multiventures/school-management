import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'VidyaSetu School Management App',
  description: 'उत्कृष्ट स्कूल प्रबंधन एवं प्रशासनिक CRM - स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ 3-रोल अनुमतियां, फीस चालान, दैनिक उपस्थिति एवं त्वरित अलर्ट।',
  openGraph: {
    title: 'VidyaSetu School Management App',
    description: 'उत्कृष्ट स्कूल प्रबंधन एवं प्रशासनिक CRM - स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ 3-रोल अनुमतियां, फीस चालान, दैनिक उपस्थिति एवं त्वरित अलर्ट।',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VidyaSetu School Management App',
    description: 'उत्कृष्ट स्कूल प्रबंधन एवं प्रशासनिक CRM - स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ 3-रोल अनुमतियां, फीस चालान, दैनिक उपस्थिति एवं त्वरित अलर्ट।',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

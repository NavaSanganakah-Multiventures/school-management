import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'प्रज्ञा मित्र स्कूल प्रबंधन (Pragnya Mitra)',
  description: 'प्रज्ञा मित्र — आधुनिक विद्यालय प्रबंधन एवं क्लाउड प्रशासनिक CRM। समर्पित स्कूल आइसोलेशन, जीरो-डीबी-कॉस्ट एज एन्वायर्नमेंट, स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ अनुमतियां एवं त्वरित अलर्ट।',
  openGraph: {
    title: 'प्रज्ञा मित्र स्कूल प्रबंधन (Pragnya Mitra)',
    description: 'प्रज्ञा मित्र — आधुनिक विद्यालय प्रबंधन एवं क्लाउड प्रशासनिक CRM। समर्पित स्कूल आइसोलेशन, जीरो-डीबी-कॉस्ट एज एन्वायर्नमेंट, स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ अनुमतियां एवं त्वरित अलर्ट।',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'प्रज्ञा मित्र स्कूल प्रबंधन (Pragnya Mitra)',
    description: 'प्रज्ञा मित्र — आधुनिक विद्यालय प्रबंधन एवं क्लाउड प्रशासनिक CRM। समर्पित स्कूल आइसोलेशन, जीरो-डीबी-कॉस्ट एज एन्वायर्नमेंट, स्कॉलर रजिस्टर (दाखिला-खारिज), निदेशक/प्रधानाचार्य/स्टाफ अनुमतियां एवं त्वरित अलर्ट।',
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

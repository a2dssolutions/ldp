import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google'; // Changed from GeistSans, GeistMono
import './globals.css';
import { AppLayout } from '@/components/layout/app-layout';
import { Toaster } from "@/components/ui/toaster";
// Removed: import { AIProvider } from '@genkit-ai/next';


const inter = Inter({ // Changed from GeistSans
  variable: '--font-inter', // Changed variable name
  subsets: ['latin'],
});

const robotoMono = Roboto_Mono({ // Changed from GeistMono
  variable: '--font-roboto-mono', // Changed variable name
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Demand Insights Hub',
  description: 'Visualize and analyze demand data effectively.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${robotoMono.variable} font-sans antialiased`}>
        {/* <AIProvider> Removed provider wrapper */}
          <AppLayout>
            {children}
          </AppLayout>
          <Toaster />
        {/* </AIProvider> Removed provider wrapper */}
      </body>
    </html>
  );
}

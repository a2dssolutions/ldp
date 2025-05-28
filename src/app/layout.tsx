
import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google'; 
import './globals.css';
import { AppLayout } from '@/components/layout/app-layout';
import { Toaster } from "@/components/ui/toaster";
import { getAppSettingsAction } from '@/lib/actions'; // To fetch theme for initial render


const inter = Inter({ 
  variable: '--font-inter', 
  subsets: ['latin'],
});

const robotoMono = Roboto_Mono({ 
  variable: '--font-roboto-mono', 
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Demand Insights Hub',
  description: 'Visualize and analyze demand data effectively.',
};

export default async function RootLayout({ // Make RootLayout async
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appSettings = await getAppSettingsAction();
  const initialTheme = appSettings.theme;

  return (
    <html lang="en" suppressHydrationWarning className={initialTheme === 'dark' ? 'dark' : ''}>
      <body className={`${inter.variable} ${robotoMono.variable} font-sans antialiased`}>
          <AppLayout>
            {children}
          </AppLayout>
          <Toaster />
      </body>
    </html>
  );
}

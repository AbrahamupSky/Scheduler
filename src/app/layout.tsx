import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Auto Scheduler',
  description: 'Auto Scheduler',
};

// Runs before React hydrates — no flash of wrong theme
const themeScript = `(function(){
  var mq=window.matchMedia('(prefers-color-scheme: dark)');
  function apply(dark){
    document.documentElement.classList.toggle('dark',dark);
  }
  apply(mq.matches);
  mq.addEventListener('change',function(e){apply(e.matches);});
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

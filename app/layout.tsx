import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { AuthProvider } from './providers/AuthProvider';
import { ScreenShareProvider } from './providers/ScreenShareProvider';

export const metadata: Metadata = {
  title: 'Portal za prenos ekrana i saradnju',
  description: 'Zvanični portal za brzi prenos ekrana, saradnju i rad u realnom vremenu.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>
          <ScreenShareProvider>
            {children}
          </ScreenShareProvider>
        </AuthProvider>
      </body>
    </html>
  );
}


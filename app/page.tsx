'use client';

import dynamic from 'next/dynamic';

const AuthGate = dynamic(() => import('./auth-gate'), { ssr: false });

export default function Home() {
  return <AuthGate />;
}

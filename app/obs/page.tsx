import dynamic from 'next/dynamic';

const ObsClient = dynamic(() => import('./obs-client'), { ssr: false });

export default function ObsPage() {
  return <ObsClient />;
}

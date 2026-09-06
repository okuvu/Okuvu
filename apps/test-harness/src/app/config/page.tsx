import AuthenticatedShell from '@/app/components/AuthenticatedShell';
import ConfigRegistryClient from './_components/ConfigRegistryClient';

export default function ConfigPage() {
  return (
    <AuthenticatedShell>
      <ConfigRegistryClient />
    </AuthenticatedShell>
  );
}

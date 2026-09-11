import { RegistrationDetailClient } from './registration-detail-client';

export default async function RegistrationDetailPage({ params }: PageProps<'/admin/registrations/[id]'>) {
  const { id } = await params;
  return <RegistrationDetailClient id={id} />;
}

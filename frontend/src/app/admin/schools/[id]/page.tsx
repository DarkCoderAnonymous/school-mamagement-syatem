import { SchoolDetailClient } from './school-detail-client';

export default async function SchoolDetailPage({ params }: PageProps<'/admin/schools/[id]'>) {
  const { id } = await params;
  return <SchoolDetailClient id={id} />;
}

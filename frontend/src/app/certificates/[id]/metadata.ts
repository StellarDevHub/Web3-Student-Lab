import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = params.id;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

  return {
    title: `Certificate #${id} | Web3 Student Lab`,
    description: 'Blockchain-verified certificate of completion on the Stellar network.',
    openGraph: {
      title: `Certificate #${id}`,
      description: 'Blockchain-verified certificate of completion on the Stellar network.',
      images: [`${baseUrl}/api/og/certificates/${id}`],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Certificate #${id}`,
      images: [`${baseUrl}/api/og/certificates/${id}`],
    },
  };
}

export default function CertificateLayout({ children }: { children: React.ReactNode }) {
  return children;
}

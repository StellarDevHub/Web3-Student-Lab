import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Web3 Student Lab',
    short_name: 'Web3Lab',
    description: 'An open-source educational platform for Web3, smart contracts, and Stellar development.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09111d',
    theme_color: '#dc2626',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // 브릿지 URL·쿼리가 외부(비즈챗 이후 이동처 등)로 새지 않게
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // 가맹점 정보가 담긴 화면이라 중간 캐시/뒤로가기 캐시에 남기지 않는다
        source: '/bridge/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig

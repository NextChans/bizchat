import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker 이미지용 최소 실행 번들(.next/standalone)
  output: 'standalone',
  // next/image 를 쓰지 않는다. sharp(아키텍처별 네이티브 모듈)를 번들에서 빼서
  // standalone 을 순수 JS 로 유지 → amd64 에서 빌드한 결과를 arm64 이미지에도 그대로 쓴다
  images: { unoptimized: true },
  outputFileTracingExcludes: { '*': ['node_modules/sharp/**', 'node_modules/@img/**'] },
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

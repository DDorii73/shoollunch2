import { defineConfig } from 'vite';

export default defineConfig({
  // 공개 경로 설정 (Netlify 배포 시)
  base: '/',
  
  // 빌드 설정
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // 빌드 크기 경고 제한 증가
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: './index.html',
        student: './student.html',
        recordManagement: './recordManagement.html',
        teacherMonitor: './teacherMonitor.html'
      },
      output: {
        // 청크 파일명 설정 (Firebase 모듈 분리)
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  
  // 개발 서버 설정
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/neis': {
        target: 'https://open.neis.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/neis/, '/hub/mealServiceDietInfo')
      }
    }
  },
  
  // 최적화 설정
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage']
  },
  
  // Firebase 호환성 설정
  resolve: {
    alias: {
      // Firebase 모듈 해결을 위한 별칭 (필요시)
    }
  }
});


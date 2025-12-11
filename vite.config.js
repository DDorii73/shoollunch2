import { defineConfig } from 'vite';

export default defineConfig({
  // 빌드 설정
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: './index.html',
        student: './student.html',
        recordManagement: './recordManagement.html',
        teacherMonitor: './teacherMonitor.html'
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
  // 공개 경로 설정 (Netlify 배포 시)
  base: '/',
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


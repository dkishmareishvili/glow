import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import typegpu from 'unplugin-typegpu/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/glow/',
  plugins: [
    typegpu({ include: [/\.tsx?$/] }),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
})

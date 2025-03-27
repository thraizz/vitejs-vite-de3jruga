import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server:{ 
    allowedHosts: ['a4e1-78-35-145-34.ngrok-free.app']
  },
  plugins: [react()],
})

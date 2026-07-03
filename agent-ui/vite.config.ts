import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/createAgentSpace': 'http://127.0.0.1:8080',
      '/listAgentSpaces': 'http://127.0.0.1:8080',
      '/getAgentSpace': 'http://127.0.0.1:8080',
      '/deleteAgentSpace': 'http://127.0.0.1:8080',
      '/createConversation': 'http://127.0.0.1:8080',
      '/listConversations': 'http://127.0.0.1:8080',
      '/getConversation': 'http://127.0.0.1:8080',
      '/createTurn': 'http://127.0.0.1:8080',
      '/getTurn': 'http://127.0.0.1:8080',
      '/createTask': 'http://127.0.0.1:8080',
      '/getTask': 'http://127.0.0.1:8080',
      '/listTasks': 'http://127.0.0.1:8080',
      '/respondToTask': 'http://127.0.0.1:8080',
      '/listRecords': 'http://127.0.0.1:8080',
      '/listArtifacts': 'http://127.0.0.1:8080',
      '/getArtifact': 'http://127.0.0.1:8080',
      '/createDocument': 'http://127.0.0.1:8080',
      '/listDocuments': 'http://127.0.0.1:8080',
      '/getDocument': 'http://127.0.0.1:8080',
      '/deleteDocument': 'http://127.0.0.1:8080',
      '/healthz': 'http://127.0.0.1:8080',
    },
  },
});

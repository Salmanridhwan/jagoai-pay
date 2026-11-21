import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Data pembayaran gampang basi; jangan pernah disajikan dari cache tanpa pengecekan.
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (jumlah, err: any) => (err?.status === 401 ? false : jumlah < 1),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import './index.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';

// 4xx answers are final (forbidden, not found, validation): retrying only delays the message.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        const status = (error as { response?: { status?: number } }).response?.status;
        return (!status || status >= 500) && count < 2;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

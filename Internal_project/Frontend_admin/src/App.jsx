import { Toaster } from 'react-hot-toast';
import AppRoutes from './routes/AppRoutes.jsx';

const App = () => {
  return (
    <>
      <AppRoutes />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#0f1f3d',
            color: '#f8fbff',
            border: '1px solid rgba(255, 255, 255, 0.14)',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#0fb37a',
              secondary: '#f8fbff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f8fbff',
            },
          },
        }}
      />
    </>
  );
};

export default App;
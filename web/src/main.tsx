import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces/opsz.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { SemoraProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
      <BrowserRouter>
        <SemoraProvider>
          <App />
        </SemoraProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);

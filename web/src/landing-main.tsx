import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import './styles.css';
import { initTheme } from './theme';
import { Landing } from './pages/Landing';

initTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Landing signedIn={false} appOrigin={window.location.origin}/></BrowserRouter></StrictMode>);

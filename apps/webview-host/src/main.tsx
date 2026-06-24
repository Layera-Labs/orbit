import ReactDOM from 'react-dom/client';
import App from './App';

// StrictMode omitted — its dev-only double-mount races with Konva's imperative
// setup (matches apps/studio).
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

import ReactDOM from 'react-dom/client';
import App from './App';

// NOTE: StrictMode is intentionally omitted — its dev-only double-mount
// races with Konva/ResizeObserver imperative setup (e.g. zoom-to-fit).
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

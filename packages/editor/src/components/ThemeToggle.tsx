import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      className="o-home"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      onClick={toggleTheme}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ display: 'grid', placeItems: 'center' }}
        >
          {theme === 'dark' ? <Moon size={18} strokeWidth={1.9} /> : <Sun size={18} strokeWidth={1.9} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

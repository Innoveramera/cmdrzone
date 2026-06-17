import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// No StrictMode: its double-mount in dev would spawn (then dispose) a duplicate PTY per terminal.
createRoot(document.getElementById('root')!).render(<App />)

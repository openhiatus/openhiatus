import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './standard-conversation.css';
import './providers.css';
import './computer-preview.css';
import './presence.css';
import './features/navigation/index.css';
import './features/tasks/index.css';
import './features/settings/index.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

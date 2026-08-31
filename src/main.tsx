import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './ErrorBoundary'
import { SmoothScroll } from './components/motion/SmoothScroll'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <SmoothScroll>
          <App />
        </SmoothScroll>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

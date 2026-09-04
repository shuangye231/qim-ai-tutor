import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

localStorage.removeItem('theme')
document.documentElement.dataset.theme = 'forest'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

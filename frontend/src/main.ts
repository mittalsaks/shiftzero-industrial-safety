import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import './App.css'

// Yahan humne ID ko direct string mein hardcode kar diya hai
console.log('ALL ENVS:', import.meta.env)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')!).render(
  React.createElement(React.StrictMode, null,
    React.createElement(GoogleOAuthProvider, { clientId: GOOGLE_CLIENT_ID },
      React.createElement(App, null)
    )
  )
)
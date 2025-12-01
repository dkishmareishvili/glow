import { SunburstGlow } from './components/SunburstGlow'
import khachapuriImage from './assets/bb.jpg'
import './App.css'

function App() {
  return (
    <div className="app-container">
    
      <p className="subtitle">WebGPU-powered glow effect using TypeGPU</p>
      <SunburstGlow
        imageSrc={khachapuriImage}
        maxWidth={800}
      />
    </div>
  )
}

export default App

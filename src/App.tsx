// import { SunburstGlow } from './components/SunburstGlow'
import khachapuriImage from "./assets/bb.jpg";
import "./App.css";
import { SunburstGlowWebGL2 } from "./components/SunburstGlowWebGL2";

function App() {
  return (
    <div className="app-container">
      <SunburstGlowWebGL2 imageSrc={khachapuriImage} maxWidth={800} />
    </div>
  );
}

export default App;

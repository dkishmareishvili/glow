import kp from "./assets/kp.avif";
import "./App.css";
import { SunburstGlowWebGL2 } from "./components/SunburstGlowWebGL2";
import { Item } from "./components/Item";

function App() {
  return (
    <div className="app-container">
      <Item imageSrc={kp} maxWidth={720} />
      <br />
      <SunburstGlowWebGL2 imageSrc={kp} maxWidth={800} />
    </div>
  );
}

export default App;

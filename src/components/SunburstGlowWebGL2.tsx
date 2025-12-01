import { useEffect, useRef, useState } from "react";

interface SunburstGlowWebGL2Props {
  imageSrc: string;
  maxWidth?: number;
}

// ============================================================================
// SHADER CONSTANTS - Must match SunburstGlow.tsx
// ============================================================================

const YOLK_CENTER_X = 0.501;
const YOLK_CENTER_Y = 0.46;
const YOLK_RADIUS = 0.055;

const RAY_COUNT = 10;
const RAY_POWER = 0.01; // Lower = wider/broader rays
const RAY_INTENSITY = 0.8;

const WAVE_SPEED = 0.3;
const WAVE_FREQUENCY = 40.0;

const WAVE1_AMPLITUDE = 0.3;
const WAVE1_BASE = 0.4;
const WAVE1_SPEED_MULT = 9.0;
const WAVE1_BLEND = 0.6;

const WAVE2_AMPLITUDE = 0.2;
const WAVE2_BASE = 0.8;
const WAVE2_SPEED_MULT = 2.5;
const WAVE2_FREQ_MULT = 0.5;
const WAVE2_PHASE_OFFSET = 1.5;
const WAVE2_BLEND = 0.4;

const RAY_WAVE_BLEND = 0.6;
const WAVE_ONLY_BLEND = 0.15;

const GLOW_FALLOFF_RATE = 1.0;
const GLOW_INTENSITY = 0.4;

const OUTER_PULSE_FREQ = 1.2;
const OUTER_PULSE_AMPLITUDE = 0.1;
const OUTER_PULSE_BASE = 0.9;

const BLOOM_FALLOFF_RATE = 10.0;
const BLOOM_INTENSITY = 0.15;

const INNER_GLOW_INTENSITY = 0.1;
const INNER_GLOW_PULSE_SPEED = 0.5;
const INNER_GLOW_PULSE_AMOUNT = 0.3;

const GLOW_COLOR_R = 1.0;
const GLOW_COLOR_G = 0.75;
const GLOW_COLOR_B = 0.3;

// ============================================================================
// GLSL SHADERS
// ============================================================================

const VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  // Fullscreen triangle positions
  vec2 positions[6] = vec2[6](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0)
  );

  vec2 uvs[6] = vec2[6](
    vec2(0.0, 1.0),
    vec2(1.0, 1.0),
    vec2(0.0, 0.0),
    vec2(0.0, 0.0),
    vec2(1.0, 1.0),
    vec2(1.0, 0.0)
  );

  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
  vUv = uvs[gl_VertexID];
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uYolkCenter;
uniform float uYolkRadius;
uniform float uRayCount;
uniform float uGlowIntensity;
uniform float uAspectRatio;
uniform vec3 uGlowColor;
uniform sampler2D uTexture;

in vec2 vUv;
out vec4 fragColor;

// Constants (using toFixed to ensure float format in GLSL)
const float RAY_POWER = ${RAY_POWER.toFixed(4)};
const float RAY_INTENSITY = ${RAY_INTENSITY.toFixed(4)};
const float WAVE_SPEED = ${WAVE_SPEED.toFixed(4)};
const float WAVE_FREQUENCY = ${WAVE_FREQUENCY.toFixed(4)};
const float WAVE1_AMPLITUDE = ${WAVE1_AMPLITUDE.toFixed(4)};
const float WAVE1_BASE = ${WAVE1_BASE.toFixed(4)};
const float WAVE1_SPEED_MULT = ${WAVE1_SPEED_MULT.toFixed(4)};
const float WAVE1_BLEND = ${WAVE1_BLEND.toFixed(4)};
const float WAVE2_AMPLITUDE = ${WAVE2_AMPLITUDE.toFixed(4)};
const float WAVE2_BASE = ${WAVE2_BASE.toFixed(4)};
const float WAVE2_SPEED_MULT = ${WAVE2_SPEED_MULT.toFixed(4)};
const float WAVE2_FREQ_MULT = ${WAVE2_FREQ_MULT.toFixed(4)};
const float WAVE2_PHASE_OFFSET = ${WAVE2_PHASE_OFFSET.toFixed(4)};
const float WAVE2_BLEND = ${WAVE2_BLEND.toFixed(4)};
const float RAY_WAVE_BLEND = ${RAY_WAVE_BLEND.toFixed(4)};
const float WAVE_ONLY_BLEND = ${WAVE_ONLY_BLEND.toFixed(4)};
const float GLOW_FALLOFF_RATE = ${GLOW_FALLOFF_RATE.toFixed(4)};
const float OUTER_PULSE_FREQ = ${OUTER_PULSE_FREQ.toFixed(4)};
const float OUTER_PULSE_AMPLITUDE = ${OUTER_PULSE_AMPLITUDE.toFixed(4)};
const float OUTER_PULSE_BASE = ${OUTER_PULSE_BASE.toFixed(4)};
const float BLOOM_FALLOFF_RATE = ${BLOOM_FALLOFF_RATE.toFixed(4)};
const float BLOOM_INTENSITY = ${BLOOM_INTENSITY.toFixed(4)};
const float INNER_GLOW_INTENSITY = ${INNER_GLOW_INTENSITY.toFixed(4)};
const float INNER_GLOW_PULSE_SPEED = ${INNER_GLOW_PULSE_SPEED.toFixed(4)};
const float INNER_GLOW_PULSE_AMOUNT = ${INNER_GLOW_PULSE_AMOUNT.toFixed(4)};

float radiatingRays(vec2 uv, vec2 center, float time, float rayCount, float dist, float yolkRadius) {
  vec2 dir = uv - center;
  float angle = atan(dir.y, dir.x);

  // Distance from yolk edge (rays start from contour, not center)
  float edgeDist = max(0.0, dist - yolkRadius);

  // Wave 1 - main radiating pulse (from edge)
  float wave1 = sin(edgeDist * WAVE_FREQUENCY - time * WAVE_SPEED * WAVE1_SPEED_MULT) * WAVE1_AMPLITUDE + WAVE1_BASE;

  // Wave 2 - secondary pulse (from edge)
  float wave2 = sin(edgeDist * WAVE_FREQUENCY * WAVE2_FREQ_MULT - time * WAVE_SPEED * WAVE2_SPEED_MULT + WAVE2_PHASE_OFFSET) * WAVE2_AMPLITUDE + WAVE2_BASE;

  // Combine waves into circular glow (no angular rays)
  float radiatingWave = wave1 * WAVE1_BLEND + wave2 * WAVE2_BLEND;

  return radiatingWave * RAY_INTENSITY;
}

float glowFalloff(float dist, float yolkRadius) {
  float effectiveDist = max(0.0, dist - yolkRadius);
  return exp(-effectiveDist * GLOW_FALLOFF_RATE);
}

void main() {
  // Sample original image
  vec4 originalColor = texture(uTexture, vUv);

  // Calculate distance from yolk center with aspect ratio correction
  vec2 toYolk = vUv - uYolkCenter;
  vec2 correctedToYolk = vec2(toYolk.x * uAspectRatio, toYolk.y);
  float dist = length(correctedToYolk);

  // Calculate radiating sunburst rays (aspect-corrected UV)
  vec2 correctedUV = vec2(vUv.x * uAspectRatio, vUv.y);
  vec2 correctedCenter = vec2(uYolkCenter.x * uAspectRatio, uYolkCenter.y);
  float rayIntensity = radiatingRays(correctedUV, correctedCenter, uTime, uRayCount, dist, uYolkRadius);

  // Calculate glow falloff
  float falloff = glowFalloff(dist, uYolkRadius);

  // Subtle overall pulse
  float pulse = sin(uTime * OUTER_PULSE_FREQ) * OUTER_PULSE_AMPLITUDE + OUTER_PULSE_BASE;

  // Mask: 0 inside yolk, 1 outside (hide glow inside yolk area)
  float outsideYolk = step(uYolkRadius, dist);

  // Combine ray pattern with falloff
  float glowStrength = rayIntensity * falloff * uGlowIntensity * pulse * outsideYolk;

  // Warm glow color contribution
  vec3 glowContribution = uGlowColor * glowStrength;

  // Subtle bloom halo near yolk edge
  float bloomDist = max(0.0, dist - uYolkRadius);
  float bloom = exp(-bloomDist * BLOOM_FALLOFF_RATE) * BLOOM_INTENSITY * pulse * outsideYolk;
  vec3 bloomColor = uGlowColor * bloom;

  // Inner yolk glow - subtle pulsing luminosity inside the yolk
  float insideYolk = 1.0 - outsideYolk;
  float innerPulse = sin(uTime * INNER_GLOW_PULSE_SPEED) * INNER_GLOW_PULSE_AMOUNT + (1.0 - INNER_GLOW_PULSE_AMOUNT);
  float innerGlow = INNER_GLOW_INTENSITY * innerPulse * insideYolk;
  vec3 innerGlowColor = uGlowColor * innerGlow;

  // Final color
  fragColor = vec4(
    originalColor.rgb + glowContribution + bloomColor + innerGlowColor,
    originalColor.a
  );
}
`;

// ============================================================================
// WEBGL2 HELPERS
// ============================================================================

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

// ============================================================================
// REACT COMPONENT
// ============================================================================

export function SunburstGlowWebGL2({
  imageSrc,
  maxWidth = 800,
}: SunburstGlowWebGL2Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    let destroyed = false;
    let animationId: number | null = null;
    let gl: WebGL2RenderingContext | null = null;

    async function init() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        // Get WebGL2 context
        gl = canvas.getContext("webgl2", {
          alpha: true,
          premultipliedAlpha: true,
        });

        if (!gl) {
          setError("WebGL2 is not supported");
          setIsLoading(false);
          return;
        }

        // Load the image
        const response = await fetch(imageSrc);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        if (destroyed) return;

        // Calculate canvas dimensions
        const imageAspect = imageBitmap.width / imageBitmap.height;
        const canvasWidth = Math.min(imageBitmap.width, maxWidth);
        const canvasHeight = canvasWidth / imageAspect;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        setDimensions({ width: canvasWidth, height: canvasHeight });

        // Compile shaders
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = compileShader(
          gl,
          gl.FRAGMENT_SHADER,
          FRAGMENT_SHADER
        );

        if (!vertexShader || !fragmentShader) {
          setError("Failed to compile shaders");
          setIsLoading(false);
          return;
        }

        // Create program
        const program = createProgram(gl, vertexShader, fragmentShader);
        if (!program) {
          setError("Failed to create program");
          setIsLoading(false);
          return;
        }

        // Get uniform locations
        const uniforms = {
          uTime: gl.getUniformLocation(program, "uTime"),
          uYolkCenter: gl.getUniformLocation(program, "uYolkCenter"),
          uYolkRadius: gl.getUniformLocation(program, "uYolkRadius"),
          uRayCount: gl.getUniformLocation(program, "uRayCount"),
          uGlowIntensity: gl.getUniformLocation(program, "uGlowIntensity"),
          uAspectRatio: gl.getUniformLocation(program, "uAspectRatio"),
          uGlowColor: gl.getUniformLocation(program, "uGlowColor"),
          uTexture: gl.getUniformLocation(program, "uTexture"),
        };

        // Create texture
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          imageBitmap
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create VAO (required for WebGL2 even with gl_VertexID)
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        setIsLoading(false);

        // Animation loop
        const startTime = performance.now();

        function render() {
          if (destroyed || !gl || !canvas) return;

          const currentTime = (performance.now() - startTime) / 1000;

          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);

          gl.useProgram(program);

          // Set uniforms
          gl.uniform1f(uniforms.uTime, currentTime);
          gl.uniform2f(uniforms.uYolkCenter, YOLK_CENTER_X, YOLK_CENTER_Y);
          gl.uniform1f(uniforms.uYolkRadius, YOLK_RADIUS);
          gl.uniform1f(uniforms.uRayCount, RAY_COUNT);
          gl.uniform1f(uniforms.uGlowIntensity, GLOW_INTENSITY);
          gl.uniform1f(uniforms.uAspectRatio, imageAspect);
          gl.uniform3f(
            uniforms.uGlowColor,
            GLOW_COLOR_R,
            GLOW_COLOR_G,
            GLOW_COLOR_B
          );

          // Bind texture
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(uniforms.uTexture, 0);

          // Draw fullscreen quad
          gl.drawArrays(gl.TRIANGLES, 0, 6);

          animationId = requestAnimationFrame(render);
        }

        render();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      }
    }

    init();

    return () => {
      destroyed = true;
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [imageSrc, maxWidth]);

  if (error) {
    return (
      <img
        src={imageSrc}
        alt=""
        style={{
          display: "block",
          maxWidth: maxWidth,
          width: "100%",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      />
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#666",
          }}
        >
          Loading...
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          display: "block",
          maxWidth: "100%",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      />
    </div>
  );
}

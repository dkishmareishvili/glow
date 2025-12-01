import { useEffect, useRef, useState } from "react";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

interface SunburstGlowProps {
  imageSrc: string;
  maxWidth?: number;
}

// ============================================================================
// SHADER CONSTANTS - Tweak these to adjust the glow effect
// ============================================================================

// Yolk position and size (UV coordinates, 0-1 range)
const YOLK_CENTER_X = 0.5;
const YOLK_CENTER_Y = 0.46;
const YOLK_RADIUS = 0.05;

// Ray appearance
const RAY_COUNT = 10;
const RAY_POWER = 1.5; // Higher = sharper rays, lower = broader rays
const RAY_INTENSITY = 0.9; // Base ray brightness

// Wave animation
const WAVE_SPEED = 1.5; // Speed of radiating waves
const WAVE_FREQUENCY = 40.0; // Frequency of wave pattern

// Wave 1 (main pulse)
const WAVE1_AMPLITUDE = 0.3; // Intensity variation
const WAVE1_BASE = 0.4; // Base brightness
const WAVE1_SPEED_MULT = 4.0; // Speed multiplier
const WAVE1_BLEND = 0.6; // Blend weight

// Wave 2 (secondary pulse)
const WAVE2_AMPLITUDE = 0.2;
const WAVE2_BASE = 0.8;
const WAVE2_SPEED_MULT = 2.5;
const WAVE2_FREQ_MULT = 0.5; // Frequency relative to main wave
const WAVE2_PHASE_OFFSET = 1.5;
const WAVE2_BLEND = 0.4;

// Ray + wave combination
const RAY_WAVE_BLEND = 0.6; // How much rays affect the pattern
const WAVE_ONLY_BLEND = 0.15; // Base wave visibility without rays

// Glow falloff
const GLOW_FALLOFF_RATE = 4.0; // How quickly glow fades with distance
const GLOW_INTENSITY = 0.7; // Overall glow brightness

// Outer pulse
const OUTER_PULSE_FREQ = 1.2;
const OUTER_PULSE_AMPLITUDE = 0.1;
const OUTER_PULSE_BASE = 0.9;

// Bloom halo
const BLOOM_FALLOFF_RATE = 10.0; // How quickly bloom fades
const BLOOM_INTENSITY = 0.05; // Bloom brightness

// Inner yolk glow (the yolk glows as a whole before rays start)
const INNER_GLOW_INTENSITY = 0.1; // Very subtle inner glow
const INNER_GLOW_PULSE_SPEED = 0.8; // Slow pulse
const INNER_GLOW_PULSE_AMOUNT = 0.3; // How much the glow pulses (0-1)

// Glow color (RGB, 0-1 range)
const GLOW_COLOR_R = 1.0;
const GLOW_COLOR_G = 0.75;
const GLOW_COLOR_B = 0.3;

// ============================================================================
// GPU SHADER CODE
// ============================================================================

// Uniforms struct definition
const Uniforms = d.struct({
  time: d.f32,
  yolkCenter: d.vec2f,
  yolkRadius: d.f32,
  rayCount: d.f32,
  glowIntensity: d.f32,
  aspectRatio: d.f32,
  glowColor: d.vec3f,
});

// Vertex output struct
const VertexOutput = {
  position: d.builtin.position,
  uv: d.vec2f,
};

// Define bind group layout with proper texture schema
const textureSchema = d.texture2d(d.f32);

const layout = tgpu.bindGroupLayout({
  uniforms: { uniform: Uniforms },
  imageSampler: { sampler: "filtering" },
  imageTexture: { texture: textureSchema },
});

// Radiating sunburst rays function (TypeScript with 'use gpu')
const radiatingRays = tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32],
  d.f32
)((uv, center, time, rayCount, dist, yolkRadius) => {
  "use gpu";
  const dir = std.sub(uv, center);
  const angle = std.atan2(dir.y, dir.x);

  // Distance from yolk edge (rays start from contour, not center)
  const edgeDist = std.max(0.0, std.sub(dist, yolkRadius));

  // Angular rays - RAY_POWER controls width (lower = broader)
  const rays = std.mul(
    std.pow(std.max(0.0, std.sin(std.mul(angle, rayCount))), RAY_POWER),
    RAY_INTENSITY
  );

  // Wave 1 - main radiating pulse (from edge)
  const wave1 = std.add(
    std.mul(
      std.sin(
        std.sub(
          std.mul(edgeDist, WAVE_FREQUENCY),
          std.mul(std.mul(time, WAVE_SPEED), WAVE1_SPEED_MULT)
        )
      ),
      WAVE1_AMPLITUDE
    ),
    WAVE1_BASE
  );

  // Wave 2 - secondary pulse (from edge)
  const wave2 = std.add(
    std.mul(
      std.sin(
        std.add(
          std.sub(
            std.mul(edgeDist, std.mul(WAVE_FREQUENCY, WAVE2_FREQ_MULT)),
            std.mul(std.mul(time, WAVE_SPEED), WAVE2_SPEED_MULT)
          ),
          WAVE2_PHASE_OFFSET
        )
      ),
      WAVE2_AMPLITUDE
    ),
    WAVE2_BASE
  );

  // Combine waves
  const radiatingWave = std.add(
    std.mul(wave1, WAVE1_BLEND),
    std.mul(wave2, WAVE2_BLEND)
  );

  // Combine angular rays with radiating waves
  return std.add(
    std.mul(std.mul(rays, radiatingWave), RAY_WAVE_BLEND),
    std.mul(radiatingWave, WAVE_ONLY_BLEND)
  );
});

// Glow falloff function
const glowFalloff = tgpu.fn(
  [d.f32, d.f32],
  d.f32
)((dist, yolkRadius) => {
  "use gpu";
  const effectiveDist = std.max(0.0, std.sub(dist, yolkRadius));
  return std.exp(std.mul(std.neg(effectiveDist), GLOW_FALLOFF_RATE));
});

// Vertex shader in TypeScript
const vertexMain = tgpu["~unstable"].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: VertexOutput,
})((input) => {
  "use gpu";
  // Full-screen quad positions
  const positions = [
    d.vec2f(-1.0, -1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(-1.0, 1.0),
    d.vec2f(-1.0, 1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(1.0, 1.0),
  ];

  const uvs = [
    d.vec2f(0.0, 1.0),
    d.vec2f(1.0, 1.0),
    d.vec2f(0.0, 0.0),
    d.vec2f(0.0, 0.0),
    d.vec2f(1.0, 1.0),
    d.vec2f(1.0, 0.0),
  ];

  return {
    position: d.vec4f(
      positions[input.vertexIndex].x,
      positions[input.vertexIndex].y,
      0.0,
      1.0
    ),
    uv: uvs[input.vertexIndex],
  };
});

// Fragment shader in TypeScript
const fragmentMain = tgpu["~unstable"]
  .fragmentFn({
    in: { uv: d.vec2f },
    out: { color: d.vec4f },
  })((input) => {
    "use gpu";
    const uv = input.uv;

    // Sample original image
    const originalColor = std.textureSample(
      layout.bound.imageTexture.value,
      layout.bound.imageSampler.value,
      uv
    );

    // Access uniforms
    const uniforms = layout.bound.uniforms.value;

    // Calculate distance from yolk center with aspect ratio correction
    const toYolk = std.sub(uv, uniforms.yolkCenter);
    const correctedToYolk = d.vec2f(
      std.mul(toYolk.x, uniforms.aspectRatio),
      toYolk.y
    );
    const dist = std.length(correctedToYolk);

    // Calculate radiating sunburst rays (aspect-corrected UV)
    const correctedUV = d.vec2f(std.mul(uv.x, uniforms.aspectRatio), uv.y);
    const correctedCenter = d.vec2f(
      std.mul(uniforms.yolkCenter.x, uniforms.aspectRatio),
      uniforms.yolkCenter.y
    );
    const rayIntensity = radiatingRays(
      correctedUV,
      correctedCenter,
      uniforms.time,
      uniforms.rayCount,
      dist,
      uniforms.yolkRadius
    );

    // Calculate glow falloff
    const falloff = glowFalloff(dist, uniforms.yolkRadius);

    // Subtle overall pulse
    const pulse = std.add(
      std.mul(
        std.sin(std.mul(uniforms.time, OUTER_PULSE_FREQ)),
        OUTER_PULSE_AMPLITUDE
      ),
      OUTER_PULSE_BASE
    );

    // Mask: 0 inside yolk, 1 outside (hide glow inside yolk area)
    const outsideYolk = std.step(uniforms.yolkRadius, dist);

    // Combine ray pattern with falloff
    const glowStrength = std.mul(
      std.mul(
        std.mul(std.mul(rayIntensity, falloff), uniforms.glowIntensity),
        pulse
      ),
      outsideYolk
    );

    // Warm glow color contribution
    const glowContribution = std.mul(uniforms.glowColor, glowStrength);

    // Subtle bloom halo near yolk edge
    const bloomDist = std.max(0.0, std.sub(dist, uniforms.yolkRadius));
    const bloom = std.mul(
      std.mul(
        std.mul(
          std.exp(std.mul(std.neg(bloomDist), BLOOM_FALLOFF_RATE)),
          BLOOM_INTENSITY
        ),
        pulse
      ),
      outsideYolk
    );
    const bloomColor = std.mul(uniforms.glowColor, bloom);

    // Inner yolk glow - subtle pulsing luminosity inside the yolk
    const insideYolk = std.sub(1.0, outsideYolk);
    const innerPulse = std.add(
      std.mul(
        std.sin(std.mul(uniforms.time, INNER_GLOW_PULSE_SPEED)),
        INNER_GLOW_PULSE_AMOUNT
      ),
      std.sub(1.0, INNER_GLOW_PULSE_AMOUNT)
    );
    const innerGlow = std.mul(
      std.mul(INNER_GLOW_INTENSITY, innerPulse),
      insideYolk
    );
    const innerGlowColor = std.mul(uniforms.glowColor, innerGlow);

    // Final color
    return {
      color: d.vec4f(
        std.add(
          std.add(std.add(originalColor.x, glowContribution.x), bloomColor.x),
          innerGlowColor.x
        ),
        std.add(
          std.add(std.add(originalColor.y, glowContribution.y), bloomColor.y),
          innerGlowColor.y
        ),
        std.add(
          std.add(std.add(originalColor.z, glowContribution.z), bloomColor.z),
          innerGlowColor.z
        ),
        originalColor.w
      ),
    };
  })
  .$uses({ layout, radiatingRays, glowFalloff });

// ============================================================================
// REACT COMPONENT
// ============================================================================

export function SunburstGlow({ imageSrc, maxWidth = 800 }: SunburstGlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webGPUSupported, setWebGPUSupported] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    let destroyed = false;
    let root: Awaited<ReturnType<typeof tgpu.init>> | null = null;
    let animationId: number | null = null;

    async function init() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        if (!navigator.gpu) {
          setWebGPUSupported(false);
          setIsLoading(false);
          return;
        }

        // Load the image first
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

        // Initialize TypeGPU
        root = await tgpu.init();
        const device = root.device;

        if (destroyed) return;

        // Configure canvas
        const context = canvas.getContext("webgpu");
        if (!context) {
          throw new Error("Failed to get WebGPU context");
        }

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format: presentationFormat,
          alphaMode: "premultiplied",
        });

        // Create texture from image
        const imageTexture = root["~unstable"]
          .createTexture({
            size: [imageBitmap.width, imageBitmap.height],
            format: "rgba8unorm",
          })
          .$usage("sampled", "render");

        imageTexture.write(imageBitmap);

        // Create sampler
        const sampler = root["~unstable"].createSampler({
          magFilter: "linear",
          minFilter: "linear",
        });

        // Create uniform buffer
        const uniformBuffer = root.createBuffer(Uniforms).$usage("uniform");

        // Create texture view for shader binding
        const textureView = imageTexture.createView(textureSchema);

        // Create bind group
        const bindGroup = root.createBindGroup(layout, {
          uniforms: uniformBuffer,
          imageSampler: sampler,
          imageTexture: textureView,
        });

        // Create render pipeline using TypeGPU
        const pipeline = root["~unstable"]
          .withVertex(vertexMain, {})
          .withFragment(fragmentMain, { color: { format: presentationFormat } })
          .withPrimitive({ topology: "triangle-list" })
          .createPipeline();

        setIsLoading(false);

        // Animation loop
        const startTime = performance.now();

        function render() {
          if (destroyed || !root || !context) return;

          const currentTime = (performance.now() - startTime) / 1000;

          // Update uniforms
          uniformBuffer.write({
            time: currentTime,
            yolkCenter: d.vec2f(YOLK_CENTER_X, YOLK_CENTER_Y),
            yolkRadius: YOLK_RADIUS,
            rayCount: RAY_COUNT,
            glowIntensity: GLOW_INTENSITY,
            aspectRatio: imageAspect,
            glowColor: d.vec3f(GLOW_COLOR_R, GLOW_COLOR_G, GLOW_COLOR_B),
          });

          // Render using TypeGPU pipeline
          pipeline
            .with(bindGroup)
            .withColorAttachment({
              color: {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
              },
            })
            .draw(6);

          animationId = requestAnimationFrame(render);
        }

        render();
      } catch {
        setWebGPUSupported(false);
        setIsLoading(false);
      }
    }

    init();

    return () => {
      destroyed = true;
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      if (root) {
        root.destroy();
      }
    };
  }, [imageSrc, maxWidth]);

  // Fallback to plain image if WebGPU is not supported
  if (webGPUSupported === false) {
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
